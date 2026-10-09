import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import numpy as np
import torch
from sqlalchemy.orm import Session

from app.ml.deviation_layer import DeviationLayer
from app.ml.explainability import ExplainerEngine
from app.ml.moe_architecture import LateFusionNetwork
from app.models import RiskTier, SecurityAction, User, UserBehaviorBaseline
from app.services.baseline_store import BaselineStore

logger = logging.getLogger(__name__)

# Feature column order for ML model inference
FEATURE_NAMES = [
    # Behavioral (10)
    "z_flight_time", "z_dwell_time", "z_typing_speed",
    "z_mouse_velocity", "z_mouse_curvature", "z_mouse_jitter",
    "z_action_velocity", "raw_flight_time", "raw_dwell_time", "behavior_deviation_score",
    # Context (6)
    "is_new_ip", "is_new_location", "login_hour_deviation",
    "action_velocity_deviation", "raw_login_hour", "context_deviation_score",
    # Device (6)
    "device_hash_match", "consistency_scalar", "canvas_present",
    "webgl_present", "fonts_present", "device_deviation_score",
]


class RiskEngine:
    _model: Optional[LateFusionNetwork] = None

    @classmethod
    def get_model(cls) -> LateFusionNetwork:
        if cls._model is None:
            model = LateFusionNetwork()
            weights_path = Path(__file__).resolve().parent.parent / "ml" / "weights" / "moe_ato_detector.pt"
            if weights_path.exists():
                try:
                    model.load_state_dict(torch.load(weights_path, map_location=torch.device("cpu")))
                    model.eval()
                    logger.info("Successfully loaded pre-trained MoE ATO weights.")
                except Exception as e:
                    logger.error(f"Error loading MoE weights from {weights_path}: {e}")
            else:
                logger.warning(f"MoE weights not found at {weights_path}. Model using initialized weights.")
            cls._model = model
        return cls._model

    @classmethod
    def evaluate_session_risk(
        cls,
        db: Session,
        user_id: str,
        telemetry: Dict[str, Any],
        device_data: Dict[str, Any],
        ip_address: str,
        location: Optional[Dict[str, str]] = None,
        login_hour: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Executes full multi-stream ATO detection pipeline (FR-03, NFR-01, IR-05).
        Returns:
            - total_risk_score (0.0 to 1.0)
            - risk_tier (LOW, MEDIUM, HIGH)
            - action_taken (NO_ACTION, STEP_UP_MFA, TEMPORARILY_LOCK)
            - stream deviations (behavior, context, device)
            - SHAP feature importance & top risk drivers
            - evaluation_time_ms (< 300 ms)
        """
        start_time = time.time()
        location = location or {"city": "Local", "country": "US"}
        login_hour = login_hour if login_hour is not None else time.localtime().tm_hour

        try:
            # 1. Fetch historical baseline (Redis or DB fallback)
            baseline = BaselineStore.get_baseline(db, user_id)

            # 2. Comparison & Deviation Layer
            z_scores, behavior_dev = DeviationLayer.compute_behavioral_deviation(telemetry, baseline)

            context_raw = {
                "ip_address": ip_address,
                "location": location,
                "login_hour": login_hour,
                "action_velocity": telemetry.get("action_velocity", 2.2),
            }
            context_metrics, context_dev = DeviationLayer.compute_context_deviation(context_raw, baseline)

            device_traits, device_dev = DeviationLayer.compute_device_deviation(device_data, baseline)

            # 3. Construct Feature Vectors
            ks = telemetry.get("keystroke", {})
            raw_flight = float(ks.get("mean_flight_time", baseline.get("keystroke_mean_flight_time", 120.0)))
            raw_dwell = float(ks.get("mean_dwell_time", baseline.get("keystroke_mean_dwell_time", 85.0)))

            behavior_vec = np.array([
                z_scores["z_flight_time"],
                z_scores["z_dwell_time"],
                z_scores["z_typing_speed"],
                z_scores["z_mouse_velocity"],
                z_scores["z_mouse_curvature"],
                z_scores["z_mouse_jitter"],
                z_scores["z_action_velocity"],
                raw_flight,
                raw_dwell,
                behavior_dev,
            ], dtype=np.float32)

            context_vec = np.array([
                context_metrics["is_new_ip"],
                context_metrics["is_new_location"],
                context_metrics["login_hour_deviation"],
                context_metrics["action_velocity_deviation"],
                float(login_hour),
                context_dev,
            ], dtype=np.float32)

            device_vec = np.array([
                device_traits["device_hash_match"],
                device_traits["consistency_scalar"],
                device_traits["canvas_signature_present"],
                device_traits["webgl_signature_present"],
                device_traits["fonts_signature_present"],
                device_dev,
            ], dtype=np.float32)

            # 4. Neural MoE Inference
            model = cls.get_model()
            b_tensor = torch.tensor(behavior_vec, dtype=torch.float32).unsqueeze(0)
            c_tensor = torch.tensor(context_vec, dtype=torch.float32).unsqueeze(0)
            d_tensor = torch.tensor(device_vec, dtype=torch.float32).unsqueeze(0)

            with torch.no_grad():
                pred, embeddings = model(b_tensor, c_tensor, d_tensor)
                neural_risk = float(pred.item())

            # Fuse neural risk with physical deviation constraints to enforce strict boundary safety
            stream_max = max(behavior_dev, context_dev, device_dev)
            stream_mean = (behavior_dev * 0.35) + (context_dev * 0.35) + (device_dev * 0.30)
            heuristic_risk = 0.50 * stream_max + 0.50 * stream_mean
            total_risk = round(float(np.clip(0.60 * neural_risk + 0.40 * heuristic_risk, 0.0, 1.0)), 3)

            # 5. SHAP Interpretability & Feature Attributions (NFR-05)
            attributions = ExplainerEngine.compute_attributions(
                model=model,
                behavior_vec=behavior_vec,
                context_vec=context_vec,
                device_vec=device_vec,
                feature_names=FEATURE_NAMES,
                baseline_pred=0.15,
            )

            # 6. Decision Layer (FR-03 Risk Thresholds)
            # Low Risk: < 0.3
            # Medium Risk: 0.3 - 0.7
            # High Risk: > 0.7
            if total_risk > 0.70:
                risk_tier = RiskTier.HIGH
                action = SecurityAction.TEMPORARILY_LOCK
            elif total_risk >= 0.30:
                risk_tier = RiskTier.MEDIUM
                action = SecurityAction.STEP_UP_MFA
            else:
                risk_tier = RiskTier.LOW
                action = SecurityAction.NO_ACTION

            eval_time_ms = round((time.time() - start_time) * 1000, 2)

            return {
                "total_risk_score": total_risk,
                "risk_tier": risk_tier,
                "action_taken": action,
                "behavior_deviation_score": behavior_dev,
                "context_deviation_score": context_dev,
                "device_deviation_score": device_dev,
                "feature_contributions": attributions,
                "raw_telemetry_summary": {
                    "keystroke_z": z_scores,
                    "context_metrics": context_metrics,
                    "device_traits": device_traits,
                },
                "evaluation_time_ms": eval_time_ms,
            }

        except Exception as exc:
            # IR-05: If risk scoring model fails, return default risk score of 0.5 and log the error.
            logger.error(f"Critical error during session risk evaluation: {exc}", exc_info=True)
            eval_time_ms = round((time.time() - start_time) * 1000, 2)
            return {
                "total_risk_score": 0.50,
                "risk_tier": RiskTier.MEDIUM,
                "action_taken": SecurityAction.STEP_UP_MFA,
                "behavior_deviation_score": 0.50,
                "context_deviation_score": 0.50,
                "device_deviation_score": 0.50,
                "feature_contributions": {
                    "top_risk_factors": [{"display_name": "Fallback Model Safety Net", "impact": 0.5}],
                    "stream_contributions": {"behavioral": 0.17, "contextual": 0.17, "device": 0.16},
                },
                "raw_telemetry_summary": {"error": str(exc)},
                "evaluation_time_ms": eval_time_ms,
            }

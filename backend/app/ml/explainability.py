import numpy as np
import torch
from typing import Any, Dict, List, Tuple


class ExplainerEngine:
    """
    SHAP-compatible Local Interpretability & Feature Attribution Engine (NFR-05).
    Identifies which features most influence each risk prediction.
    """

    FEATURE_DISPLAY_NAMES = {
        "z_flight_time": "Keystroke Flight Time Deviation",
        "z_dwell_time": "Keystroke Dwell Time Deviation",
        "z_typing_speed": "Typing Speed Anomaly",
        "z_mouse_velocity": "Mouse Velocity Anomaly",
        "z_mouse_curvature": "Mouse Trajectory Curvature",
        "z_mouse_jitter": "Mouse Jitter / Tremor",
        "z_action_velocity": "Action Velocity Spike",
        "behavior_deviation_score": "Behavioral Stream Aggregate",
        "is_new_ip": "Unrecognized IP Address",
        "is_new_location": "Unusual Geographic Location",
        "login_hour_deviation": "Off-Hour Login Time",
        "action_velocity_deviation": "Context Action Velocity",
        "context_deviation_score": "Contextual Stream Aggregate",
        "device_hash_match": "Device Signature Mismatch",
        "consistency_scalar": "Hardware Trait Inconsistency",
        "canvas_present": "Canvas Fingerprint Artifacts",
        "webgl_present": "WebGL Shader Parameters",
        "fonts_present": "Installed Fonts Profile",
        "device_deviation_score": "Device Stream Aggregate",
    }

    @classmethod
    def compute_attributions(
        cls,
        model: Any,
        behavior_vec: np.ndarray,
        context_vec: np.ndarray,
        device_vec: np.ndarray,
        feature_names: List[str],
        baseline_pred: float = 0.15,
    ) -> Dict[str, Any]:
        """
        Calculates local feature attributions using gradient-weighted perturbation
        (Kernel / Integrated Gradients SHAP approximation for neural networks).
        Returns:
            summary: top risk factors with positive and negative impact
            feature_contributions: mapping of feature name -> importance value
            stream_contributions: breakdown by Behavioral, Contextual, Device
        """
        # Ensure 2D arrays
        b_t = torch.tensor(behavior_vec, dtype=torch.float32)
        c_t = torch.tensor(context_vec, dtype=torch.float32)
        d_t = torch.tensor(device_vec, dtype=torch.float32)

        if b_t.dim() == 1:
            b_t = b_t.unsqueeze(0)
        if c_t.dim() == 1:
            c_t = c_t.unsqueeze(0)
        if d_t.dim() == 1:
            d_t = d_t.unsqueeze(0)

        b_t.requires_grad_(True)
        c_t.requires_grad_(True)
        d_t.requires_grad_(True)

        model.eval()
        pred, _ = model(b_t, c_t, d_t)
        current_score = float(pred.item())

        # Backpropagate to compute input gradients
        pred.backward()

        # Feature attributions: input * gradient (Shapley Taylor / Integrated Gradients approximation)
        b_attr = (b_t.grad.data.numpy()[0] * behavior_vec).tolist()
        c_attr = (c_t.grad.data.numpy()[0] * context_vec).tolist()
        d_attr = (d_t.grad.data.numpy()[0] * device_vec).tolist()

        raw_attributions = b_attr + c_attr + d_attr

        # Scale contributions so their sum approximates (current_score - baseline_pred)
        total_delta = current_score - baseline_pred
        sum_raw = sum(abs(v) for v in raw_attributions) + 1e-6
        normalized_attributions = {}

        for name, raw_val in zip(feature_names, raw_attributions):
            importance = round((raw_val / sum_raw) * total_delta, 4)
            normalized_attributions[name] = importance

        # Stream contributions
        b_stream_total = round(sum(normalized_attributions.get(k, 0.0) for k in feature_names[:10]), 3)
        c_stream_total = round(sum(normalized_attributions.get(k, 0.0) for k in feature_names[10:16]), 3)
        d_stream_total = round(sum(normalized_attributions.get(k, 0.0) for k in feature_names[16:]), 3)

        # Ranked list of top positive contributors (risk drivers)
        ranked = sorted(
            [
                {
                    "feature": k,
                    "display_name": cls.FEATURE_DISPLAY_NAMES.get(k, k),
                    "impact": v,
                    "direction": "INCREASES_RISK" if v > 0 else "DECREASES_RISK",
                }
                for k, v in normalized_attributions.items()
            ],
            key=lambda x: abs(x["impact"]),
            reverse=True,
        )

        return {
            "current_score": round(current_score, 3),
            "baseline_score": round(baseline_pred, 3),
            "top_risk_factors": ranked[:6],
            "stream_contributions": {
                "behavioral": b_stream_total,
                "contextual": c_stream_total,
                "device": d_stream_total,
            },
            "feature_attributions": normalized_attributions,
        }

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.ml.train_evaluate import train_and_evaluate_model
from app.models import (
    AdminOverride,
    OverrideAction,
    RiskLog,
    RiskTier,
    SecurityAction,
    SessionStatus,
    User,
    UserRole,
    UserSession,
    UserStatus,
)
from app.schemas import (
    AdminOverrideRequest,
    AdminOverrideResponse,
    FlaggedSessionItem,
    ModelMetricsResponse,
)
from app.services.risk_engine import RiskEngine

router = APIRouter(prefix="/admin", tags=["Administrator Security Operations"])


@router.get("/flagged-sessions", response_model=List[FlaggedSessionItem])
def get_flagged_sessions(
    tier: Optional[RiskTier] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Any:
    """
    FR-06, NFR-03: Examines flagged sessions for security review.
    """
    query = db.query(RiskLog).join(User, RiskLog.user_id == User.user_id)
    if tier:
        query = query.filter(RiskLog.risk_tier == tier)
    else:
        # Default: show Medium and High risk
        query = query.filter(RiskLog.risk_tier.in_([RiskTier.MEDIUM, RiskTier.HIGH]))

    logs = query.order_by(RiskLog.created_at.desc()).limit(limit).all()

    items = []
    for log in logs:
        # Check if already overridden
        override = db.query(AdminOverride).filter(AdminOverride.risk_log_id == log.risk_id).first()
        items.append(
            FlaggedSessionItem(
                risk_id=log.risk_id,
                user_id=log.user_id,
                email=log.user.email if log.user else "Unknown",
                session_id=log.session_id,
                total_risk_score=log.total_risk_score,
                risk_tier=log.risk_tier,
                action_taken=log.action_taken,
                behavior_deviation_score=log.behavior_deviation_score,
                context_deviation_score=log.context_deviation_score,
                device_deviation_score=log.device_deviation_score,
                ip_address=log.ip_address,
                geolocation=log.geolocation or {},
                feature_contributions=log.feature_contributions or {},
                created_at=log.created_at,
                overridden=bool(override is not None),
                override_action=override.action_taken if override else None,
            )
        )
    return items


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Any:
    """
    FR-06: Comprehensive risk scoring and decision audit logs.
    """
    logs = (
        db.query(RiskLog)
        .order_by(RiskLog.created_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for log in logs:
        override = db.query(AdminOverride).filter(AdminOverride.risk_log_id == log.risk_id).first()
        result.append({
            "risk_id": str(log.risk_id),
            "user_id": str(log.user_id),
            "email": log.user.email if log.user else "Unknown",
            "session_id": str(log.session_id) if log.session_id else None,
            "total_risk_score": log.total_risk_score,
            "risk_tier": log.risk_tier.value,
            "action_taken": log.action_taken.value,
            "deviations": {
                "behavior": log.behavior_deviation_score,
                "context": log.context_deviation_score,
                "device": log.device_deviation_score,
            },
            "ip_address": log.ip_address,
            "geolocation": log.geolocation,
            "feature_contributions": log.feature_contributions,
            "created_at": log.created_at.isoformat(),
            "override": {
                "action": override.action_taken.value,
                "reason": override.reason,
                "overridden_at": override.overridden_at.isoformat(),
            } if override else None,
        })
    return result


@router.post("/override", response_model=AdminOverrideResponse)
def override_risk_decision(
    req: AdminOverrideRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Any:
    """
    FR-06: Manually override automated risk decisions and security actions.
    Actions:
      - APPROVE_SESSION: sets session status to ACTIVE
      - UNLOCK_ACCOUNT: restores locked user to ACTIVE
      - FORCE_MFA: demands step-up challenge
      - FLAG_FALSE_POSITIVE / FLAG_TRUE_POSITIVE: flags for model retraining
    """
    risk_log = db.query(RiskLog).filter(RiskLog.risk_id == req.risk_log_id).first()
    if not risk_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk log not found.")

    target_user = db.query(User).filter(User.user_id == risk_log.user_id).first()

    # Execute physical override action
    if req.action_taken == OverrideAction.UNLOCK_ACCOUNT and target_user:
        target_user.status = UserStatus.ACTIVE
    elif req.action_taken == OverrideAction.APPROVE_SESSION:
        if target_user:
            target_user.status = UserStatus.ACTIVE
        if risk_log.session_id:
            user_session = db.query(UserSession).filter(UserSession.session_id == risk_log.session_id).first()
            if user_session:
                user_session.status = SessionStatus.ACTIVE
    elif req.action_taken == OverrideAction.OVERRIDE_SCORE:
        if req.new_risk_score is not None:
            risk_log.total_risk_score = round(req.new_risk_score, 3)

    override = AdminOverride(
        risk_log_id=risk_log.risk_id,
        admin_id=admin.user_id,
        action_taken=req.action_taken,
        reason=req.reason,
        new_risk_score=req.new_risk_score,
    )
    db.add(override)
    db.commit()
    db.refresh(override)

    return override


@router.get("/model-metrics", response_model=ModelMetricsResponse)
def get_model_metrics(
    admin: User = Depends(get_current_admin),
) -> Any:
    """
    NFR-04, NFR-05: Returns held-out test set performance metrics:
    TPR, FPR, Precision, Recall, F1-Score, AUC-ROC, Confusion Matrix.
    """
    metrics_path = Path(__file__).resolve().parent.parent / "ml" / "weights" / "metrics_report.json"
    if not metrics_path.exists():
        # Train and generate if missing
        report = train_and_evaluate_model()
        return report

    with open(metrics_path, "r") as f:
        data = json.load(f)
    return data


@router.post("/retrain")
def retrain_model(
    admin: User = Depends(get_current_admin),
) -> Any:
    """
    Triggers model retraining incorporating recent baseline adjustments and overrides.
    """
    report = train_and_evaluate_model()
    # Reset in-memory model in RiskEngine to reload fresh weights
    RiskEngine._model = None
    return {"message": "Model retraining completed successfully.", "metrics": report}

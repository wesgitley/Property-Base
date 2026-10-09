import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import RiskLog, User, UserBehaviorBaseline, UserDevice, UserSession
from app.schemas import UserResponse
from app.services.email_service import generate_backup_codes, hash_secret_code

router = APIRouter(prefix="/users", tags=["Users Profile & Security"])


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> Any:
    """Get profile information for the authenticated user."""
    return current_user


@router.get("/me/security")
def get_user_security_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns seller's security dashboard: active devices, baseline parameters,
    recent login risk assessments, and remaining backup codes count.
    """
    devices = (
        db.query(UserDevice)
        .filter(UserDevice.user_id == current_user.user_id)
        .order_by(UserDevice.last_seen_at.desc())
        .all()
    )

    recent_logs = (
        db.query(RiskLog)
        .filter(RiskLog.user_id == current_user.user_id)
        .order_by(RiskLog.created_at.desc())
        .limit(10)
        .all()
    )

    baseline = (
        db.query(UserBehaviorBaseline)
        .filter(UserBehaviorBaseline.user_id == current_user.user_id)
        .first()
    )

    return {
        "user_id": str(current_user.user_id),
        "email": current_user.email,
        "status": current_user.status.value,
        "role": current_user.role.value,
        "mfa_enabled": current_user.mfa_enabled,
        "backup_codes_remaining": len(current_user.backup_codes or []),
        "devices": [
            {
                "device_id": str(d.device_id),
                "device_name": d.device_name,
                "is_trusted": d.is_trusted,
                "os_platform": d.os_platform,
                "browser_engine": d.browser_engine,
                "last_seen_at": d.last_seen_at.isoformat(),
            }
            for d in devices
        ],
        "recent_activity": [
            {
                "risk_id": str(l.risk_id),
                "total_risk_score": l.total_risk_score,
                "risk_tier": l.risk_tier.value,
                "action_taken": l.action_taken.value,
                "ip_address": l.ip_address,
                "geolocation": l.geolocation,
                "created_at": l.created_at.isoformat(),
            }
            for l in recent_logs
        ],
        "behavior_baseline": {
            "mean_flight_time": baseline.keystroke_mean_flight_time if baseline else 120.0,
            "mean_dwell_time": baseline.keystroke_mean_dwell_time if baseline else 85.0,
            "mean_typing_wpm": baseline.keystroke_mean_speed_wpm if baseline else 62.0,
            "mean_mouse_velocity": baseline.mouse_mean_velocity if baseline else 450.0,
            "sample_count": baseline.sample_count if baseline else 1,
            "typical_login_hours": baseline.typical_login_hours if baseline else [9, 10, 11, 12, 13, 14, 15, 16, 17],
        } if baseline else None,
    }


@router.post("/me/generate-backup-codes")
def generate_new_backup_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """FR-05: Generates a new batch of 8 single-use recovery codes."""
    raw_codes = generate_backup_codes(count=8)
    hashed_codes = [hash_secret_code(c) for c in raw_codes]

    current_user.backup_codes = hashed_codes
    db.commit()

    return {
        "message": "Generated 8 new backup recovery codes. Store them safely.",
        "backup_codes": raw_codes,
    }


@router.post("/me/devices/{device_id}/trust")
def toggle_device_trust(
    device_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Marks a device as trusted or untrusted."""
    device = (
        db.query(UserDevice)
        .filter(UserDevice.device_id == device_id, UserDevice.user_id == current_user.user_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    device.is_trusted = not device.is_trusted
    db.commit()

    return {
        "device_id": str(device.device_id),
        "is_trusted": device.is_trusted,
        "message": f"Device is now {'trusted' if device.is_trusted else 'untrusted'}.",
    }

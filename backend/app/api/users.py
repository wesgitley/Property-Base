import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    MFAOTP,
    RiskLog,
    RiskTier,
    SecurityAction,
    User,
    UserBackupCode,
    UserBehaviorBaseline,
    UserDevice,
    UserSession,
    UserStatus,
)
from app.schemas import UserResponse
from app.services.email_service import (
    SimulatedMailbox,
    generate_backup_codes,
    generate_otp_code,
    hash_secret_code,
)

router = APIRouter(prefix="/users", tags=["Users Profile & Security"])


class ActionVerifyRequest(BaseModel):
    method: str = "backup"  # "backup" | "email_otp"
    code: str
    action_type: str = "SENSITIVE_ACTION"  # "EDIT_LISTING" | "DELETE_LISTING" | "UPDATE_PROFILE"
    target_label: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    mobile_number: Optional[str] = None


def _count_unused_backup_codes(db: Session, user: User) -> int:
    total_table_rows = (
        db.query(UserBackupCode)
        .filter(UserBackupCode.user_id == user.user_id)
        .count()
    )
    if total_table_rows > 0:
        return (
            db.query(UserBackupCode)
            .filter(UserBackupCode.user_id == user.user_id, UserBackupCode.is_used == False)
            .count()
        )
    return len(user.backup_codes or [])


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

    unused_count = _count_unused_backup_codes(db, current_user)

    return {
        "user_id": str(current_user.user_id),
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "username": current_user.username,
        "mobile_number": current_user.mobile_number,
        "status": current_user.status.value if hasattr(current_user.status, "value") else str(current_user.status),
        "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        "mfa_enabled": current_user.mfa_enabled,
        "backup_codes_remaining": unused_count,
        "devices": [
            {
                "device_id": str(d.device_id),
                "device_name": d.device_name,
                "is_trusted": d.is_trusted,
                "os_platform": d.os_platform,
                "browser_engine": d.browser_engine,
                "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
            }
            for d in devices
        ],
        "recent_activity": [
            {
                "risk_id": str(l.risk_id),
                "total_risk_score": l.total_risk_score,
                "risk_tier": l.risk_tier.value if hasattr(l.risk_tier, "value") else str(l.risk_tier),
                "action_taken": l.action_taken.value if hasattr(l.action_taken, "value") else str(l.action_taken),
                "ip_address": l.ip_address,
                "geolocation": l.geolocation,
                "created_at": l.created_at.isoformat() if l.created_at else None,
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
    """FR-05: Generates a new batch of 8 single-use recovery codes and syncs UserBackupCode table."""
    raw_codes = generate_backup_codes(count=8)
    hashed_codes = [hash_secret_code(c) for c in raw_codes]

    # Mark any previous unused codes in UserBackupCode as used
    now = datetime.now(timezone.utc)
    db.query(UserBackupCode).filter(
        UserBackupCode.user_id == current_user.user_id,
        UserBackupCode.is_used == False,
    ).update({"is_used": True, "used_at": now})

    for h_code in hashed_codes:
        db.add(
            UserBackupCode(
                user_id=current_user.user_id,
                code_hash=h_code,
                is_used=False,
            )
        )

    current_user.backup_codes = hashed_codes
    db.commit()

    return {
        "message": "Generated 8 new single-use backup codes. Store them safely.",
        "backup_codes": raw_codes,
        "backup_codes_remaining": 8,
    }


@router.post("/me/action-mfa/send-email-otp")
def send_action_verification_email_otp(
    payload: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Sends a 6-digit verification code directly to the authenticated user's registered email
    (without asking the user to enter their email address) for step-up verification
    before editing/deleting a property listing or modifying My Profile details.
    """
    now = datetime.now(timezone.utc)
    otp_code = generate_otp_code(6)
    hashed_otp = hash_secret_code(otp_code)

    action_label = "sensitive account or listing modification"
    if payload and payload.get("action_type"):
        act = str(payload.get("action_type")).upper()
        if act == "EDIT_LISTING":
            action_label = "editing a property listing"
        elif act == "DELETE_LISTING":
            action_label = "deleting a property listing"
        elif act == "UPDATE_PROFILE":
            action_label = "modifying your personal profile details"

    otp_entry = MFAOTP(
        user_id=current_user.user_id,
        otp_code_hash=hashed_otp,
        attempts=0,
        is_used=False,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(otp_entry)
    db.commit()

    dispatch_res = SimulatedMailbox.send_email(
        to_email=current_user.email,
        subject="Property Base - Security Verification Code for Account Action",
        body_text=(
            f"Hello {current_user.first_name or current_user.username or 'Seller'},\n\n"
            f"A security verification was requested on your Property Base account for {action_label}.\n\n"
            f"Your 6-digit verification code is: {otp_code}\n\n"
            f"This code expires in 10 minutes. If you did not initiate this action, someone may be attempting "
            f"an Account Takeover (ATO) — please secure your account immediately."
        ),
        category="ACTION_VERIFICATION_OTP",
        payload_data={"otp_code": otp_code, "email": current_user.email, "action": action_label},
    )

    resp: Dict[str, Any] = {
        "status": "success",
        "email": current_user.email,
        "message": f"A 6-digit verification code has been sent to your registered email ({current_user.email}).",
        "expires_in": "10 minutes",
    }
    if not dispatch_res.get("smtp_sent"):
        resp["dev_code"] = otp_code
    return resp


def _record_ato_verification_failure(
    db: Session,
    user: User,
    request: Request,
    action_type: str,
    method: str,
    target_label: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Records a failed step-up identity verification attempt and logs a RiskLog entry
    so Account Takeover (ATO) indicators are surfaced in the SOC Admin Control Room.
    """
    now = datetime.now(timezone.utc)
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    failures = user.failed_login_attempts

    client_ip = request.client.host if request.client else "127.0.0.1"
    is_high_risk = failures >= 3

    risk_score = min(0.96, 0.52 + (failures * 0.14))
    risk_tier = RiskTier.HIGH if is_high_risk else RiskTier.MEDIUM
    security_action = SecurityAction.TEMPORARILY_LOCK if failures >= 5 else SecurityAction.STEP_UP_MFA

    action_display = {
        "EDIT_LISTING": "Unauthorized Property Listing Edit Attempt",
        "DELETE_LISTING": "Unauthorized Property Listing Deletion Attempt",
        "UPDATE_PROFILE": "Unauthorized Personal Profile Modification Attempt",
    }.get(action_type, f"Failed Step-Up Verification ({action_type})")

    risk_log = RiskLog(
        user_id=user.user_id,
        session_id=None,
        total_risk_score=round(risk_score, 3),
        risk_tier=risk_tier,
        action_taken=security_action,
        behavior_deviation_score=round(min(0.95, 0.45 + failures * 0.12), 3),
        context_deviation_score=round(min(0.90, 0.35 + failures * 0.10), 3),
        device_deviation_score=0.25,
        feature_contributions={
            "top_risk_factors": [
                {
                    "feature": "step_up_mfa_failure",
                    "display_name": f"{action_display} via {method.upper()} (Attempt #{failures})",
                    "impact": round(0.35 + failures * 0.10, 2),
                    "direction": "INCREASES_RISK",
                },
                {
                    "feature": "post_auth_ato_indicator",
                    "display_name": f"Target: {target_label or action_type}",
                    "impact": 0.25,
                    "direction": "INCREASES_RISK",
                },
            ],
            "stream_contributions": {
                "behavioral": round(min(0.95, 0.45 + failures * 0.12), 2),
                "contextual": round(min(0.90, 0.35 + failures * 0.10), 2),
                "device": 0.25,
            },
        },
        raw_telemetry_summary={
            "event": "POST_AUTH_STEP_UP_FAILURE",
            "action_type": action_type,
            "verification_method": method,
            "target_label": target_label,
            "consecutive_failures": failures,
        },
        ip_address=client_ip,
        geolocation={"city": "Nairobi", "country": "KE"},
    )
    db.add(risk_log)

    locked = False
    if failures >= 5:
        user.status = UserStatus.LOCKED
        user.locked_until = now + timedelta(minutes=15)
        locked = True

    db.commit()

    return {
        "failures": failures,
        "remaining_attempts": max(0, 5 - failures),
        "risk_score": round(risk_score, 2),
        "risk_tier": risk_tier.value,
        "locked": locked,
    }


class ActionFailureReportRequest(BaseModel):
    action_type: str = "EDIT_LISTING"
    method: str = "listing_backup_code"
    target_label: Optional[str] = None


@router.post("/me/action-mfa/record-failure")
def record_action_verification_failure(
    req: ActionFailureReportRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Records a failed listing backup code verification attempt in RiskLog so
    Account Takeover (ATO) indicators are surfaced in the SOC Admin Control Room.
    """
    ato_info = _record_ato_verification_failure(
        db=db,
        user=current_user,
        request=request,
        action_type=req.action_type,
        method=req.method,
        target_label=req.target_label,
    )
    if ato_info["locked"]:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                "Potential Account Takeover (ATO) detected! Account has been temporarily locked "
                "due to 5 failed identity verification attempts."
            ),
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            f"Invalid or already used listing backup code for \"{req.target_label or 'this listing'}\". "
            f"ATO Risk Alert logged ({ato_info['remaining_attempts']} attempt(s) remaining before account lock). "
            f"If you do not have your listing backup codes, click 'Verify via Email' to receive a code on {current_user.email}."
        ),
    )


@router.post("/me/action-mfa/verify")
def verify_action_step_up_mfa(
    req: ActionVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Verifies seller identity using either a single-use Backup Code or an Email OTP code
    before permitting sensitive actions (View & Edit listing, Delete listing, or Modify Profile).
    Detects potential Account Takeover (ATO) on failed verification attempts.
    """
    now = datetime.now(timezone.utc)
    clean_code = (req.code or "").strip().upper()
    if not clean_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid verification code.",
        )

    method = (req.method or "backup").lower()
    hashed_input = hash_secret_code(clean_code)

    if method == "backup":
        backup_record = (
            db.query(UserBackupCode)
            .filter(
                UserBackupCode.user_id == current_user.user_id,
                UserBackupCode.code_hash == hashed_input,
                UserBackupCode.is_used == False,
            )
            .first()
        )

        matched = False
        if backup_record:
            backup_record.is_used = True
            backup_record.used_at = now
            legacy_codes = list(current_user.backup_codes or [])
            if hashed_input in legacy_codes:
                legacy_codes.remove(hashed_input)
                current_user.backup_codes = legacy_codes
            matched = True
        else:
            legacy_codes = list(current_user.backup_codes or [])
            if hashed_input in legacy_codes:
                legacy_codes.remove(hashed_input)
                current_user.backup_codes = legacy_codes
                db.add(
                    UserBackupCode(
                        user_id=current_user.user_id,
                        code_hash=hashed_input,
                        is_used=True,
                        used_at=now,
                    )
                )
                matched = True

        if not matched:
            ato_info = _record_ato_verification_failure(
                db=db,
                user=current_user,
                request=request,
                action_type=req.action_type,
                method="backup_code",
                target_label=req.target_label,
            )
            if ato_info["locked"]:
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=(
                        "Potential Account Takeover (ATO) detected! Account has been temporarily locked "
                        "due to 5 failed identity verification attempts."
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    f"Invalid or already used backup code. ATO Risk Alert logged "
                    f"({ato_info['remaining_attempts']} attempt(s) remaining before account lock). "
                    f"If you do not have your backup codes, click 'Verify via Email Instead'."
                ),
            )

        # Reset failure counter on success
        current_user.failed_login_attempts = 0
        db.commit()

        # Check remaining backup codes and auto-refill if depleted
        remaining_unused = _count_unused_backup_codes(db, current_user)
        new_generated_codes = None
        if remaining_unused == 0:
            raw_new_codes = generate_backup_codes(count=8)
            hashed_new_codes = [hash_secret_code(c) for c in raw_new_codes]
            for h_code in hashed_new_codes:
                db.add(
                    UserBackupCode(
                        user_id=current_user.user_id,
                        code_hash=h_code,
                        is_used=False,
                    )
                )
            current_user.backup_codes = hashed_new_codes
            db.commit()
            new_generated_codes = raw_new_codes
            remaining_unused = 8

        return {
            "status": "verified",
            "method": "backup",
            "action_type": req.action_type,
            "backup_codes_remaining": remaining_unused,
            "new_backup_codes": new_generated_codes,
            "message": "Identity verified via single-use backup code.",
        }

    elif method == "email_otp":
        otp_record = (
            db.query(MFAOTP)
            .filter(
                MFAOTP.user_id == current_user.user_id,
                MFAOTP.is_used == False,
                MFAOTP.expires_at > now,
            )
            .order_by(MFAOTP.created_at.desc())
            .first()
        )

        if not otp_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active email verification code found or code has expired. Please click 'Send Verification Code to Email'.",
            )

        otp_record.attempts += 1
        if otp_record.otp_code_hash != hashed_input:
            if otp_record.attempts >= 5:
                otp_record.is_used = True
            ato_info = _record_ato_verification_failure(
                db=db,
                user=current_user,
                request=request,
                action_type=req.action_type,
                method="email_otp",
                target_label=req.target_label,
            )
            if ato_info["locked"]:
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=(
                        "Potential Account Takeover (ATO) detected! Account has been temporarily locked "
                        "due to excessive failed identity verification attempts."
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    f"Incorrect email verification code. ATO Risk Alert logged "
                    f"({ato_info['remaining_attempts']} attempt(s) remaining before account lock)."
                ),
            )

        otp_record.is_used = True
        current_user.failed_login_attempts = 0
        db.commit()

        remaining_unused = _count_unused_backup_codes(db, current_user)
        new_generated_codes = None
        if remaining_unused == 0 and req.action_type == "UPDATE_PROFILE":
            raw_new_codes = generate_backup_codes(count=8)
            hashed_new_codes = [hash_secret_code(c) for c in raw_new_codes]
            for h_code in hashed_new_codes:
                db.add(
                    UserBackupCode(
                        user_id=current_user.user_id,
                        code_hash=h_code,
                        is_used=False,
                    )
                )
            current_user.backup_codes = hashed_new_codes
            db.commit()
            new_generated_codes = raw_new_codes
            remaining_unused = 8

        return {
            "status": "verified",
            "method": "email_otp",
            "action_type": req.action_type,
            "backup_codes_remaining": remaining_unused,
            "new_backup_codes": new_generated_codes,
            "message": f"Identity verified via registered email ({current_user.email}).",
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported verification method. Use 'backup' or 'email_otp'.",
        )


@router.put("/me/profile")
def update_user_profile(
    req: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Updates the authenticated user's personal profile details in PostgreSQL
    after step-up identity verification has succeeded.
    """
    if req.username is not None and req.username.strip():
        clean_username = req.username.strip()
        existing_u = (
            db.query(User)
            .filter(
                func.lower(User.username) == clean_username.lower(),
                User.user_id != current_user.user_id,
            )
            .first()
        )
        if existing_u:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That username is already taken by another user.",
            )
        current_user.username = clean_username

    if req.first_name is not None:
        current_user.first_name = req.first_name.strip()
    if req.last_name is not None:
        current_user.last_name = req.last_name.strip()
    if req.mobile_number is not None:
        current_user.mobile_number = req.mobile_number.strip()

    db.commit()
    db.refresh(current_user)

    return {
        "status": "success",
        "message": "Your personal profile details have been securely updated.",
        "user": {
            "user_id": str(current_user.user_id),
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "username": current_user.username,
            "email": current_user.email,
            "mobile_number": current_user.mobile_number,
            "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            "status": current_user.status.value if hasattr(current_user.status, "value") else str(current_user.status),
        },
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


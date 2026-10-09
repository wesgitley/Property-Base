import hashlib
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.models import (
    MFAChallenge,
    MFAChannel,
    RiskLog,
    RiskTier,
    SecurityAction,
    SessionStatus,
    User,
    UserDevice,
    UserRole,
    UserSession,
    UserStatus,
)
from app.schemas import (
    BackupCodeVerifyRequest,
    BiometricLivenessVerifyRequest,
    MFAResendRequest,
    MFAVerifyRequest,
    RequestRecoveryLink,
    RiskAssessmentResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyRecoveryLink,
)
from app.services.baseline_store import BaselineStore
from app.services.email_service import (
    SimulatedMailbox,
    generate_backup_codes,
    generate_otp_code,
    hash_secret_code,
)
from app.services.risk_engine import RiskEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: Session = Depends(get_db)) -> Any:
    """
    FR-01, FR-05: Registers a new property seller or admin, generates secure backup codes,
    and initializes behavioral baseline.
    """
    existing_user = db.query(User).filter(User.email == user_in.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # Generate 8 single-use backup recovery codes (FR-05)
    raw_backup_codes = generate_backup_codes(count=8)
    hashed_backup_codes = [hash_secret_code(code) for code in raw_backup_codes]

    user = User(
        email=user_in.email.lower(),
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role or UserRole.SELLER,
        status=UserStatus.ACTIVE,
        mfa_enabled=True,
        backup_codes=hashed_backup_codes,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Initialize baseline store (Redis / DB fallback)
    BaselineStore.get_baseline(db, str(user.user_id))

    # Send welcome email via simulated local mailbox
    SimulatedMailbox.send_email(
        to_email=user.email,
        subject="Welcome to PropertyBase - Account Created",
        body_text=f"Your account has been registered. Keep your backup recovery codes safe.",
        category="ACCOUNT_NOTICE",
        payload_data={"backup_codes": raw_backup_codes},
    )

    resp = UserResponse.from_orm(user)
    # Include raw backup codes once on registration
    resp.backup_codes = raw_backup_codes
    return resp


@router.post("/login", response_model=TokenResponse)
def login(request: Request, login_in: UserLogin, db: Session = Depends(get_db)) -> Any:
    """
    FR-01, FR-02, FR-03, FR-04:
    Multi-stream ATO risk scoring and adaptive access control.
    """
    user = db.query(User).filter(User.email == login_in.email.lower()).first()
    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials.",
        )

    if user.status == UserStatus.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is temporarily locked due to high-risk activity. Complete account recovery.",
        )

    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Unknown-Browser")

    # 1. Device Registration / Lookup (salted hash DR-02)
    device_data = login_in.device.dict()
    salted_device_hash = hash_secret_code(f"salt_{user.user_id}_{device_data['device_hash']}")

    device = (
        db.query(UserDevice)
        .filter(UserDevice.user_id == user.user_id, UserDevice.device_hash == salted_device_hash)
        .first()
    )
    if not device:
        # Check if user has any existing devices
        existing_device_count = db.query(UserDevice).filter(UserDevice.user_id == user.user_id).count()
        # First device for account is considered trusted
        is_first_device = (existing_device_count == 0)

        device = UserDevice(
            user_id=user.user_id,
            device_hash=salted_device_hash,
            device_name=f"{device_data.get('os_platform', 'Device')} ({device_data.get('browser_engine', 'Browser')})",
            canvas_hash=device_data.get("canvas_hash"),
            webgl_hash=device_data.get("webgl_hash"),
            fonts_hash=device_data.get("fonts_hash"),
            os_platform=device_data.get("os_platform"),
            browser_engine=device_data.get("browser_engine"),
            is_trusted=is_first_device,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    else:
        device.last_seen_at = datetime.now(timezone.utc)
        db.commit()

    # 2. Real-Time Risk Assessment (FR-03, NFR-01)
    telemetry_dict = login_in.telemetry.dict() if login_in.telemetry else {}
    risk_result = RiskEngine.evaluate_session_risk(
        db=db,
        user_id=str(user.user_id),
        telemetry=telemetry_dict,
        device_data=device_data,
        ip_address=client_ip,
        location=login_in.location,
        login_hour=login_in.login_hour,
    )

    total_risk = risk_result["total_risk_score"]
    risk_tier = risk_result["risk_tier"]
    action_taken = risk_result["action_taken"]

    # 3. Create Session Record
    session_id = uuid.uuid4()
    session_status = SessionStatus.ACTIVE
    if action_taken == SecurityAction.STEP_UP_MFA:
        session_status = SessionStatus.MFA_REQUIRED
    elif action_taken == SecurityAction.TEMPORARILY_LOCK:
        session_status = SessionStatus.LOCKED

    # Session token jti
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=30)  # NFR-03: 30 minutes
    temp_token, jti = create_access_token(
        subject=str(user.user_id),
        session_id=str(session_id),
        role=user.role.value,
    )

    user_session = UserSession(
        session_id=session_id,
        user_id=user.user_id,
        token_jti=jti,
        ip_address=client_ip,
        user_agent=user_agent,
        device_id=device.device_id,
        status=session_status,
        expires_at=expires_at,
    )
    db.add(user_session)
    db.commit()

    # 4. Record Audit Risk Log (FR-06)
    risk_log = RiskLog(
        user_id=user.user_id,
        session_id=session_id,
        total_risk_score=total_risk,
        risk_tier=risk_tier,
        action_taken=action_taken,
        behavior_deviation_score=risk_result["behavior_deviation_score"],
        context_deviation_score=risk_result["context_deviation_score"],
        device_deviation_score=risk_result["device_deviation_score"],
        feature_contributions=risk_result["feature_contributions"],
        raw_telemetry_summary=risk_result["raw_telemetry_summary"],
        ip_address=client_ip,
        geolocation=login_in.location or {"city": "Unknown", "country": "US"},
    )
    db.add(risk_log)
    db.commit()

    # 5. Adaptive Security Action Routing (FR-04)
    risk_response = RiskAssessmentResponse(
        total_risk_score=total_risk,
        risk_tier=risk_tier,
        action_taken=action_taken,
        behavior_deviation_score=risk_result["behavior_deviation_score"],
        context_deviation_score=risk_result["context_deviation_score"],
        device_deviation_score=risk_result["device_deviation_score"],
        evaluation_time_ms=risk_result["evaluation_time_ms"],
        feature_contributions=risk_result["feature_contributions"],
    )

    # CASE A: Low Risk (< 0.3) -> Seamless Login
    if action_taken == SecurityAction.NO_ACTION:
        # Update user baseline with authentic session telemetry
        BaselineStore.update_baseline_with_session(
            db=db,
            user_id=str(user.user_id),
            telemetry=telemetry_dict,
            device_hash=salted_device_hash,
            ip_address=client_ip,
            location=login_in.location,
            login_hour=login_in.login_hour,
        )
        return TokenResponse(
            access_token=temp_token,
            session_id=session_id,
            user=UserResponse.from_orm(user),
            risk_assessment=risk_response,
            challenge_required=False,
        )

    # CASE B: Medium Risk (0.3 - 0.7) -> Step-Up Email OTP
    elif action_taken == SecurityAction.STEP_UP_MFA:
        otp_code = generate_otp_code(6)
        hashed_otp = hash_secret_code(otp_code)

        challenge = MFAChallenge(
            user_id=user.user_id,
            session_id=session_id,
            channel=MFAChannel.EMAIL_OTP,
            otp_code_hash=hashed_otp,
            expires_at=now + timedelta(minutes=10),
        )
        db.add(challenge)
        db.commit()

        # Send simulated email OTP (IR-04)
        SimulatedMailbox.send_email(
            to_email=user.email,
            subject="Security Verification - One-Time Password (OTP)",
            body_text=f"Your verification OTP code is: {otp_code}. It will expire in 10 minutes. Risk score: {total_risk:.2f}",
            category="MFA_OTP",
            payload_data={"otp_code": otp_code, "session_id": str(session_id)},
        )

        return TokenResponse(
            access_token=None,  # No token until verified
            session_id=session_id,
            user=UserResponse.from_orm(user),
            risk_assessment=risk_response,
            challenge_required=True,
            mfa_channel=MFAChannel.EMAIL_OTP,
            lock_message=f"Medium risk detected ({total_risk:.2f}). Please enter the 6-digit OTP code sent to your email.",
        )

    # CASE C: High Risk (> 0.7) -> Temporarily Lock Account & Out-of-Band Recovery
    else:
        user.status = UserStatus.LOCKED
        # Invalidate active sessions
        db.query(UserSession).filter(UserSession.user_id == user.user_id).update({"status": SessionStatus.REVOKED})
        db.commit()

        recovery_token = secrets.token_urlsafe(32)
        hashed_recovery = hash_secret_code(recovery_token)

        challenge = MFAChallenge(
            user_id=user.user_id,
            session_id=session_id,
            channel=MFAChannel.OUT_OF_BAND_LINK,
            otp_code_hash=hashed_recovery,
            expires_at=now + timedelta(hours=2),
        )
        db.add(challenge)
        db.commit()

        # Send out-of-band recovery notification (FR-04)
        SimulatedMailbox.send_email(
            to_email=user.email,
            subject="CRITICAL: High Risk Account Lock - Action Required",
            body_text=(
                f"Your account was temporarily locked due to high-risk anomaly detection (Score: {total_risk:.2f}). "
                f"Unusual device or behavior was flagged. Use this recovery token to unlock: {recovery_token} "
                f"or use your pre-generated backup code or biometric liveness verification."
            ),
            category="OUT_OF_BAND_RECOVERY",
            payload_data={"recovery_token": recovery_token, "user_id": str(user.user_id)},
        )

        return TokenResponse(
            access_token=None,
            session_id=session_id,
            user=UserResponse.from_orm(user),
            risk_assessment=risk_response,
            challenge_required=True,
            mfa_channel=MFAChannel.OUT_OF_BAND_LINK,
            lock_message=(
                f"High-risk anomaly detected ({total_risk:.2f}). Account has been temporarily locked to prevent takeover. "
                f"An out-of-band recovery link was dispatched to {user.email}. You can also use a backup code or simulated biometric liveness."
            ),
        )


@router.post("/mfa/verify", response_model=TokenResponse)
def verify_mfa(req: MFAVerifyRequest, db: Session = Depends(get_db)) -> Any:
    """
    FR-04: Verifies the email OTP for a step-up challenge.
    """
    user = db.query(User).filter(User.user_id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    hashed_input = hash_secret_code(req.otp_code)
    now = datetime.now(timezone.utc)

    challenge = (
        db.query(MFAChallenge)
        .filter(
            MFAChallenge.user_id == user.user_id,
            MFAChallenge.channel == MFAChannel.EMAIL_OTP,
            MFAChallenge.is_verified == False,
            MFAChallenge.expires_at > now,
        )
        .order_by(MFAChallenge.created_at.desc())
        .first()
    )

    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid pending OTP challenge found. Please request a new code.",
        )

    challenge.attempts += 1
    if challenge.otp_code_hash != hashed_input:
        if challenge.attempts >= 3:
            # Exceeded attempts -> lock account
            user.status = UserStatus.LOCKED
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Too many invalid OTP attempts. Account is locked. Use account recovery.",
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect OTP code. {3 - challenge.attempts} attempt(s) remaining.",
        )

    # OTP Verified!
    challenge.is_verified = True

    # Activate session
    target_session = None
    if req.session_id:
        target_session = db.query(UserSession).filter(UserSession.session_id == req.session_id).first()
        if target_session:
            target_session.status = SessionStatus.ACTIVE
            target_session.last_activity_at = now

    token, _ = create_access_token(
        subject=str(user.user_id),
        session_id=str(target_session.session_id if target_session else uuid.uuid4()),
        role=user.role.value,
    )
    db.commit()

    return TokenResponse(
        access_token=token,
        session_id=target_session.session_id if target_session else None,
        user=UserResponse.from_orm(user),
        risk_assessment=RiskAssessmentResponse(
            total_risk_score=0.10,
            risk_tier=RiskTier.LOW,
            action_taken=SecurityAction.NO_ACTION,
            behavior_deviation_score=0.10,
            context_deviation_score=0.10,
            device_deviation_score=0.10,
            evaluation_time_ms=5.0,
            feature_contributions={
                "top_risk_factors": [{"display_name": "MFA Step-Up Verified", "impact": -0.4, "direction": "DECREASES_RISK"}],
                "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
            },
        ),
        challenge_required=False,
    )


@router.post("/mfa/resend")
def resend_mfa(req: MFAResendRequest, db: Session = Depends(get_db)) -> Any:
    """Resends a fresh 6-digit OTP code."""
    user = db.query(User).filter(User.user_id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    otp_code = generate_otp_code(6)
    hashed_otp = hash_secret_code(otp_code)
    now = datetime.now(timezone.utc)

    challenge = MFAChallenge(
        user_id=user.user_id,
        session_id=req.session_id,
        channel=MFAChannel.EMAIL_OTP,
        otp_code_hash=hashed_otp,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(challenge)
    db.commit()

    SimulatedMailbox.send_email(
        to_email=user.email,
        subject="Resent Verification OTP",
        body_text=f"Your new verification OTP code is: {otp_code}. It will expire in 10 minutes.",
        category="MFA_OTP",
        payload_data={"otp_code": otp_code, "session_id": str(req.session_id) if req.session_id else None},
    )

    return {"message": "New OTP dispatched to simulated mailbox.", "expires_in": "10 minutes"}


@router.post("/recovery/backup-code", response_model=TokenResponse)
def verify_backup_code(req: BackupCodeVerifyRequest, db: Session = Depends(get_db)) -> Any:
    """
    FR-05: Account recovery via pre-generated backup recovery codes.
    Burns the single-use backup code upon successful verification.
    """
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    hashed_input = hash_secret_code(req.backup_code)
    codes = list(user.backup_codes or [])

    if hashed_input not in codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid backup recovery code.",
        )

    # Burn used code
    codes.remove(hashed_input)
    user.backup_codes = codes
    user.status = UserStatus.ACTIVE
    db.commit()

    new_session_id = uuid.uuid4()
    token, _ = create_access_token(
        subject=str(user.user_id),
        session_id=str(new_session_id),
        role=user.role.value,
    )

    return TokenResponse(
        access_token=token,
        session_id=new_session_id,
        user=UserResponse.from_orm(user),
        risk_assessment=RiskAssessmentResponse(
            total_risk_score=0.15,
            risk_tier=RiskTier.LOW,
            action_taken=SecurityAction.NO_ACTION,
            behavior_deviation_score=0.1,
            context_deviation_score=0.1,
            device_deviation_score=0.1,
            evaluation_time_ms=8.0,
            feature_contributions={
                "top_risk_factors": [{"display_name": "Account Recovered via Backup Code", "impact": -0.5, "direction": "DECREASES_RISK"}],
                "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
            },
        ),
        challenge_required=False,
    )


@router.post("/recovery/biometric-liveness", response_model=TokenResponse)
def verify_biometric_liveness(req: BiometricLivenessVerifyRequest, db: Session = Depends(get_db)) -> Any:
    """
    FR-05, IR-04: Simulated Biometric Liveness verification.
    Verifies facial gesture / live camera interaction.
    """
    user = db.query(User).filter(User.user_id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if req.liveness_score < 0.70 or not req.gesture_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Biometric liveness verification failed (Score: {req.liveness_score:.2f} < 0.70 threshold).",
        )

    # Unlock account and restore session
    user.status = UserStatus.ACTIVE
    db.commit()

    new_session_id = req.session_id or uuid.uuid4()
    token, _ = create_access_token(
        subject=str(user.user_id),
        session_id=str(new_session_id),
        role=user.role.value,
    )

    return TokenResponse(
        access_token=token,
        session_id=new_session_id,
        user=UserResponse.from_orm(user),
        risk_assessment=RiskAssessmentResponse(
            total_risk_score=0.08,
            risk_tier=RiskTier.LOW,
            action_taken=SecurityAction.NO_ACTION,
            behavior_deviation_score=0.05,
            context_deviation_score=0.05,
            device_deviation_score=0.05,
            evaluation_time_ms=12.0,
            feature_contributions={
                "top_risk_factors": [{"display_name": "Biometric Liveness Check Passed", "impact": -0.6, "direction": "DECREASES_RISK"}],
                "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
            },
        ),
        challenge_required=False,
    )


@router.post("/recovery/request-link")
def request_recovery_link(req: RequestRecoveryLink, db: Session = Depends(get_db)) -> Any:
    """FR-04, FR-05: Generates out-of-band email recovery link."""
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        # Return success message to avoid user enumeration
        return {"message": "If an account exists, a recovery link has been dispatched."}

    recovery_token = secrets.token_urlsafe(32)
    hashed_recovery = hash_secret_code(recovery_token)
    now = datetime.now(timezone.utc)

    challenge = MFAChallenge(
        user_id=user.user_id,
        channel=MFAChannel.OUT_OF_BAND_LINK,
        otp_code_hash=hashed_recovery,
        expires_at=now + timedelta(hours=2),
    )
    db.add(challenge)
    db.commit()

    SimulatedMailbox.send_email(
        to_email=user.email,
        subject="PropertyBase Out-of-Band Account Recovery Link",
        body_text=f"Your out-of-band recovery token is: {recovery_token}. Valid for 2 hours.",
        category="OUT_OF_BAND_RECOVERY",
        payload_data={"recovery_token": recovery_token, "email": user.email},
    )

    return {"message": "If an account exists, a recovery link has been dispatched."}


@router.post("/recovery/verify-link", response_model=TokenResponse)
def verify_recovery_link(req: VerifyRecoveryLink, db: Session = Depends(get_db)) -> Any:
    """FR-05: Unlocks account and updates password via recovery token."""
    hashed_token = hash_secret_code(req.recovery_token)
    now = datetime.now(timezone.utc)

    challenge = (
        db.query(MFAChallenge)
        .filter(
            MFAChallenge.channel == MFAChannel.OUT_OF_BAND_LINK,
            MFAChallenge.otp_code_hash == hashed_token,
            MFAChallenge.is_verified == False,
            MFAChallenge.expires_at > now,
        )
        .first()
    )

    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired recovery link token.",
        )

    user = db.query(User).filter(User.user_id == challenge.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    challenge.is_verified = True
    user.status = UserStatus.ACTIVE
    user.hashed_password = get_password_hash(req.new_password)
    db.commit()

    session_id = uuid.uuid4()
    token, _ = create_access_token(
        subject=str(user.user_id),
        session_id=str(session_id),
        role=user.role.value,
    )

    return TokenResponse(
        access_token=token,
        session_id=session_id,
        user=UserResponse.from_orm(user),
        risk_assessment=RiskAssessmentResponse(
            total_risk_score=0.10,
            risk_tier=RiskTier.LOW,
            action_taken=SecurityAction.NO_ACTION,
            behavior_deviation_score=0.1,
            context_deviation_score=0.1,
            device_deviation_score=0.1,
            evaluation_time_ms=5.0,
            feature_contributions={
                "top_risk_factors": [{"display_name": "Account Recovered and Password Reset", "impact": -0.5, "direction": "DECREASES_RISK"}],
                "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
            },
        ),
        challenge_required=False,
    )


@router.get("/mailbox/preview")
def get_mailbox_messages(email: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    IR-04: Returns simulated local mailbox messages for testing & verification.
    """
    return SimulatedMailbox.get_messages(email)

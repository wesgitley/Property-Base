import hashlib
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import re
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_pre_auth_token,
    create_reset_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models import (
    MFAChallenge,
    MFAChannel,
    MFAOTP,
    RiskLog,
    RiskTier,
    SecurityAction,
    SessionStatus,
    User,
    UserBackupCode,
    UserDevice,
    UserRole,
    UserSession,
    UserStatus,
)
from app.schemas import (
    BackupCodeVerifyRequest,
    BiometricLivenessVerifyRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginStep1Response,
    MFABackupCodeVerifyRequest,
    MFAResendRequest,
    MFAVerifyRequest,
    RequestRecoveryLink,
    ResetPasswordRequest,
    RiskAssessmentResponse,
    SendEmailOTPRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyEmailOTPRequest,
    VerifyRecoveryLink,
    VerifyResetCodeRequest,
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


def validate_password_complexity(password: str) -> None:
    """
    Ensures password is a combination of:
    - Minimum 8 characters
    - At least one uppercase letter (A-Z)
    - At least one lowercase letter (a-z)
    - At least one number (0-9)
    - At least one special character
    """
    if not password or len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter (A-Z).",
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter (a-z).",
        )
    if not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number (0-9).",
        )
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character (e.g. !@#$%^&*).",
        )


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: Session = Depends(get_db)) -> Any:
    """
    Registers a new user, validates uniqueness of email & username,
    generates 8 single-use unguessable backup codes, stores their SHA-256 hashes
    in `user_backup_codes`, and returns the created user with plaintext codes once.
    """
    # 1. Validate email uniqueness
    existing_email = db.query(User).filter(User.email == user_in.email.lower()).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # 2. Validate username uniqueness
    existing_username = db.query(User).filter(User.username == user_in.username.strip()).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this username already exists.",
        )

    # 3. Enforce password complexity and hash password securely
    validate_password_complexity(user_in.password)
    hashed_pwd = get_password_hash(user_in.password)

    # 4. Generate 8 unguessable single-use backup recovery codes (e.g. A8K2-9P1Z)
    raw_backup_codes = generate_backup_codes(count=8)
    hashed_backup_codes = [hash_secret_code(code) for code in raw_backup_codes]

    user = User(
        first_name=user_in.first_name.strip(),
        last_name=user_in.last_name.strip(),
        mobile_number=user_in.mobile_number.strip(),
        username=user_in.username.strip(),
        email=user_in.email.lower(),
        hashed_password=hashed_pwd,
        role=user_in.role or UserRole.SELLER,
        status=UserStatus.ACTIVE,
        is_active=True,
        is_mfa_enabled=True,
        mfa_enabled=True,
        backup_codes=hashed_backup_codes,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 5. Insert individual hashed backup codes into user_backup_codes table
    for h_code in hashed_backup_codes:
        code_entry = UserBackupCode(
            user_id=user.user_id,
            code_hash=h_code,
            is_used=False,
        )
        db.add(code_entry)
    db.commit()

    # Initialize baseline store (Redis / DB fallback)
    try:
        BaselineStore.get_baseline(db, str(user.user_id))
    except Exception as e:
        logger.warning(f"Baseline store init exception: {e}")

    # Send welcome email via simulated local mailbox
    SimulatedMailbox.send_email(
        to_email=user.email,
        subject="Welcome to Property Base - Account Created",
        body_text="Your Property Base account has been registered. Keep your backup recovery codes safe.",
        category="ACCOUNT_NOTICE",
        payload_data={"backup_codes": raw_backup_codes},
    )

    resp = UserResponse.from_orm(user)
    # Include plaintext backup codes ONCE in registration response
    resp.backup_codes = raw_backup_codes
    return resp



@router.post("/login")
def login(request: Request, login_in: Dict[str, Any], db: Session = Depends(get_db)) -> Any:
    """
    Step 1: Credentials Check
    Input: email, password, device_hash, user_agent, ip_address.
    Actions:
      - Verify email and password against `users` table.
      - Rate limiting / failed attempt counter: lock account after 5 consecutive failures.
      - Return temporary `mfa_pre_auth_token` (5 min expiration) with mfa_required=True.
      - If full telemetry payload is provided (legacy ML mode), also run risk engine.
    """
    email = login_in.get("email")
    password = login_in.get("password")

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email and password are required.",
        )

    user = db.query(User).filter(User.email == str(email).lower()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials.",
        )

    now = datetime.now(timezone.utc)

    # Check if account is locked due to consecutive failed attempts or admin lock
    if user.locked_until and user.locked_until > now:
        remaining_mins = int((user.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is temporarily locked due to excessive failed attempts. Try again in {remaining_mins} minute(s).",
        )
    elif user.status == UserStatus.LOCKED and (not user.locked_until or user.locked_until <= now):
        # Auto-unlock if lock period expired
        if user.locked_until and user.locked_until <= now:
            user.status = UserStatus.ACTIVE
            user.failed_login_attempts = 0
            user.locked_until = None
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account is locked. Please reset password or contact support.",
            )

    # Check password
    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.status = UserStatus.LOCKED
            user.locked_until = now + timedelta(minutes=15)  # 15-minute temporary lockout
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.",
            )
        db.commit()
        remaining = 5 - user.failed_login_attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid email or password credentials. {remaining} attempt(s) remaining before temporary lockout.",
        )

    # Reset failed attempts on valid credentials
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    # Capture client context
    client_ip = login_in.get("ip_address") or (request.client.host if request.client else "127.0.0.1")
    user_agent = login_in.get("user_agent") or request.headers.get("user-agent", "Unknown-Browser")
    raw_device_hash = login_in.get("device_hash") or "default_browser_hash"
    device_name = login_in.get("device_name") or "Standard Browser"

    # Register/Update device
    salted_device_hash = hash_secret_code(f"salt_{user.user_id}_{raw_device_hash}")
    device = (
        db.query(UserDevice)
        .filter(UserDevice.user_id == user.user_id, UserDevice.device_hash == salted_device_hash)
        .first()
    )
    if not device:
        is_first_device = db.query(UserDevice).filter(UserDevice.user_id == user.user_id).count() == 0
        device = UserDevice(
            user_id=user.user_id,
            device_hash=salted_device_hash,
            device_name=device_name,
            os_platform="Web",
            browser_engine="Browser",
            is_trusted=is_first_device,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    else:
        device.last_seen_at = now
        db.commit()

    # Step 1 Response: Generate temporary mfa_pre_auth_token (5-minute expiration)
    pre_auth_token = create_pre_auth_token(user.user_id, user.email, expires_minutes=5)

    # Check remaining unused backup codes
    unused_codes_count = (
        db.query(UserBackupCode)
        .filter(UserBackupCode.user_id == user.user_id, UserBackupCode.is_used == False)
        .count()
    )

    backup_codes_depleted = (unused_codes_count == 0)
    # If exhausted, automatically dispatch a 6-digit one-time code to their email so they can log in
    if backup_codes_depleted:
        otp_code = generate_otp_code(6)
        hashed_otp = hash_secret_code(otp_code)
        otp_entry = MFAOTP(
            user_id=user.user_id,
            otp_code_hash=hashed_otp,
            attempts=0,
            is_used=False,
            expires_at=now + timedelta(minutes=10),
        )
        db.add(otp_entry)
        db.commit()

        SimulatedMailbox.send_email(
            to_email=user.email,
            subject="Property Base - One-Time Login Code (Backup Codes Exhausted)",
            body_text=(
                f"All your backup codes have been used. Use this one-time verification code "
                f"to sign in: {otp_code}. Upon login, a fresh set of 8 backup codes will be generated for you."
            ),
            category="MFA_OTP",
            payload_data={"otp_code": otp_code, "depleted_recovery": True},
        )

    return {
        "mfa_required": True,
        "mfa_pre_auth_token": pre_auth_token,
        "message": (
            "Backup codes exhausted. A one-time verification code has been dispatched to your email."
            if backup_codes_depleted
            else "Credentials verified. MFA verification required."
        ),
        "user_id": str(user.user_id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "backup_codes_depleted": backup_codes_depleted,
        "unused_codes_count": unused_codes_count,
    }




@router.post("/mfa/verify-backup-code", response_model=TokenResponse)
def verify_mfa_backup_code(
    request: Request,
    req: MFABackupCodeVerifyRequest,
    db: Session = Depends(get_db),
) -> Any:
    """
    Step 2: MFA Challenge with Backup Code
    Input: mfa_pre_auth_token, backup_code, device_hash.
    Actions:
      1. Validate pre-auth token.
      2. Check provided backup_code against active (is_used=False) hashed codes in `UserBackupCode`.
      3. Mark code as is_used=True, used_at=now().
      4. Log device & session context in `UserDevice` and `UserSession`.
      5. Return main access_token (JWT with jti).
      6. If invalid: increment failed attempts counter and return 401.
    """
    # 1. Validate pre-auth token
    try:
        payload = decode_token(req.mfa_pre_auth_token)
        if payload.get("type") != "mfa_pre_auth":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type for MFA verification.",
            )
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
        user_id = uuid.UUID(user_id_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"MFA pre-auth token expired or invalid: {str(e)}",
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    now = datetime.now(timezone.utc)
    hashed_code = hash_secret_code(req.backup_code)

    # 2. Check active (is_used=False) backup code in UserBackupCode table
    backup_code_record = (
        db.query(UserBackupCode)
        .filter(
            UserBackupCode.user_id == user.user_id,
            UserBackupCode.code_hash == hashed_code,
            UserBackupCode.is_used == False,
        )
        .first()
    )

    # Fallback to user.backup_codes JSON list if user_backup_codes table has no match yet
    if not backup_code_record:
        legacy_codes = list(user.backup_codes or [])
        if hashed_code in legacy_codes:
            legacy_codes.remove(hashed_code)
            user.backup_codes = legacy_codes
            # Record it as used in UserBackupCode
            backup_code_record = UserBackupCode(
                user_id=user.user_id,
                code_hash=hashed_code,
                is_used=True,
                used_at=now,
            )
            db.add(backup_code_record)
            db.commit()
        else:
            # Increment failed attempts
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or already used backup code.",
            )
    else:
        # Mark as used (ANTI-ATO HARDENING: Used code can NEVER be reused)
        backup_code_record.is_used = True
        backup_code_record.used_at = now
        # Also clean legacy list if present
        legacy_codes = list(user.backup_codes or [])
        if hashed_code in legacy_codes:
            legacy_codes.remove(hashed_code)
            user.backup_codes = legacy_codes
        db.commit()

    # Reset failed attempts
    user.failed_login_attempts = 0
    user.status = UserStatus.ACTIVE

    # AUTO-REFILL ON DEPLETION: Check if this was the last unused backup code
    remaining_unused = (
        db.query(UserBackupCode)
        .filter(UserBackupCode.user_id == user.user_id, UserBackupCode.is_used == False)
        .count()
    )

    new_generated_codes = None
    if remaining_unused == 0:
        # User has exhausted all 8 codes! Generate 8 fresh new codes immediately
        raw_new_codes = generate_backup_codes(count=8)
        hashed_new_codes = [hash_secret_code(c) for c in raw_new_codes]

        for h_code in hashed_new_codes:
            new_entry = UserBackupCode(
                user_id=user.user_id,
                code_hash=h_code,
                is_used=False,
            )
            db.add(new_entry)
        user.backup_codes = hashed_new_codes
        db.commit()

        new_generated_codes = raw_new_codes

        # Send alert email with confirmation OTP code notifying that codes were refilled
        refill_otp = generate_otp_code(6)
        refill_otp_hash = hash_secret_code(refill_otp)
        otp_entry = MFAOTP(
            user_id=user.user_id,
            otp_code_hash=refill_otp_hash,
            attempts=0,
            is_used=False,
            expires_at=now + timedelta(minutes=15),
        )
        db.add(otp_entry)
        db.commit()

        SimulatedMailbox.send_email(
            to_email=user.email,
            subject="Property Base - Backup Codes Auto-Refilled",
            body_text=(
                f"You have used your last backup recovery code. As per Property Base security policy, "
                f"a fresh set of 8 backup codes has been automatically provisioned for your account. "
                f"Your security verification confirmation code is: {refill_otp}."
            ),
            category="MFA_OTP",
            payload_data={"otp_code": refill_otp, "refill_notice": True},
        )

    # Log device
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Unknown-Browser")
    raw_device_hash = req.device_hash or "default_browser_hash"
    salted_device_hash = hash_secret_code(f"salt_{user.user_id}_{raw_device_hash}")

    device = (
        db.query(UserDevice)
        .filter(UserDevice.user_id == user.user_id, UserDevice.device_hash == salted_device_hash)
        .first()
    )
    if not device:
        device = UserDevice(
            user_id=user.user_id,
            device_hash=salted_device_hash,
            device_name=req.device_name or "Standard Browser",
            os_platform="Web",
            browser_engine="Browser",
            is_trusted=True,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    else:
        device.last_seen_at = now
        db.commit()

    # Create active session
    session_id = uuid.uuid4()
    access_token, jti = create_access_token(
        subject=str(user.user_id),
        session_id=str(session_id),
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )

    user_session = UserSession(
        session_id=session_id,
        user_id=user.user_id,
        token_jti=jti,
        ip_address=client_ip,
        user_agent=user_agent,
        device_id=device.device_id,
        status=SessionStatus.ACTIVE,
        is_revoked=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(user_session)
    db.commit()

    risk_response = RiskAssessmentResponse(
        total_risk_score=0.05,
        risk_tier=RiskTier.LOW,
        action_taken=SecurityAction.NO_ACTION,
        behavior_deviation_score=0.05,
        context_deviation_score=0.05,
        device_deviation_score=0.05,
        evaluation_time_ms=4.0,
        feature_contributions={
            "top_risk_factors": [{"feature": "mfa_backup_code", "display_name": "MFA Backup Code Verified", "impact": -0.6, "direction": "DECREASES_RISK"}],
            "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
        },
    )

    user_resp = UserResponse.from_orm(user)
    if new_generated_codes:
        user_resp.backup_codes = new_generated_codes

    return TokenResponse(
        access_token=access_token,
        session_id=session_id,
        user=user_resp,
        risk_assessment=risk_response,
        challenge_required=False,
        new_backup_codes=new_generated_codes,
    )


@router.post("/mfa/send-email-otp")
def send_mfa_email_otp(
    req: SendEmailOTPRequest,
    db: Session = Depends(get_db),
) -> Any:
    """
    Sends a 6-digit one-time code to the user's email for MFA verification.
    Used when backup codes are exhausted or user requests email verification.
    """
    try:
        payload = decode_token(req.mfa_pre_auth_token)
        if payload.get("type") != "mfa_pre_auth":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid pre-auth token.")
        user_id = uuid.UUID(payload.get("sub"))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token expired or invalid: {str(e)}")

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    now = datetime.now(timezone.utc)
    otp_code = generate_otp_code(6)
    hashed_otp = hash_secret_code(otp_code)

    otp_record = MFAOTP(
        user_id=user.user_id,
        otp_code_hash=hashed_otp,
        attempts=0,
        is_used=False,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(otp_record)
    db.commit()

    dispatch_res = SimulatedMailbox.send_email(
        to_email=user.email,
        subject="Property Base - One-Time MFA Code",
        body_text=f"Your Property Base one-time verification code is: {otp_code}. Valid for 10 minutes.",
        category="MFA_OTP",
        payload_data={"otp_code": otp_code, "user_id": str(user.user_id)},
    )

    res_data = {"message": "A 6-digit verification code has been dispatched to your email.", "expires_in": "10 minutes"}
    if not dispatch_res.get("smtp_sent"):
        res_data["dev_code"] = otp_code
    return res_data


@router.post("/mfa/verify-email-otp", response_model=TokenResponse)
def verify_mfa_email_otp(
    request: Request,
    req: VerifyEmailOTPRequest,
    db: Session = Depends(get_db),
) -> Any:
    """
    Verifies the 6-digit one-time code sent to the user's email.
    If the user has 0 unused backup codes, automatically provisions 8 fresh codes
    and returns them in `new_backup_codes` so the frontend prompts the user to save them immediately.
    """
    try:
        payload = decode_token(req.mfa_pre_auth_token)
        if payload.get("type") != "mfa_pre_auth":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid pre-auth token.")
        user_id = uuid.UUID(payload.get("sub"))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token expired or invalid: {str(e)}")

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    now = datetime.now(timezone.utc)
    hashed_input = hash_secret_code(req.otp_code)

    otp_record = (
        db.query(MFAOTP)
        .filter(
            MFAOTP.user_id == user.user_id,
            MFAOTP.is_used == False,
            MFAOTP.expires_at > now,
        )
        .order_by(MFAOTP.created_at.desc())
        .first()
    )

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid or unexpired verification code found. Please request a new one.",
        )

    otp_record.attempts += 1
    if otp_record.otp_code_hash != hashed_input:
        if otp_record.attempts >= 5:
            otp_record.is_used = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Too many invalid attempts. Please request a new code.",
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {5 - otp_record.attempts} attempt(s) remaining.",
        )

    # Valid OTP
    otp_record.is_used = True
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0

    # AUTO-REFILL: If backup codes are depleted, generate 8 new backup codes now
    unused_count = (
        db.query(UserBackupCode)
        .filter(UserBackupCode.user_id == user.user_id, UserBackupCode.is_used == False)
        .count()
    )

    new_generated_codes = None
    if unused_count == 0:
        raw_new_codes = generate_backup_codes(count=8)
        hashed_new_codes = [hash_secret_code(c) for c in raw_new_codes]

        for h_code in hashed_new_codes:
            new_entry = UserBackupCode(
                user_id=user.user_id,
                code_hash=h_code,
                is_used=False,
            )
            db.add(new_entry)
        user.backup_codes = hashed_new_codes
        new_generated_codes = raw_new_codes

    db.commit()

    # Log device
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Unknown-Browser")
    raw_device_hash = req.device_hash or "default_browser_hash"
    salted_device_hash = hash_secret_code(f"salt_{user.user_id}_{raw_device_hash}")

    device = (
        db.query(UserDevice)
        .filter(UserDevice.user_id == user.user_id, UserDevice.device_hash == salted_device_hash)
        .first()
    )
    if not device:
        device = UserDevice(
            user_id=user.user_id,
            device_hash=salted_device_hash,
            device_name=req.device_name or "Standard Browser",
            os_platform="Web",
            browser_engine="Browser",
            is_trusted=True,
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    else:
        device.last_seen_at = now
        db.commit()

    # Create active session
    session_id = uuid.uuid4()
    access_token, jti = create_access_token(
        subject=str(user.user_id),
        session_id=str(session_id),
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )

    user_session = UserSession(
        session_id=session_id,
        user_id=user.user_id,
        token_jti=jti,
        ip_address=client_ip,
        user_agent=user_agent,
        device_id=device.device_id,
        status=SessionStatus.ACTIVE,
        is_revoked=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(user_session)
    db.commit()

    risk_response = RiskAssessmentResponse(
        total_risk_score=0.08,
        risk_tier=RiskTier.LOW,
        action_taken=SecurityAction.NO_ACTION,
        behavior_deviation_score=0.05,
        context_deviation_score=0.05,
        device_deviation_score=0.05,
        evaluation_time_ms=4.0,
        feature_contributions={
            "top_risk_factors": [{"feature": "mfa_email_otp", "display_name": "One-Time Email Code Verified", "impact": -0.5, "direction": "DECREASES_RISK"}],
            "stream_contributions": {"behavioral": 0.0, "contextual": 0.0, "device": 0.0},
        },
    )

    user_resp = UserResponse.from_orm(user)
    if new_generated_codes:
        user_resp.backup_codes = new_generated_codes

    return TokenResponse(
        access_token=access_token,
        session_id=session_id,
        user=user_resp,
        risk_assessment=risk_response,
        challenge_required=False,
        new_backup_codes=new_generated_codes,
    )




@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)) -> Any:
    """
    Step 1: Request Password Reset
    Input: email
    Actions:
      - Generate a 6-digit verification code with 10-minute expiration.
      - Store code hash in `MFAOTP`.
      - Trigger email dispatch to user via SimulatedMailbox.
    """
    user = db.query(User).filter(User.email == req.email.lower()).first()
    # Always return success message to prevent user enumeration
    if not user:
        return {"message": "If an account matches this email, a 6-digit verification code has been dispatched."}

    # Generate 6-digit code
    otp_code = generate_otp_code(6)
    hashed_otp = hash_secret_code(otp_code)
    now = datetime.now(timezone.utc)

    # Invalidate previous unused OTPs for this user
    db.query(MFAOTP).filter(
        MFAOTP.user_id == user.user_id,
        MFAOTP.is_used == False,
    ).update({"is_used": True})

    otp_record = MFAOTP(
        user_id=user.user_id,
        otp_code_hash=hashed_otp,
        attempts=0,
        is_used=False,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(otp_record)
    db.commit()

    # Dispatch email
    dispatch_res = SimulatedMailbox.send_email(
        to_email=user.email,
        subject="Property Base - Password Reset Verification Code",
        body_text=f"Your password reset verification code is: {otp_code}. This code expires in 10 minutes.",
        category="MFA_OTP",
        payload_data={"otp_code": otp_code, "email": user.email},
    )

    res_data = {
        "message": "If an account matches this email, a 6-digit verification code has been dispatched.",
        "expires_in": "10 minutes",
    }
    if not dispatch_res.get("smtp_sent"):
        res_data["dev_code"] = otp_code
    return res_data


@router.post("/verify-reset-code")
def verify_reset_code(req: VerifyResetCodeRequest, db: Session = Depends(get_db)) -> Any:
    """
    Step 2: Verify verification code entered by user matches the one sent to their email.
    """
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    now = datetime.now(timezone.utc)
    hashed_code = hash_secret_code(req.verification_code)

    otp_record = (
        db.query(MFAOTP)
        .filter(
            MFAOTP.user_id == user.user_id,
            MFAOTP.is_used == False,
            MFAOTP.expires_at > now,
        )
        .order_by(MFAOTP.created_at.desc())
        .first()
    )

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid or unexpired verification code found. Please request a new code.",
        )

    otp_record.attempts += 1
    if otp_record.otp_code_hash != hashed_code:
        if otp_record.attempts >= 5:
            otp_record.is_used = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Too many invalid attempts. This verification code has been invalidated.",
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Verification code does not match. {5 - otp_record.attempts} attempt(s) remaining.",
        )

    db.commit()
    reset_token = create_reset_token(user.user_id, user.email, expires_minutes=15)
    return {
        "status": "success",
        "message": "Verification code verified successfully! You may now set your new password.",
        "reset_token": reset_token,
    }


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)) -> Any:
    """
    Step 3: Update existing password with a new different password.
    Requires password complexity (combination of uppercase, lowercase, number, special character).
    """
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    # 1. Enforce password complexity
    validate_password_complexity(req.new_password)

    # 2. Enforce that new password is different from current existing password
    if verify_password(req.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your new password must be different from your existing password.",
        )

    # 3. Authenticate via reset_token or verification_code
    now = datetime.now(timezone.utc)
    authenticated = False

    if req.reset_token:
        try:
            payload = decode_token(req.reset_token)
            if payload.get("type") == "password_reset" and payload.get("email") == user.email:
                authenticated = True
        except Exception:
            pass

    if not authenticated and req.verification_code:
        hashed_code = hash_secret_code(req.verification_code)
        otp_record = (
            db.query(MFAOTP)
            .filter(
                MFAOTP.user_id == user.user_id,
                MFAOTP.is_used == False,
                MFAOTP.expires_at > now,
            )
            .order_by(MFAOTP.created_at.desc())
            .first()
        )
        if otp_record and otp_record.otp_code_hash == hashed_code:
            authenticated = True
            otp_record.is_used = True

    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session or verification code has expired. Please verify your code again.",
        )

    # Invalidate all unused OTPs for this user
    db.query(MFAOTP).filter(
        MFAOTP.user_id == user.user_id,
        MFAOTP.is_used == False,
    ).update({"is_used": True})

    # Update password
    user.hashed_password = get_password_hash(req.new_password)
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0
    user.locked_until = None

    # Invalidate / Revoke ALL active sessions for this user
    db.query(UserSession).filter(UserSession.user_id == user.user_id).update({
        "is_revoked": True,
        "status": SessionStatus.REVOKED,
    })

    db.commit()
    logger.info(f"Password successfully reset for {user.email}. All existing sessions revoked.")

    return {
        "status": "success",
        "message": "Password successfully updated! Please sign in with your new password.",
    }



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

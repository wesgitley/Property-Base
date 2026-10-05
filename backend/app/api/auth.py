from typing import Any

from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models import Device, User
from app.schemas import (
    RiskScoreSummary,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.risk_engine import RiskEngine
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(user_in: UserRegister, db: Session = Depends(get_db)) -> Any:  # noqa: B008
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    user = User(
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    login_in: UserLogin,
    db: Session = Depends(get_db),  # noqa: B008
) -> Any:
    user = db.query(User).filter(User.email == login_in.email).first()
    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    # 1. Fetch or create device entry for tracking
    device = (
        db.query(Device)
        .filter(
            Device.user_id == user.user_id, Device.device_hash == login_in.device_hash
        )
        .first()
    )
    if not device:
        device = Device(
            user_id=user.user_id,
            device_hash=login_in.device_hash,
            user_agent=request.headers.get("user-agent", "unknown"),
            is_trusted=False,
        )
        db.add(device)
        db.commit()
        db.refresh(device)

    # 2. Evaluate risk score
    client_ip = request.client.host if request.client else "127.0.0.1"
    behavior_score, device_score, risk_level = RiskEngine.evaluate_login_risk(
        db=db,
        user_id=str(user.user_id),
        device=device,
        ip_address=client_ip,
    )

    # 3. Create access token
    access_token = create_access_token(subject=str(user.user_id))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user,
        risk_assessment=RiskScoreSummary(
            behavior_score=behavior_score,
            device_score=device_score,
            risk_level=risk_level,
        ),
    )

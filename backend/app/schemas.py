from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models import RiskLevel, UserStatus


class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_hash: str


class UserResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    status: UserStatus
    mfa_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RiskScoreSummary(BaseModel):
    behavior_score: float
    device_score: float
    risk_level: RiskLevel


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    risk_assessment: RiskScoreSummary

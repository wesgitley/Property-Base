import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field

from app.models import (
    MFAChannel,
    OverrideAction,
    PropertyStatus,
    RiskTier,
    SecurityAction,
    SessionStatus,
    UserRole,
    UserStatus,
)


# --- User Schemas ---

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    role: Optional[UserRole] = UserRole.SELLER


class UserResponse(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    role: UserRole
    status: UserStatus
    mfa_enabled: bool
    created_at: datetime
    backup_codes: Optional[List[str]] = None

    class Config:
        from_attributes = True


# --- Telemetry & Login Schemas ---

class KeystrokeTelemetry(BaseModel):
    mean_flight_time: Optional[float] = 120.0
    mean_dwell_time: Optional[float] = 85.0
    speed_wpm: Optional[float] = 62.0
    raw_events: Optional[List[Dict[str, Any]]] = None


class MouseTelemetry(BaseModel):
    mean_velocity: Optional[float] = 450.0
    curvature: Optional[float] = 1.35
    jitter: Optional[float] = 12.0
    raw_events: Optional[List[Dict[str, Any]]] = None


class TelemetryPayload(BaseModel):
    keystroke: Optional[KeystrokeTelemetry] = Field(default_factory=KeystrokeTelemetry)
    mouse: Optional[MouseTelemetry] = Field(default_factory=MouseTelemetry)
    action_velocity: Optional[float] = 2.2


class DeviceFingerprintPayload(BaseModel):
    device_hash: str
    canvas_hash: Optional[str] = None
    webgl_hash: Optional[str] = None
    fonts_hash: Optional[str] = None
    os_platform: Optional[str] = "Windows"
    browser_engine: Optional[str] = "Chrome"
    screen_resolution: Optional[str] = "1920x1080"


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device: DeviceFingerprintPayload
    telemetry: Optional[TelemetryPayload] = Field(default_factory=TelemetryPayload)
    location: Optional[Dict[str, str]] = None
    login_hour: Optional[int] = None


# --- Risk & Decision Schemas ---

class StreamContributions(BaseModel):
    behavioral: float
    contextual: float
    device: float


class RiskFactor(BaseModel):
    feature: str
    display_name: str
    impact: float
    direction: str


class RiskFeatureContributions(BaseModel):
    top_risk_factors: List[RiskFactor] = []
    stream_contributions: StreamContributions
    feature_attributions: Optional[Dict[str, float]] = None


class RiskAssessmentResponse(BaseModel):
    total_risk_score: float
    risk_tier: RiskTier
    action_taken: SecurityAction
    behavior_deviation_score: float
    context_deviation_score: float
    device_deviation_score: float
    evaluation_time_ms: float
    feature_contributions: RiskFeatureContributions


class TokenResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    session_id: Optional[uuid.UUID] = None
    user: UserResponse
    risk_assessment: RiskAssessmentResponse
    challenge_required: Optional[bool] = False
    mfa_channel: Optional[MFAChannel] = None
    lock_message: Optional[str] = None


# --- MFA & Recovery Schemas ---

class MFAVerifyRequest(BaseModel):
    user_id: uuid.UUID
    otp_code: str
    session_id: Optional[uuid.UUID] = None


class MFAResendRequest(BaseModel):
    user_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None


class BackupCodeVerifyRequest(BaseModel):
    email: EmailStr
    backup_code: str


class BiometricLivenessVerifyRequest(BaseModel):
    user_id: uuid.UUID
    liveness_score: float = Field(ge=0.0, le=1.0)
    gesture_verified: bool = True
    session_id: Optional[uuid.UUID] = None


class RequestRecoveryLink(BaseModel):
    email: EmailStr


class VerifyRecoveryLink(BaseModel):
    recovery_token: str
    new_password: str


# --- Admin Schemas ---

class FlaggedSessionItem(BaseModel):
    risk_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    session_id: Optional[uuid.UUID] = None
    total_risk_score: float
    risk_tier: RiskTier
    action_taken: SecurityAction
    behavior_deviation_score: float
    context_deviation_score: float
    device_deviation_score: float
    ip_address: str
    geolocation: Dict[str, Any]
    feature_contributions: Dict[str, Any]
    created_at: datetime
    overridden: bool = False
    override_action: Optional[OverrideAction] = None

    class Config:
        from_attributes = True


class AdminOverrideRequest(BaseModel):
    risk_log_id: uuid.UUID
    action_taken: OverrideAction
    reason: str
    new_risk_score: Optional[float] = None


class AdminOverrideResponse(BaseModel):
    override_id: uuid.UUID
    risk_log_id: uuid.UUID
    admin_id: uuid.UUID
    action_taken: OverrideAction
    reason: str
    overridden_at: datetime

    class Config:
        from_attributes = True


class ModelMetricsResponse(BaseModel):
    true_positive_rate: float
    false_positive_rate: float
    precision: float
    recall: float
    f1_score: float
    auc_roc: float
    accuracy: float
    confusion_matrix: Dict[str, int]
    nfr_04_tpr_pass: bool
    nfr_04_fpr_pass: bool
    test_sample_count: int


# --- Real Estate Property Schemas ---

class PropertyCreate(BaseModel):
    title: str
    description: str
    price: float
    property_type: str = "Apartment"
    location: str
    bedrooms: int = 2
    bathrooms: int = 2
    square_feet: int = 1200
    image_url: Optional[str] = None


class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    square_feet: Optional[int] = None
    status: Optional[PropertyStatus] = None
    image_url: Optional[str] = None


class PropertyResponse(BaseModel):
    property_id: uuid.UUID
    seller_id: uuid.UUID
    title: str
    description: str
    price: float
    property_type: str
    location: str
    bedrooms: int
    bathrooms: int
    square_feet: int
    status: PropertyStatus
    image_url: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base, GUID


class UserRole(str, enum.Enum):
    SELLER = "SELLER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"
    LOCKED = "LOCKED"
    PENDING = "PENDING"


class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    MFA_REQUIRED = "MFA_REQUIRED"
    LOCKED = "LOCKED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class RiskTier(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class SecurityAction(str, enum.Enum):
    NO_ACTION = "NO_ACTION"
    STEP_UP_MFA = "STEP_UP_MFA"
    TEMPORARILY_LOCK = "TEMPORARILY_LOCK"


class MFAChannel(str, enum.Enum):
    EMAIL_OTP = "EMAIL_OTP"
    BACKUP_CODE = "BACKUP_CODE"
    BIOMETRIC_LIVENESS = "BIOMETRIC_LIVENESS"
    OUT_OF_BAND_LINK = "OUT_OF_BAND_LINK"


class OverrideAction(str, enum.Enum):
    APPROVE_SESSION = "APPROVE_SESSION"
    UNLOCK_ACCOUNT = "UNLOCK_ACCOUNT"
    FORCE_MFA = "FORCE_MFA"
    OVERRIDE_SCORE = "OVERRIDE_SCORE"
    FLAG_FALSE_POSITIVE = "FLAG_FALSE_POSITIVE"
    FLAG_TRUE_POSITIVE = "FLAG_TRUE_POSITIVE"


class PropertyStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    SOLD = "SOLD"


class User(Base):
    __tablename__ = "users"

    user_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.SELLER)
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.ACTIVE)
    mfa_enabled = Column(Boolean, nullable=False, default=True)
    backup_codes = Column(JSON, nullable=False, default=list)  # Hashed single-use recovery codes
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    devices = relationship("UserDevice", back_populates="user", cascade="all, delete-orphan")
    behavior_baseline = relationship("UserBehaviorBaseline", back_populates="user", uselist=False, cascade="all, delete-orphan")
    risk_logs = relationship("RiskLog", back_populates="user", cascade="all, delete-orphan")
    mfa_challenges = relationship("MFAChallenge", back_populates="user", cascade="all, delete-orphan")
    properties = relationship("PropertyListing", back_populates="seller", cascade="all, delete-orphan")


class UserDevice(Base):
    __tablename__ = "user_devices"

    device_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_hash = Column(String(255), nullable=False, index=True)
    device_name = Column(String(255), nullable=True)
    canvas_hash = Column(String(255), nullable=True)
    webgl_hash = Column(String(255), nullable=True)
    fonts_hash = Column(String(255), nullable=True)
    os_platform = Column(String(100), nullable=True)
    browser_engine = Column(String(100), nullable=True)
    is_trusted = Column(Boolean, nullable=False, default=False)
    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="devices")
    sessions = relationship("UserSession", back_populates="device")


class UserSession(Base):
    __tablename__ = "user_sessions"

    session_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_jti = Column(String(255), nullable=False, unique=True, index=True)
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(String(500), nullable=False)
    device_id = Column(GUID(), ForeignKey("user_devices.device_id", ondelete="SET NULL"), nullable=True)
    status = Column(SQLEnum(SessionStatus), nullable=False, default=SessionStatus.ACTIVE)
    last_activity_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="sessions")
    device = relationship("UserDevice", back_populates="sessions")
    risk_logs = relationship("RiskLog", back_populates="session")


class UserBehaviorBaseline(Base):
    __tablename__ = "user_behavior_baselines"

    baseline_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # Behavioral Means & Stds
    keystroke_mean_flight_time = Column(Float, nullable=False, default=120.0)  # ms
    keystroke_std_flight_time = Column(Float, nullable=False, default=35.0)
    keystroke_mean_dwell_time = Column(Float, nullable=False, default=85.0)   # ms
    keystroke_std_dwell_time = Column(Float, nullable=False, default=20.0)
    keystroke_mean_speed_wpm = Column(Float, nullable=False, default=62.0)   # words per min
    keystroke_std_speed_wpm = Column(Float, nullable=False, default=12.0)

    mouse_mean_velocity = Column(Float, nullable=False, default=450.0)        # px/sec
    mouse_std_velocity = Column(Float, nullable=False, default=140.0)
    mouse_mean_curvature = Column(Float, nullable=False, default=1.35)
    mouse_std_curvature = Column(Float, nullable=False, default=0.45)
    mouse_mean_jitter = Column(Float, nullable=False, default=12.0)
    mouse_std_jitter = Column(Float, nullable=False, default=6.0)

    action_velocity_mean = Column(Float, nullable=False, default=2.2)         # events/sec
    action_velocity_std = Column(Float, nullable=False, default=0.8)

    # Static Context Norms
    known_ips = Column(JSON, nullable=False, default=list)
    known_locations = Column(JSON, nullable=False, default=list)             # [{"city": "Nairobi", "country": "KE"}]
    typical_login_hours = Column(JSON, nullable=False, default=lambda: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

    # Trusted Device Signatures
    trusted_device_hashes = Column(JSON, nullable=False, default=list)

    sample_count = Column(Integer, nullable=False, default=1)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="behavior_baseline")


class RiskLog(Base):
    __tablename__ = "risk_logs"

    risk_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        GUID(),
        ForeignKey("user_sessions.session_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    total_risk_score = Column(Float, nullable=False, index=True)
    risk_tier = Column(SQLEnum(RiskTier), nullable=False, index=True)
    action_taken = Column(SQLEnum(SecurityAction), nullable=False)

    behavior_deviation_score = Column(Float, nullable=False)
    context_deviation_score = Column(Float, nullable=False)
    device_deviation_score = Column(Float, nullable=False)

    # SHAP explanations and stream contributions
    feature_contributions = Column(JSON, nullable=False, default=dict)
    raw_telemetry_summary = Column(JSON, nullable=False, default=dict)

    ip_address = Column(String(64), nullable=False)
    geolocation = Column(JSON, nullable=False, default=dict)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = relationship("User", back_populates="risk_logs")
    session = relationship("UserSession", back_populates="risk_logs")
    overrides = relationship("AdminOverride", back_populates="risk_log", cascade="all, delete-orphan")


class MFAChallenge(Base):
    __tablename__ = "mfa_challenges"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        GUID(),
        ForeignKey("user_sessions.session_id", ondelete="CASCADE"),
        nullable=True,
    )
    channel = Column(SQLEnum(MFAChannel), nullable=False)
    otp_code_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    is_verified = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="mfa_challenges")


class AdminOverride(Base):
    __tablename__ = "admin_overrides"

    override_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    risk_log_id = Column(
        GUID(),
        ForeignKey("risk_logs.risk_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    admin_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action_taken = Column(SQLEnum(OverrideAction), nullable=False)
    reason = Column(Text, nullable=False)
    new_risk_score = Column(Float, nullable=True)
    overridden_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    risk_log = relationship("RiskLog", back_populates="overrides")
    admin = relationship("User")


class PropertyListing(Base):
    __tablename__ = "property_listings"

    property_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    seller_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    price = Column(Float, nullable=False)
    property_type = Column(String(100), nullable=False, default="Apartment")  # Apartment, Villa, House, Office
    location = Column(String(255), nullable=False)
    bedrooms = Column(Integer, nullable=False, default=2)
    bathrooms = Column(Integer, nullable=False, default=2)
    square_feet = Column(Integer, nullable=False, default=1200)
    status = Column(SQLEnum(PropertyStatus), nullable=False, default=PropertyStatus.ACTIVE)
    image_url = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    seller = relationship("User", back_populates="properties")

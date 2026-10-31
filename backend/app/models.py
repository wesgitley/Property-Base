import enum
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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
from sqlalchemy.orm import relationship, synonym

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
    SMS_OTP = "SMS_OTP"
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
    first_name = Column(String(100), nullable=False, default="Seller")
    last_name = Column(String(100), nullable=False, default="Account")
    mobile_number = Column(String(30), nullable=False, default="+254700000000")
    username = Column(String(100), nullable=False, unique=True, index=True, default=lambda: f"seller_{uuid.uuid4().hex[:6]}")
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    hashed_password = synonym("password_hash")
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.SELLER)
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.ACTIVE)
    is_active = Column(Boolean, nullable=False, default=True)
    is_mfa_enabled = Column(Boolean, nullable=False, default=True)
    mfa_enabled = Column(Boolean, nullable=False, default=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    backup_codes = Column(JSON, nullable=False, default=list)
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

    @property
    def locked_until(self) -> Optional[datetime]:
        if hasattr(self, "_runtime_locked_until"):
            return self._runtime_locked_until
        if self.status == UserStatus.LOCKED and (self.failed_login_attempts or 0) >= 5 and self.updated_at:
            base_dt = self.updated_at
            if base_dt.tzinfo is None:
                base_dt = base_dt.replace(tzinfo=timezone.utc)
            return base_dt + timedelta(minutes=15)
        return None

    @locked_until.setter
    def locked_until(self, val: Optional[datetime]) -> None:
        self._runtime_locked_until = val
        self.updated_at = datetime.now(timezone.utc)

    @property
    def messages_passcode_hash(self) -> Optional[str]:
        if hasattr(self, "_runtime_messages_passcode_hash"):
            return self._runtime_messages_passcode_hash
        for entry in (self.message_passcode_entries or []):
            if not entry.is_used:
                return entry.passcode_hash
        return None

    @messages_passcode_hash.setter
    def messages_passcode_hash(self, val: Optional[str]) -> None:
        self._runtime_messages_passcode_hash = val

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    devices = relationship("UserDevice", back_populates="user", cascade="all, delete-orphan")
    behavior_baseline = relationship("UserBehaviorBaseline", back_populates="user", uselist=False, cascade="all, delete-orphan")
    risk_logs = relationship("RiskLog", back_populates="user", cascade="all, delete-orphan")
    mfa_challenges = relationship("MFAChallenge", back_populates="user", cascade="all, delete-orphan")
    backup_code_entries = relationship("UserBackupCode", back_populates="user", cascade="all, delete-orphan")
    message_passcode_entries = relationship("UserMessagePasscode", back_populates="user", cascade="all, delete-orphan")
    otp_entries = relationship("MFAOTP", back_populates="user", cascade="all, delete-orphan")
    seller_profile = relationship("PropertySeller", back_populates="user", uselist=False, cascade="all, delete-orphan")
    financial_profile = relationship("UserFinancialProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserFinancialProfile(Base):
    """
    Stores a user's credit card and bank account details in the database strictly
    in cryptographic hash form (bcrypt / SHA-256) along with star-masked (*) display previews.
    """
    __tablename__ = "user_financial_profiles"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    cardholder_name = Column(String(255), nullable=False)
    bank_name = Column(String(255), nullable=False)

    # Cryptographic hashes of confidential financial & contact fields
    card_number_hash = Column(String(255), nullable=False)
    bank_account_hash = Column(String(255), nullable=False)
    cvv_hash = Column(String(255), nullable=False)
    expiry_date_hash = Column(String(255), nullable=False)
    swift_routing_hash = Column(String(255), nullable=False)
    billing_phone_hash = Column(String(255), nullable=False)

    # Star-masked (*) representations for safe UI display (no plaintext stored)
    card_number_masked = Column(String(64), nullable=False, default="**** **** **** 8842")
    bank_account_masked = Column(String(64), nullable=False, default="********7465")
    expiry_date_masked = Column(String(20), nullable=False, default="08/28")
    swift_routing_masked = Column(String(64), nullable=False, default="KCB******14")
    billing_phone_masked = Column(String(64), nullable=False, default="+254 *** *** 902")

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

    user = relationship("User", back_populates="financial_profile")


class UserMessagePasscode(Base):
    """Stores one-time / secret passcodes set by a seller for accessing their Messages page as cryptographic hashes."""
    __tablename__ = "user_message_passcodes"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    passcode_hash = Column(String(255), nullable=False, index=True)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def used_at(self) -> Optional[datetime]:
        return getattr(self, "_runtime_used_at", None)

    @used_at.setter
    def used_at(self, val: Optional[datetime]) -> None:
        self._runtime_used_at = val

    user = relationship("User", back_populates="message_passcode_entries")


class UserBackupCode(Base):
    __tablename__ = "user_backup_codes"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash = Column(String(255), nullable=False, index=True)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def used_at(self) -> Optional[datetime]:
        return getattr(self, "_runtime_used_at", None)

    @used_at.setter
    def used_at(self, val: Optional[datetime]) -> None:
        self._runtime_used_at = val

    user = relationship("User", back_populates="backup_code_entries")


class MFAOTP(Base):
    __tablename__ = "mfa_otps"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    otp_code_hash = Column(String(255), nullable=False, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    is_used = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="otp_entries")


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
    device_name = Column(String(255), nullable=False, default="Standard Browser")
    os_platform = Column(String(100), nullable=False, default="Web")
    browser_engine = Column(String(100), nullable=False, default="Browser")
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

    @property
    def canvas_hash(self) -> Optional[str]:
        return getattr(self, "_canvas_hash", None)

    @canvas_hash.setter
    def canvas_hash(self, val: Optional[str]) -> None:
        self._canvas_hash = val

    @property
    def webgl_hash(self) -> Optional[str]:
        return getattr(self, "_webgl_hash", None)

    @webgl_hash.setter
    def webgl_hash(self, val: Optional[str]) -> None:
        self._webgl_hash = val

    @property
    def fonts_hash(self) -> Optional[str]:
        return getattr(self, "_fonts_hash", None)

    @fonts_hash.setter
    def fonts_hash(self, val: Optional[str]) -> None:
        self._fonts_hash = val

    user = relationship("User", back_populates="devices")


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
    status = Column(SQLEnum(SessionStatus), nullable=False, default=SessionStatus.ACTIVE)
    is_revoked = Column(Boolean, nullable=False, default=False)
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

    @property
    def device_id(self) -> Optional[uuid.UUID]:
        return getattr(self, "_device_id", None)

    @device_id.setter
    def device_id(self, val: Optional[uuid.UUID]) -> None:
        self._device_id = val

    user = relationship("User", back_populates="sessions")


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
    keystroke_mean_flight_time = Column(Float, nullable=False, default=120.0)
    keystroke_std_flight_time = Column(Float, nullable=False, default=35.0)
    keystroke_mean_dwell_time = Column(Float, nullable=False, default=85.0)
    keystroke_std_dwell_time = Column(Float, nullable=False, default=20.0)
    keystroke_mean_speed_wpm = Column(Float, nullable=False, default=62.0)
    keystroke_std_speed_wpm = Column(Float, nullable=False, default=12.0)

    mouse_mean_velocity = Column(Float, nullable=False, default=450.0)
    mouse_std_velocity = Column(Float, nullable=False, default=140.0)
    mouse_mean_curvature = Column(Float, nullable=False, default=1.35)
    mouse_std_curvature = Column(Float, nullable=False, default=0.45)
    mouse_mean_jitter = Column(Float, nullable=False, default=12.0)
    mouse_std_jitter = Column(Float, nullable=False, default=6.0)

    action_velocity_mean = Column(Float, nullable=False, default=2.2)
    action_velocity_std = Column(Float, nullable=False, default=0.8)

    # Static Context Norms
    known_ips = Column(JSON, nullable=False, default=list)
    known_locations = Column(JSON, nullable=False, default=list)
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

    @property
    def session_id(self) -> Optional[uuid.UUID]:
        return getattr(self, "_session_id", None)

    @session_id.setter
    def session_id(self, val: Optional[uuid.UUID]) -> None:
        self._session_id = val

    user = relationship("User", back_populates="risk_logs")
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

    @property
    def session_id(self) -> Optional[uuid.UUID]:
        return getattr(self, "_session_id", None)

    @session_id.setter
    def session_id(self, val: Optional[uuid.UUID]) -> None:
        self._session_id = val

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
    overridden_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def new_risk_score(self) -> Optional[float]:
        return getattr(self, "_new_risk_score", None)

    @new_risk_score.setter
    def new_risk_score(self, val: Optional[float]) -> None:
        self._new_risk_score = val

    risk_log = relationship("RiskLog", back_populates="overrides")
    admin = relationship("User")


class PropertySeller(Base):
    """Seller profile — one per user, linked to property_sellers table in Supabase."""
    __tablename__ = "property_sellers"

    seller_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        GUID(),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    full_name = Column(String(255), nullable=False)
    phone_number = Column(String(30), nullable=False)
    is_verified = Column(Boolean, nullable=False, default=True)
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

    user = relationship("User", back_populates="seller_profile")
    listings = relationship("PropertyListing", back_populates="seller", cascade="all, delete-orphan")


class PropertyListing(Base):
    """A property listing posted by a seller."""
    __tablename__ = "property_listings"

    property_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    seller_id = Column(
        GUID(),
        ForeignKey("property_sellers.seller_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    price = Column(Float, nullable=False)
    property_type = Column(String(100), nullable=False, default="Apartment")
    location = Column(String(255), nullable=False)
    bedrooms = Column(Integer, nullable=False, default=2)
    bathrooms = Column(Integer, nullable=False, default=2)
    square_feet = Column(Integer, nullable=False, default=1200)
    status = Column(SQLEnum(PropertyStatus), nullable=False, default=PropertyStatus.ACTIVE)
    image_url = Column(
        Text,
        nullable=False,
        default="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80",
    )
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

    seller = relationship("PropertySeller", back_populates="listings")

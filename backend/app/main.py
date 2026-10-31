import json
import logging
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.properties import router as properties_router
from app.api.users import router as users_router
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.models import (
    MFAChallenge,
    MFAOTP,
    PropertyListing,
    PropertySeller,
    PropertyStatus,
    User,
    UserBackupCode,
    UserBehaviorBaseline,
    UserDevice,
    UserFinancialProfile,
    UserMessagePasscode,
    UserRole,
    UserSession,
    UserStatus,
)
from app.services.email_service import generate_backup_codes, hash_secret_code
from app.services.risk_engine import RiskEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("propertybase")


def _ensure_engine_auth_schema(target_engine):
    """
    Ensures mfa_otps, user_backup_codes, user_message_passcodes, and users.messages_passcode_hash
    in PostgreSQL / SQLite match the current SQLAlchemy model columns.
    """
    try:
        insp = inspect(target_engine)
        table_names = insp.get_table_names()

        if "users" in table_names:
            user_cols = {c["name"] for c in insp.get_columns("users")}
            if "password_hash" not in user_cols:
                with target_engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))
                user_cols.add("password_hash")
                logger.info("Added password_hash column to users table.")
            if "hashed_password" in user_cols and "password_hash" in user_cols:
                with target_engine.begin() as conn:
                    conn.execute(
                        text(
                            "UPDATE users SET password_hash = hashed_password "
                            "WHERE (password_hash IS NULL OR password_hash = '') AND hashed_password IS NOT NULL"
                        )
                    )
                    conn.execute(text("ALTER TABLE users DROP COLUMN hashed_password"))
                logger.info("Migrated and dropped legacy hashed_password column from users table.")
            if "messages_passcode_hash" not in user_cols:
                with target_engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN messages_passcode_hash VARCHAR(255)"))
                logger.info("Added messages_passcode_hash column to users table.")

        if "mfa_otps" in table_names:
            cols = {c["name"] for c in insp.get_columns("mfa_otps")}
            expected_otp_cols = {"id", "user_id", "otp_code_hash", "attempts", "is_used", "expires_at", "created_at"}
            if not expected_otp_cols.issubset(cols):
                logger.info(f"Recreating mfa_otps table to match expected schema (found columns: {cols})")
                with target_engine.begin() as conn:
                    conn.execute(text("DROP TABLE IF EXISTS mfa_otps"))

        if "user_backup_codes" in table_names:
            cols = {c["name"] for c in insp.get_columns("user_backup_codes")}
            expected_bc_cols = {"id", "user_id", "code_hash", "is_used", "used_at", "created_at"}
            if not expected_bc_cols.issubset(cols):
                logger.info(f"Recreating user_backup_codes table to match expected schema (found columns: {cols})")
                with target_engine.begin() as conn:
                    conn.execute(text("DROP TABLE IF EXISTS user_backup_codes"))
    except Exception as exc:
        logger.warning(f"Schema inspection warning: {exc}")


def ensure_auth_tables_schema():
    _ensure_engine_auth_schema(engine)


def _is_bcrypt_hash(val: str) -> bool:
    return bool(val and val.startswith(("$2b$", "$2a$", "$2y$")))


def _is_sha256_hex(val: str) -> bool:
    if not val or len(val) != 64:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in val)


def ensure_sensitive_data_hashed_in_db(db: Session):
    """
    Audits and enforces that all passwords, messages passcodes, backup codes, OTPs,
    session tokens, and sensitive device traits in the database are stored strictly as cryptographic hashes.
    """
    try:
        updated = False
        # 1. Users: password_hash (bcrypt), messages_passcode_hash (bcrypt), backup_codes (SHA-256)
        for u in db.query(User).all():
            if u.password_hash and not u.password_hash.startswith(("$2b$", "$2a$", "$2y$")):
                u.password_hash = get_password_hash(u.password_hash)
                updated = True
            if u.messages_passcode_hash and not u.messages_passcode_hash.startswith(("$2b$", "$2a$", "$2y$")):
                u.messages_passcode_hash = get_password_hash(u.messages_passcode_hash)
                updated = True
            if u.backup_codes and isinstance(u.backup_codes, list):
                new_bc = []
                bc_changed = False
                for code in u.backup_codes:
                    if isinstance(code, str) and not _is_sha256_hex(code):
                        new_bc.append(hash_secret_code(code))
                        bc_changed = True
                    else:
                        new_bc.append(code)
                if bc_changed:
                    u.backup_codes = new_bc
                    updated = True

        # 2. UserMessagePasscode: passcode_hash (bcrypt)
        for mp in db.query(UserMessagePasscode).all():
            if mp.passcode_hash and not mp.passcode_hash.startswith(("$2b$", "$2a$", "$2y$")):
                mp.passcode_hash = get_password_hash(mp.passcode_hash)
                updated = True

        # 3. UserBackupCode: code_hash (SHA-256)
        for bc in db.query(UserBackupCode).all():
            if bc.code_hash and not _is_sha256_hex(bc.code_hash):
                bc.code_hash = hash_secret_code(bc.code_hash)
                updated = True

        # 4. MFAOTP & MFAChallenge: otp_code_hash (SHA-256)
        for otp in db.query(MFAOTP).all():
            if otp.otp_code_hash and not _is_sha256_hex(otp.otp_code_hash):
                otp.otp_code_hash = hash_secret_code(otp.otp_code_hash)
                updated = True
        for ch in db.query(MFAChallenge).all():
            if ch.otp_code_hash and not _is_sha256_hex(ch.otp_code_hash):
                ch.otp_code_hash = hash_secret_code(ch.otp_code_hash)
                updated = True

        # 5. UserDevice & UserBehaviorBaseline: hardware fingerprint hashes (SHA-256)
        for dev in db.query(UserDevice).all():
            if dev.device_hash and not _is_sha256_hex(dev.device_hash):
                dev.device_hash = hash_secret_code(f"salt_{dev.user_id}_{dev.device_hash}")
                updated = True
            if dev.canvas_hash and not _is_sha256_hex(dev.canvas_hash):
                dev.canvas_hash = hash_secret_code(dev.canvas_hash)
                updated = True
            if dev.webgl_hash and not _is_sha256_hex(dev.webgl_hash):
                dev.webgl_hash = hash_secret_code(dev.webgl_hash)
                updated = True
            if dev.fonts_hash and not _is_sha256_hex(dev.fonts_hash):
                dev.fonts_hash = hash_secret_code(dev.fonts_hash)
                updated = True

        for bl in db.query(UserBehaviorBaseline).all():
            if bl.trusted_device_hashes and isinstance(bl.trusted_device_hashes, list):
                new_th = []
                th_changed = False
                for th in bl.trusted_device_hashes:
                    if isinstance(th, str) and not _is_sha256_hex(th):
                        new_th.append(hash_secret_code(th))
                        th_changed = True
                    else:
                        new_th.append(th)
                if th_changed:
                    bl.trusted_device_hashes = new_th
                    updated = True

        # 6. UserSession: token_jti (SHA-256)
        for sess in db.query(UserSession).all():
            if sess.token_jti and not _is_sha256_hex(sess.token_jti):
                sess.token_jti = hash_secret_code(sess.token_jti)
                updated = True

        # 7. UserFinancialProfile: ensure every financial field is hashed (bcrypt / SHA-256)
        for fin in db.query(UserFinancialProfile).all():
            if fin.card_number_hash and not _is_bcrypt_hash(fin.card_number_hash):
                fin.card_number_hash = get_password_hash(fin.card_number_hash)
                updated = True
            if fin.bank_account_hash and not _is_bcrypt_hash(fin.bank_account_hash):
                fin.bank_account_hash = get_password_hash(fin.bank_account_hash)
                updated = True
            if fin.cvv_hash and not _is_bcrypt_hash(fin.cvv_hash):
                fin.cvv_hash = get_password_hash(fin.cvv_hash)
                updated = True
            if fin.expiry_date_hash and not _is_sha256_hex(fin.expiry_date_hash):
                fin.expiry_date_hash = hash_secret_code(fin.expiry_date_hash)
                updated = True
            if fin.swift_routing_hash and not _is_sha256_hex(fin.swift_routing_hash):
                fin.swift_routing_hash = hash_secret_code(fin.swift_routing_hash)
                updated = True
            if fin.billing_phone_hash and not _is_sha256_hex(fin.billing_phone_hash):
                fin.billing_phone_hash = hash_secret_code(fin.billing_phone_hash)
                updated = True

        if updated:
            db.commit()
            logger.info("Verified and hashed all sensitive credentials, passcodes, financial details, and tokens in database.")
    except Exception as exc:
        db.rollback()
        logger.warning(f"Database hash enforcement check note: {exc}")


def sync_local_sqlite_users_to_db(db: Session):
    """
    Migrates any user accounts created in local propertybase.db into the active PostgreSQL database
    so no previously registered user accounts are missing.
    """
    sqlite_path = Path(__file__).resolve().parent.parent / "propertybase.db"
    if not sqlite_path.exists():
        return
    try:
        conn = sqlite3.connect(str(sqlite_path))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM users")
        rows = cur.fetchall()
        for r in rows:
            row_dict = dict(r)
            email = (row_dict.get("email") or "").strip().lower()
            if not email:
                continue
            existing = db.query(User).filter(func.lower(User.email) == email).first()
            if not existing:
                username = row_dict.get("username")
                if username:
                    u_clash = db.query(User).filter(User.username == username).first()
                    if u_clash:
                        username = f"{username}_{email.split('@')[0]}"
                pwd_hash = row_dict.get("password_hash") or row_dict.get("hashed_password") or get_password_hash("PropertyPass123!")
                raw_bc = row_dict.get("backup_codes")
                if isinstance(raw_bc, str):
                    try:
                        bc_list = json.loads(raw_bc)
                    except Exception:
                        bc_list = []
                elif isinstance(raw_bc, list):
                    bc_list = raw_bc
                else:
                    bc_list = []

                role_str = str(row_dict.get("role") or "SELLER").upper()
                role_val = UserRole.ADMIN if "ADMIN" in role_str else UserRole.SELLER

                new_u = User(
                    first_name=row_dict.get("first_name"),
                    last_name=row_dict.get("last_name"),
                    mobile_number=row_dict.get("mobile_number"),
                    username=username,
                    email=email,
                    hashed_password=pwd_hash,
                    role=role_val,
                    status=UserStatus.ACTIVE,
                    is_active=True,
                    is_mfa_enabled=True,
                    mfa_enabled=True,
                    backup_codes=bc_list,
                )
                db.add(new_u)
                db.commit()
                db.refresh(new_u)
                for h_code in bc_list:
                    db.add(UserBackupCode(user_id=new_u.user_id, code_hash=h_code, is_used=False))
                db.commit()
                logger.info(f"Synced user account to PostgreSQL: {email}")
        conn.close()
    except Exception as exc:
        db.rollback()
        logger.warning(f"Local user sync note: {exc}")


def seed_initial_demo_data(db: Session):
    """
    Seeds default admin and seller accounts, baseline telemetry, and sample property listings.
    """
    # 1. Admin Account
    admin_email = "admin@propertybase.com"
    existing_admin = db.query(User).filter(func.lower(User.email) == admin_email).first()
    if not existing_admin:
        admin_codes = generate_backup_codes(8)
        admin_user = User(
            email=admin_email,
            hashed_password=get_password_hash("AdminPass123!"),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            mfa_enabled=True,
            backup_codes=[hash_secret_code(c) for c in admin_codes],
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        logger.info(f"Seeded System Administrator: {admin_email} / AdminPass123!")

    # 2. Project Owner Account (Wesley)
    wesley_email = "wesley.mutisya@strathmore.edu"
    existing_wesley = db.query(User).filter(func.lower(User.email) == wesley_email).first()
    if not existing_wesley:
        wesley_codes = generate_backup_codes(8)
        hashed_wesley_codes = [hash_secret_code(c) for c in wesley_codes]
        wesley_user = User(
            first_name="Wesley",
            last_name="Mutisya",
            username="wesley_mutisya",
            email=wesley_email,
            mobile_number="+254700000000",
            hashed_password=get_password_hash("WesleyPass123!"),
            role=UserRole.SELLER,
            status=UserStatus.ACTIVE,
            is_active=True,
            is_mfa_enabled=True,
            mfa_enabled=True,
            backup_codes=hashed_wesley_codes,
        )
        db.add(wesley_user)
        db.commit()
        db.refresh(wesley_user)
        for h_code in hashed_wesley_codes:
            db.add(UserBackupCode(user_id=wesley_user.user_id, code_hash=h_code, is_used=False))
        db.commit()
        logger.info(f"Seeded Owner Account: {wesley_email}")

    # Sync any other accounts from local SQLite DB into PostgreSQL
    sync_local_sqlite_users_to_db(db)

    # 3. Demo Seller Account
    seller_email = "seller@realestate.com"
    existing_seller = db.query(User).filter(func.lower(User.email) == seller_email).first()
    if not existing_seller:
        seller_codes = generate_backup_codes(8)
        seller_user = User(
            email=seller_email,
            hashed_password=get_password_hash("SellerPass123!"),
            role=UserRole.SELLER,
            status=UserStatus.ACTIVE,
            mfa_enabled=True,
            backup_codes=[hash_secret_code(c) for c in seller_codes],
        )
        db.add(seller_user)
        db.commit()
        db.refresh(seller_user)

        # Baseline for seller
        baseline = UserBehaviorBaseline(
            user_id=seller_user.user_id,
            keystroke_mean_flight_time=120.0,
            keystroke_std_flight_time=30.0,
            keystroke_mean_dwell_time=85.0,
            keystroke_std_dwell_time=18.0,
            keystroke_mean_speed_wpm=65.0,
            keystroke_std_speed_wpm=10.0,
            mouse_mean_velocity=420.0,
            mouse_std_velocity=120.0,
            mouse_mean_curvature=1.35,
            mouse_std_curvature=0.40,
            mouse_mean_jitter=10.0,
            mouse_std_jitter=5.0,
            action_velocity_mean=2.0,
            action_velocity_std=0.7,
            known_ips=["127.0.0.1", "192.168.1.100"],
            known_locations=[{"city": "Nairobi", "country": "KE"}, {"city": "New York", "country": "US"}],
            typical_login_hours=[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
            trusted_device_hashes=[hash_secret_code("demo_trusted_device_hash_12345")],
            sample_count=25,
        )
        db.add(baseline)

        # Trusted Device for seller
        device = UserDevice(
            user_id=seller_user.user_id,
            device_hash=hash_secret_code(f"salt_{seller_user.user_id}_demo_trusted_device_hash_12345"),
            device_name="Seller MacBook Pro (Chrome)",
            canvas_hash=hash_secret_code("canvas_hash_genuine_44321"),
            webgl_hash=hash_secret_code("webgl_hash_genuine_88990"),
            fonts_hash=hash_secret_code("fonts_hash_genuine_11223"),
            os_platform="MacIntel",
            browser_engine="Chrome",
            is_trusted=True,
        )
        db.add(device)
        db.commit()

        # Ensure PropertySeller profile exists
        seller_profile = db.query(PropertySeller).filter(PropertySeller.user_id == seller_user.user_id).first()
        if not seller_profile:
            seller_profile = PropertySeller(
                user_id=seller_user.user_id,
                full_name="Demo Real Estate Seller",
                phone_number="+254711223344",
                agency_name="Prime Nairobi Properties",
                city="Nairobi",
                bio="Verified premier property consultant.",
                is_verified=True,
            )
            db.add(seller_profile)
            db.commit()
            db.refresh(seller_profile)

        # Sample Property Listings
        properties = [
            PropertyListing(
                seller_id=seller_profile.seller_id,
                title="Luxury 3-Bedroom Penthouse in Westlands",
                description="Modern skyline views, premium finishes, private rooftop terrace, high-speed elevators, and 24/7 biometric security access.",
                price=385000.0,
                property_type="Apartment",
                location="Westlands, Nairobi",
                bedrooms=3,
                bathrooms=3,
                square_feet=2400,
                status=PropertyStatus.ACTIVE,
                image_url="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
            ),
            PropertyListing(
                seller_id=seller_profile.seller_id,
                title="Contemporary 4-Bedroom Villa with Swimming Pool",
                description="Spacious landscaped garden, solar powered, smart home automation, gourmet kitchen, and secure gated community.",
                price=550000.0,
                property_type="Villa",
                location="Karen, Nairobi",
                bedrooms=4,
                bathrooms=4,
                square_feet=3800,
                status=PropertyStatus.ACTIVE,
                image_url="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
            ),
            PropertyListing(
                seller_id=seller_profile.seller_id,
                title="Executive Commercial Office Suite",
                description="Fully fitted Grade A office space, boardroom, conference facilities, and fiber optic backbone.",
                price=210000.0,
                property_type="Commercial",
                location="Upperhill, Nairobi",
                bedrooms=0,
                bathrooms=2,
                square_feet=1600,
                status=PropertyStatus.ACTIVE,
                image_url="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
            ),
        ]
        db.add_all(properties)
        db.commit()
        logger.info(f"Seeded Demo Seller: {seller_email} / SellerPass123! with 3 listings.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables exist and match current schema in Supabase PostgreSQL, then seed data
    ensure_auth_tables_schema()
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning(f"Supabase PostgreSQL table creation warning: {exc}")

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        seed_initial_demo_data(db)
        ensure_sensitive_data_hashed_in_db(db)
        db.close()
    except Exception as exc:
        logger.warning(f"Supabase PostgreSQL startup seed warning: {exc}")

    # Pre-warm ML model
    RiskEngine.get_model()
    yield


app = FastAPI(
    title="PropertyBase - Multi-Expert ATO Detection Platform",
    version="1.0.0",
    description=(
        "A Multi-Expert Machine Learning Architecture for Detecting Seller Account Takeover Fraud "
        "in Real Estate Platforms by integrating Behavioral, Contextual, and Device signals."
    ),
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {str(exc)}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# Router registration
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(properties_router, prefix="/api/v1")


@app.get("/health", tags=["Health Check"])
def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "PropertyBase Multi-Expert ATO API"}

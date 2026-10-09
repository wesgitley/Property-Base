import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.properties import router as properties_router
from app.api.users import router as users_router
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.models import (
    PropertyListing,
    PropertyStatus,
    User,
    UserBehaviorBaseline,
    UserDevice,
    UserRole,
    UserStatus,
)
from app.services.email_service import generate_backup_codes, hash_secret_code
from app.services.risk_engine import RiskEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("propertybase")


def seed_initial_demo_data(db: Session):
    """
    Seeds default admin and seller accounts, baseline telemetry, and sample property listings.
    """
    # 1. Admin Account
    admin_email = "admin@propertybase.com"
    existing_admin = db.query(User).filter(User.email == admin_email).first()
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

    # 2. Demo Seller Account
    seller_email = "seller@realestate.com"
    existing_seller = db.query(User).filter(User.email == seller_email).first()
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
            trusted_device_hashes=["demo_trusted_device_hash_12345"],
            sample_count=25,
        )
        db.add(baseline)

        # Trusted Device for seller
        device = UserDevice(
            user_id=seller_user.user_id,
            device_hash=hash_secret_code(f"salt_{seller_user.user_id}_demo_trusted_device_hash_12345"),
            device_name="Seller MacBook Pro (Chrome)",
            canvas_hash="canvas_hash_genuine_44321",
            webgl_hash="webgl_hash_genuine_88990",
            fonts_hash="fonts_hash_genuine_11223",
            os_platform="MacIntel",
            browser_engine="Chrome",
            is_trusted=True,
        )
        db.add(device)

        # Sample Property Listings
        properties = [
            PropertyListing(
                seller_id=seller_user.user_id,
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
                seller_id=seller_user.user_id,
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
                seller_id=seller_user.user_id,
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
    # Startup: Ensure tables exist and seed demo data
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_demo_data(db)
    finally:
        db.close()
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

# Router registration
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(properties_router, prefix="/api/v1")


@app.get("/health", tags=["Health Check"])
def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "PropertyBase Multi-Expert ATO API"}

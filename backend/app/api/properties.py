from typing import Any, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import PropertyListing, PropertySeller, PropertyStatus, RiskLog, RiskTier, SecurityAction, User
from app.schemas import (
    PropertyCreate,
    PropertyResponse,
    PropertySellerCreate,
    PropertySellerResponse,
    PropertySellerUpdate,
    PropertyUpdate,
)
from app.services.email_service import dispatch_suspicious_activity_emails
from app.services.image_forensics import PropertyImageForensicsGuard
from app.services.semantic_guard import RealEstateSemanticGuard

router = APIRouter(prefix="/properties", tags=["Real Estate Property Listings"])


# ── Seller Profile Endpoints ──────────────────────────────────────────────────

@router.post("/seller/profile", response_model=PropertySellerResponse, status_code=status.HTTP_201_CREATED)
def create_seller_profile(
    seller_in: PropertySellerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Register the authenticated user as a property seller."""
    existing = db.query(PropertySeller).filter(PropertySeller.user_id == current_user.user_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seller profile already exists for this account.",
        )
    seller = PropertySeller(
        user_id=current_user.user_id,
        full_name=seller_in.full_name,
        phone_number=seller_in.phone_number,
        agency_name=seller_in.agency_name,
        city=seller_in.city,
        bio=seller_in.bio,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    return seller


@router.get("/seller/profile", response_model=PropertySellerResponse)
def get_my_seller_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get the authenticated user's seller profile."""
    seller = db.query(PropertySeller).filter(PropertySeller.user_id == current_user.user_id).first()
    if not seller:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No seller profile found. Please create one first.",
        )
    return seller


@router.put("/seller/profile", response_model=PropertySellerResponse)
def update_seller_profile(
    seller_update: PropertySellerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update the authenticated user's seller profile."""
    seller = db.query(PropertySeller).filter(PropertySeller.user_id == current_user.user_id).first()
    if not seller:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seller profile not found.")

    for field, val in seller_update.dict(exclude_unset=True).items():
        setattr(seller, field, val)

    db.commit()
    db.refresh(seller)
    return seller


# ── Property Listing Endpoints ────────────────────────────────────────────────

def _get_seller_or_404(db: Session, user_id: Any) -> PropertySeller:
    """Helper: return seller profile or raise 404 with a helpful message."""
    seller = db.query(PropertySeller).filter(PropertySeller.user_id == user_id).first()
    if not seller:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must create a seller profile before managing listings.",
        )
    return seller


@router.get("", response_model=List[PropertyResponse])
def get_properties(
    status_filter: Optional[PropertyStatus] = PropertyStatus.ACTIVE,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Any:
    """Public property listings on the platform."""
    query = db.query(PropertyListing)
    if status_filter:
        query = query.filter(PropertyListing.status == status_filter)
    return query.order_by(PropertyListing.created_at.desc()).limit(limit).all()


@router.get("/seller/mine", response_model=List[PropertyResponse])
def get_my_properties(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Properties listed by the authenticated seller."""
    seller = _get_seller_or_404(db, current_user.user_id)
    return (
        db.query(PropertyListing)
        .filter(PropertyListing.seller_id == seller.seller_id)
        .order_by(PropertyListing.created_at.desc())
        .all()
    )


@router.get("/{property_id}", response_model=PropertyResponse)
def get_property_by_id(property_id: uuid.UUID, db: Session = Depends(get_db)) -> Any:
    prop = db.query(PropertyListing).filter(PropertyListing.property_id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property listing not found.")
    return prop


@router.post("", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def create_property(
    prop_in: PropertyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new property listing. Requires an existing seller profile."""
    seller = _get_seller_or_404(db, current_user.user_id)
    sem_eval = RealEstateSemanticGuard.evaluate_listing_anomaly(
        title=prop_in.title,
        description=prop_in.description,
        new_price=float(prop_in.price or 0.0),
    )
    vision_eval = PropertyImageForensicsGuard.evaluate_image_originality(
        db=db,
        current_seller_id=seller.seller_id,
        image_url=prop_in.image_url,
        listing_title=prop_in.title,
    )
    prop = PropertyListing(
        seller_id=seller.seller_id,
        title=prop_in.title,
        description=prop_in.description,
        price=prop_in.price,
        property_type=prop_in.property_type,
        location=prop_in.location,
        bedrooms=prop_in.bedrooms,
        bathrooms=prop_in.bathrooms,
        square_feet=prop_in.square_feet,
        image_url=prop_in.image_url or "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80",
        status=PropertyStatus.ACTIVE,
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)

    if sem_eval.get("is_anomalous") or vision_eval.get("is_stolen_or_cloned_image"):
        client_ip = request.client.host if request and request.client else "127.0.0.1"
        signals = list(sem_eval.get("matched_signals", []))
        if vision_eval.get("is_stolen_or_cloned_image"):
            signals.append(vision_eval.get("vision_verdict", "Cloned/Stolen Property Image pHash Match"))
        signal_str = ", ".join(signals)
        score = max(
            0.75,
            float(sem_eval.get("semantic_risk_score", 0.0)),
            float(vision_eval.get("vision_risk_score", 0.0)),
        )
        rlog = RiskLog(
            user_id=current_user.user_id,
            total_risk_score=score,
            risk_tier=RiskTier.HIGH if score >= 0.70 else RiskTier.MEDIUM,
            action_taken=SecurityAction.STEP_UP_MFA,
            behavior_deviation_score=round(score * 0.85, 3),
            context_deviation_score=round(score * 0.90, 3),
            device_deviation_score=0.45,
            ip_address=client_ip,
            geolocation={"city": prop_in.location or "Nairobi", "country": "Kenya"},
            feature_contributions={
                "triggered_activity": f"Suspicious Property Listing Creation ({prop_in.title})",
                "detection_reason": f"Semantic & Computer Vision Guard flagged listing: {signal_str}.",
                "target_resource": f"Property Listing: {prop_in.title}",
                "verification_method": "Computer Vision pHash & Semantic Real-Estate Guard",
                "semantic_intelligence": sem_eval,
                "vision_forensics_intelligence": vision_eval,
                "emails_dispatched": True,
            },
        )
        db.add(rlog)
        db.commit()
        db.refresh(rlog)
        try:
            dispatch_suspicious_activity_emails(
                db=db,
                user=current_user,
                risk_log=rlog,
                triggered_activity=rlog.feature_contributions["triggered_activity"],
                detection_reason=rlog.feature_contributions["detection_reason"],
                target_resource=rlog.feature_contributions["target_resource"],
            )
        except Exception:
            pass

    return prop


@router.put("/{property_id}", response_model=PropertyResponse)
def update_property(
    property_id: uuid.UUID,
    prop_update: PropertyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a property listing owned by the current seller."""
    seller = _get_seller_or_404(db, current_user.user_id)
    prop = (
        db.query(PropertyListing)
        .filter(PropertyListing.property_id == property_id, PropertyListing.seller_id == seller.seller_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or unauthorized.")

    previous_price = float(prop.price or 0.0)
    for field, val in prop_update.dict(exclude_unset=True).items():
        setattr(prop, field, val)

    db.commit()
    db.refresh(prop)

    sem_eval = RealEstateSemanticGuard.evaluate_listing_anomaly(
        title=prop.title,
        description=prop.description,
        new_price=float(prop.price or 0.0),
        previous_price=previous_price,
    )
    if sem_eval.get("is_anomalous"):
        client_ip = request.client.host if request and request.client else "127.0.0.1"
        signals = ", ".join(sem_eval.get("matched_signals", []))
        score = max(0.78, float(sem_eval.get("semantic_risk_score", 0.78)))
        rlog = RiskLog(
            user_id=current_user.user_id,
            total_risk_score=score,
            risk_tier=RiskTier.HIGH if score >= 0.70 else RiskTier.MEDIUM,
            action_taken=SecurityAction.STEP_UP_MFA,
            behavior_deviation_score=round(score * 0.85, 3),
            context_deviation_score=round(score * 0.92, 3),
            device_deviation_score=0.50,
            ip_address=client_ip,
            geolocation={"city": prop.location or "Nairobi", "country": "Kenya"},
            feature_contributions={
                "triggered_activity": f"Anomalous Property Listing Modification ({prop.title})",
                "detection_reason": f"Semantic Anti-Scam & Price Guard flagged listing update: {signals}.",
                "target_resource": f"Property Listing: {prop.title}",
                "verification_method": "Semantic Real-Estate NLP & Pricing Guard",
                "semantic_intelligence": sem_eval,
                "emails_dispatched": True,
            },
        )
        db.add(rlog)
        db.commit()
        db.refresh(rlog)
        try:
            dispatch_suspicious_activity_emails(
                db=db,
                user=current_user,
                risk_log=rlog,
                triggered_activity=rlog.feature_contributions["triggered_activity"],
                detection_reason=rlog.feature_contributions["detection_reason"],
                target_resource=rlog.feature_contributions["target_resource"],
            )
        except Exception:
            pass

    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    seller = _get_seller_or_404(db, current_user.user_id)
    prop = (
        db.query(PropertyListing)
        .filter(PropertyListing.property_id == property_id, PropertyListing.seller_id == seller.seller_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or unauthorized.")

    db.delete(prop)
    db.commit()

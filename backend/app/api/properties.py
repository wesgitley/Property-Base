from typing import Any, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import PropertyListing, PropertyStatus, User
from app.schemas import PropertyCreate, PropertyResponse, PropertyUpdate

router = APIRouter(prefix="/properties", tags=["Real Estate Property Listings"])


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
    return (
        db.query(PropertyListing)
        .filter(PropertyListing.seller_id == current_user.user_id)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new property listing for the authenticated seller."""
    prop = PropertyListing(
        seller_id=current_user.user_id,
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
    return prop


@router.put("/{property_id}", response_model=PropertyResponse)
def update_property(
    property_id: uuid.UUID,
    prop_update: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a property listing owned by the current seller."""
    prop = (
        db.query(PropertyListing)
        .filter(PropertyListing.property_id == property_id, PropertyListing.seller_id == current_user.user_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or unauthorized.")

    update_data = prop_update.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(prop, field, val)

    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    prop = (
        db.query(PropertyListing)
        .filter(PropertyListing.property_id == property_id, PropertyListing.seller_id == current_user.user_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or unauthorized.")

    db.delete(prop)
    db.commit()

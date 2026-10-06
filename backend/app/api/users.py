from typing import Any

from app.api.deps import get_current_user
from app.models import User
from app.schemas import UserResponse
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
def read_current_user(
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> Any:
    """
    Get profile information for the authenticated caller.
    """
    return current_user

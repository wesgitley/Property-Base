import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import ALGORITHM, SECRET_KEY
from app.models import SessionStatus, User, UserRole, UserSession, UserStatus

security_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: Optional[str] = payload.get("sub")
        session_id_str: Optional[str] = payload.get("session_id")
        jti: Optional[str] = payload.get("jti")
        if user_id_str is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(User).filter(User.user_id == uuid.UUID(user_id_str)).first()
    if not user:
        raise credentials_exception

    # Check user account status
    if user.status == UserStatus.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is temporarily locked due to high-risk activity. Complete account recovery.",
        )
    if user.status in (UserStatus.SUSPENDED, UserStatus.INACTIVE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive or suspended.",
        )

    # NFR-03: Check session inactivity timeout (30 minutes)
    if session_id_str:
        user_session = db.query(UserSession).filter(UserSession.session_id == uuid.UUID(session_id_str)).first()
        if user_session:
            if user_session.status != SessionStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Session is {user_session.status.value.lower()}.",
                )
            now = datetime.now(timezone.utc)
            # Inactivity check
            if user_session.last_activity_at:
                inactivity_delta = now - user_session.last_activity_at
                if inactivity_delta > timedelta(minutes=30):
                    user_session.status = SessionStatus.EXPIRED
                    db.commit()
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Session expired after 30 minutes of inactivity (NFR-03).",
                    )
            # Refresh last activity timestamp
            user_session.last_activity_at = now
            db.commit()

    return user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """NFR-03: Only users with System Administrator role can access admin dashboard."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: System Administrator role required (NFR-03).",
        )
    return current_user

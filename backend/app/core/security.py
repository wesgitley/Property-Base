import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Tuple

import bcrypt
import jwt

# NFR-03: Session tokens expire after 30 minutes of inactivity
SECRET_KEY = "propertybase-moe-ato-production-secret-key-salt"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")


def create_access_token(
    subject: str | Any,
    session_id: Optional[str] = None,
    role: str = "SELLER",
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, str]:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    jti = secrets.token_hex(16)
    to_encode = {
        "sub": str(subject),
        "session_id": str(session_id) if session_id else None,
        "role": role,
        "jti": jti,
        "iat": now.timestamp(),
        "exp": expire.timestamp(),
    }
    encoded = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded, jti

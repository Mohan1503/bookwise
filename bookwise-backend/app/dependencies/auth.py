from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.models.role import Role, UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)
_PASSWORD_ITERATIONS = 310_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${_PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(derived)}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        algorithm, iterations, salt, expected = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), _b64decode(salt), int(iterations)
        )
        return hmac.compare_digest(_b64encode(derived), expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    encoded_payload = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(
        settings.AUTH_SECRET_KEY.encode(),
        encoded_payload.encode(),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_b64encode(signature)}"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        encoded_payload, supplied_signature = credentials.credentials.split(".", 1)
        expected_signature = _b64encode(
            hmac.new(
                settings.AUTH_SECRET_KEY.encode(),
                encoded_payload.encode(),
                hashlib.sha256,
            ).digest()
        )
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise unauthorized
        payload = json.loads(_b64decode(encoded_payload))
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise unauthorized
        user_id = UUID(payload["sub"])
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise unauthorized from None

    user = db.execute(select(User).where(User.id == user_id, User.is_active.is_(True))).scalar_one_or_none()
    if user is None:
        raise unauthorized
    return user


def get_superadmin_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    has_superadmin_role = db.execute(
        select(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Role.name == "superadmin")
    ).scalar_one_or_none()
    if has_superadmin_role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access is required.",
        )
    return user


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

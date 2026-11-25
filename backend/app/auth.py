"""Password hashing and JWT authentication helpers."""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.session import Session as SessionModel
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security_logger = logging.getLogger("honeygate.security")
DUMMY_PASSWORD_HASH = pwd_context.hash("HoneyGate nonexistent-user dummy password")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def create_access_token(data: dict[str, Any]) -> str:
    payload = data.copy()
    if payload.get("session_id") is None or payload.get("user_id", payload.get("sub")) is None:
        raise ValueError("Access tokens require a user subject and session ID")
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({
        "exp": expires,
        "iat": now,
        "sub": str(payload.get("user_id", payload.get("sub", ""))),
        "jti": secrets.token_urlsafe(24),
    })
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require_exp": True, "require_iat": True, "require_sub": True, "require_jti": True},
        )
        if (
            type(payload.get("session_id")) is not int
            or payload["session_id"] <= 0
            or not isinstance(payload.get("jti"), str)
            or not payload["jti"]
        ):
            raise JWTError("Required session claims are missing")
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def _resolve_authenticated_context(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> tuple[User, SessionModel]:
    """Resolve token identity and its session row before authorization checks."""

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    payload = decode_access_token(authorization.split(" ", 1)[1])
    user_id = payload.get("sub")
    session_id = payload.get("session_id")
    if (
        not isinstance(user_id, str)
        or not user_id.isdecimal()
        or len(user_id) > 20
        or type(session_id) is not int
        or session_id <= 0
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.get(User, int(user_id))
    session = db.get(SessionModel, session_id)
    if user is None or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
    if session is None or session.user_id != user.id:
        security_logger.warning("Rejected token for inactive or missing session (user_id=%s)", user.id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")

    if payload.get("user_id") is not None and str(payload["user_id"]) != user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    return user, session


def _require_active_session(user: User, session: SessionModel, db: Session) -> None:
    if session.status not in {"active", "restricted"}:
        security_logger.warning("Rejected token for inactive or missing session (user_id=%s)", user.id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")
    session.last_activity_at = datetime.utcnow()
    db.commit()


def get_current_user(
    context: tuple[User, SessionModel] = Depends(_resolve_authenticated_context),
    db: Session = Depends(get_db),
) -> tuple[User, SessionModel]:
    """Resolve the bearer token and reject sessions that have been ended or denied."""

    user, session = context
    _require_active_session(user, session, db)
    return user, session


def require_role(*roles: str):
    """Return a dependency that restricts access to the requested roles."""

    def dependency(
        context: tuple[User, SessionModel] = Depends(_resolve_authenticated_context),
        db: Session = Depends(get_db),
    ) -> tuple[User, SessionModel]:
        user, _ = context
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        _require_active_session(*context, db)
        return context

    return dependency

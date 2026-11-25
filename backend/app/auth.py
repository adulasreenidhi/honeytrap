"""Password hashing and JWT authentication helpers."""

from datetime import datetime, timedelta
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


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def create_access_token(data: dict[str, Any]) -> str:
    payload = data.copy()
    expires = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expires})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> tuple[User, SessionModel]:
    """Resolve the bearer token to an active user and active session."""

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    payload = decode_access_token(authorization.split(" ", 1)[1])
    user_id = payload.get("user_id")
    session_id = payload.get("session_id")
    if user_id is None or session_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.get(User, int(user_id))
    session = db.get(SessionModel, int(session_id))
    if user is None or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
    if session is None or session.user_id != user.id or session.status == "ended":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")

    session.last_activity_at = datetime.utcnow()
    db.commit()
    return user, session


def require_role(*roles: str):
    """Return a dependency that restricts access to the requested roles."""

    def dependency(
        context: tuple[User, SessionModel] = Depends(get_current_user),
    ) -> tuple[User, SessionModel]:
        user, _ = context
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return context

    return dependency

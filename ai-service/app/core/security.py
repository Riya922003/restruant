import jwt
from fastapi import Depends, Header
from pydantic import BaseModel

from .config import get_settings
from .errors import ApiError


class CurrentUser(BaseModel):
    id: int
    role: str
    email: str | None = None


def _decode(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """Verify the Express-issued Bearer token and return the caller.

    Express signs { sub: str(user.id), role, email } with HS256 (Backend
    src/utils/jwt.js). We verify with the shared secret and map those claims.
    Any failure returns a uniform 401 without leaking which part failed.
    """
    if not authorization:
        raise ApiError(401, "Authentication required")

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or not parts[1]:
        raise ApiError(401, "Authentication required")

    try:
        payload = _decode(parts[1])
    except jwt.PyJWTError:
        raise ApiError(401, "Invalid or expired token")

    sub = payload.get("sub")
    role = payload.get("role")
    if sub is None or role is None:
        raise ApiError(401, "Invalid or expired token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise ApiError(401, "Invalid or expired token")

    return CurrentUser(id=user_id, role=role, email=payload.get("email"))


def require_role(*allowed: str):
    """Dependency factory enforcing RBAC. Owner bypasses every check, matching the
    Phase 1 requireRole behavior. Wrong role -> 403."""

    async def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role == "owner" or user.role in allowed:
            return user
        raise ApiError(403, "You do not have access to this resource")

    return dependency

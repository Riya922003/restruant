import os
from collections.abc import AsyncIterator

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("JWT_SECRET", "test-secret-with-at-least-32-bytes")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.core.config import get_settings
import main


@pytest.fixture(autouse=True)
def reset_settings(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setattr(main, "open_pool", lambda: None)
    monkeypatch.setattr(main, "close_pool", lambda: None)
    monkeypatch.setattr(main, "configure_cloudinary", lambda: None)
    yield
    get_settings.cache_clear()


@pytest.fixture
def token():
    def make_token(role: str = "manager", user_id: int = 7) -> str:
        payload = {"sub": str(user_id), "role": role, "email": f"{role}@restaurantos.test"}
        return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")

    return make_token


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = main.create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
def auth(token):
    def headers(role: str = "manager", user_id: int = 7) -> dict[str, str]:
        return {"Authorization": f"Bearer {token(role=role, user_id=user_id)}"}

    return headers

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Loaded from the process environment and, in development, from a local .env.
    # extra="ignore" so a shared .env carrying Backend-only vars does not error.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    database_url: str = "postgresql://restaurantos:restaurantos@localhost:5432/restaurantos"

    # Must match Backend's JWT_SECRET (HS256) so Express-issued tokens verify.
    jwt_secret: str = "replace-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"

    frontend_origin: str = "http://localhost:3000"

    # Grok (recommendations only)
    grok_api_key: str = ""
    grok_base_url: str = "https://api.x.ai/v1"
    grok_text_model: str = "grok-4"

    # Veryfi (invoice OCR)
    veryfi_client_id: str = ""
    veryfi_client_secret: str = ""
    veryfi_username: str = ""
    veryfi_api_key: str = ""

    redis_url: str = "redis://localhost:6379/0"
    cloudinary_url: str = ""

    ai_service_port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()

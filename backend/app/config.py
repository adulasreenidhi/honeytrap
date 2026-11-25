"""Application configuration loaded from environment variables."""

from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """HoneyGate runtime settings."""

    SECRET_KEY: str = "change-this-demo-secret-in-production"
    JWT_ALGORITHM: Literal["HS256"] = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    DEBUG: bool = True
    ENV: str = "development"
    DATABASE_URL: str = "sqlite:///./honeygate.db"
    MAX_REQUEST_BODY_SIZE_BYTES: int = 1_048_576
    LOGIN_FAILURE_LIMIT: int = 5
    LOGIN_FAILURE_WINDOW_SECONDS: int = 60
    LOGIN_LOCKOUT_SECONDS: int = 60
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if not self.DEBUG and (
            self.SECRET_KEY == "change-this-demo-secret-in-production"
            or len(self.SECRET_KEY) < 32
        ):
            raise ValueError("A non-default SECRET_KEY of at least 32 characters is required when DEBUG is disabled")
        if self.MAX_REQUEST_BODY_SIZE_BYTES < 1:
            raise ValueError("MAX_REQUEST_BODY_SIZE_BYTES must be positive")
        if min(self.LOGIN_FAILURE_LIMIT, self.LOGIN_FAILURE_WINDOW_SECONDS, self.LOGIN_LOCKOUT_SECONDS) < 1:
            raise ValueError("Login rate-limit settings must be positive")
        return self


settings = Settings()

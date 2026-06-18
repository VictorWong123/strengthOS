"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for private backend jobs and endpoints."""

    supabase_url: str = ""
    supabase_service_role_key: SecretStr = SecretStr("")
    exercise_api_provider: str = "seed"
    exercise_api_key: SecretStr = SecretStr("")
    exercise_api_host: str = "exercisedb.p.rapidapi.com"
    exercise_api_base_url: str = "https://exercisedb.p.rapidapi.com"
    exercise_sync_page_size: int = Field(default=100, ge=1, le=500)
    exercise_api_max_retries: int = Field(default=3, ge=0, le=10)
    exercise_api_max_retry_delay_seconds: int = Field(default=30, ge=1, le=300)
    turso_database_url: str = ""
    turso_auth_token: SecretStr = SecretStr("")
    turso_export_user_id: str = ""
    frontend_origin: str = "http://localhost:5173"
    admin_api_key: SecretStr = SecretStr("")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def has_exercise_credentials(self) -> bool:
        """Return whether ExerciseDB can be called with RapidAPI credentials."""

        return bool(self.exercise_api_key.get_secret_value() and self.exercise_api_host)

    @property
    def has_supabase_credentials(self) -> bool:
        """Return whether service-role Supabase requests can be made."""

        return bool(self.supabase_url and self.supabase_service_role_key.get_secret_value())

    @property
    def has_turso_credentials(self) -> bool:
        """Return whether the Turso/libSQL export target is fully configured.

        Local libSQL database paths do not require an auth token. Remote Turso
        URLs do require one, and missing remote auth should fail before export
        work begins.
        """

        if not self.turso_database_url:
            return False
        if self.is_remote_turso_database:
            return bool(self.turso_auth_token.get_secret_value())
        return True

    @property
    def is_remote_turso_database(self) -> bool:
        """Return whether the configured libSQL database points at remote Turso."""

        return self.turso_database_url.startswith(("libsql://", "http://", "https://"))

    @property
    def has_admin_api_key(self) -> bool:
        """Return whether management endpoints can require an admin key."""

        return bool(self.admin_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    """Return cached settings for dependency injection and scripts."""

    return Settings()

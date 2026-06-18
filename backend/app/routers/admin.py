"""Admin-only management endpoints for sync jobs."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import get_settings
from app.scripts.sync_exercises import sync_exercises
from app.scripts.sync_turso import sync_turso

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    """Require the configured admin key before running service-role jobs."""

    settings = get_settings()
    expected = settings.admin_api_key.get_secret_value()
    provided = x_admin_key or ""
    if not expected or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key.")


@router.post("/sync-exercises", dependencies=[Depends(require_admin_key)])
async def run_exercise_sync() -> dict[str, object]:
    """Run the ExerciseDB-to-Supabase catalog synchronization job."""

    settings = get_settings()
    if not settings.has_supabase_credentials:
        raise HTTPException(status_code=400, detail="Supabase service credentials are not configured.")
    result = await sync_exercises(settings)
    return result.model_dump()


@router.post("/sync-turso", dependencies=[Depends(require_admin_key)])
async def run_turso_sync() -> dict[str, object]:
    """Run the Supabase-to-Turso read replica export job."""

    settings = get_settings()
    if not settings.has_supabase_credentials or not settings.has_turso_credentials:
        raise HTTPException(status_code=400, detail="Supabase and Turso credentials are required.")
    return await sync_turso(settings)

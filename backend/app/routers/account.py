"""Authenticated account management endpoints."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import AuthenticatedUser, get_authenticated_user
from app.config import get_settings
from app.services.supabase import SupabaseService

router = APIRouter(prefix="/account", tags=["account"])


@router.delete("")
async def delete_account(user: AuthenticatedUser = Depends(get_authenticated_user)) -> dict[str, bool]:
    """Delete the authenticated Supabase Auth user and cascade owned data."""

    settings = get_settings()
    if not settings.has_supabase_credentials:
        raise HTTPException(status_code=500, detail="Supabase service credentials are not configured.")

    async with SupabaseService(settings) as supabase:
        try:
            await supabase.delete_auth_user(user.id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == status.HTTP_404_NOT_FOUND:
                return {"deleted": True}
            raise HTTPException(status_code=502, detail="Unable to delete account.") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Unable to delete account.") from exc

    return {"deleted": True}

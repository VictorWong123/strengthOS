"""Supabase bearer-token authentication for FastAPI and FastMCP callers."""

from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Header, HTTPException, status

from app.config import Settings, get_settings

AUTH_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class AuthenticatedUser:
    """Identity derived from a verified Supabase access token."""

    id: str
    email: str | None = None


def extract_bearer_token(authorization: str | None) -> str:
    """Return a bearer token from an Authorization header or raise 401."""

    scheme, separator, token = (authorization or "").partition(" ")
    if not separator or scheme.casefold() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


async def verify_supabase_token(token: str, settings: Settings | None = None) -> AuthenticatedUser:
    """Validate a Supabase access token and return the authenticated user.

    Supabase Auth performs issuer, signature, and expiration checks for the
    configured project. The backend only trusts the user id returned by that
    verification endpoint.
    """

    resolved_settings = settings or get_settings()
    if not resolved_settings.has_supabase_auth_credentials:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase authentication is not configured.",
        )

    anon_key = resolved_settings.supabase_anon_key.get_secret_value()
    url = f"{resolved_settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {"apikey": anon_key, "authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=AUTH_TIMEOUT_SECONDS) as client:
        try:
            response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to validate bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload: dict[str, Any] = response.json()
    user_id = str(payload.get("id") or "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token did not resolve to a user.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedUser(id=user_id, email=payload.get("email"))


async def get_authenticated_user(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    """FastAPI dependency that authenticates the current Supabase user."""

    return await verify_supabase_token(extract_bearer_token(authorization))

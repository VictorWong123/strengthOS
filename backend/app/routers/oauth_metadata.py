"""OAuth protected-resource metadata for MCP clients."""

from fastapi import APIRouter, Request

from app.config import get_settings

router = APIRouter(tags=["oauth"])

DEFAULT_MCP_SCOPES = ["openid", "email", "profile"]


def resolve_backend_origin(settings, request: Request) -> str:
    """Return the public backend origin used in OAuth metadata."""

    return settings.backend_public_url.rstrip("/") or str(request.base_url).rstrip("/")


def protected_resource_metadata_url(settings, request: Request) -> str:
    """Return the protected-resource metadata URL for bearer challenges."""

    return f"{resolve_backend_origin(settings, request)}/.well-known/oauth-protected-resource"


def bearer_challenge(settings, request: Request) -> str:
    """Return the OAuth bearer challenge used by MCP clients for discovery."""

    return f'Bearer resource_metadata="{protected_resource_metadata_url(settings, request)}"'


@router.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource(request: Request) -> dict[str, object]:
    """Return RFC 9728 metadata for clients authenticating to the MCP server."""

    settings = get_settings()
    origin = resolve_backend_origin(settings, request)
    supabase_auth_url = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    return {
        "resource": f"{origin}/mcp",
        "authorization_servers": [supabase_auth_url],
        "scopes_supported": DEFAULT_MCP_SCOPES,
        "resource_documentation": settings.frontend_url,
    }

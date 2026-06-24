"""OAuth protected-resource metadata for MCP clients."""

from fastapi import APIRouter, Request

from app.config import get_settings

router = APIRouter(tags=["oauth"])

DEFAULT_MCP_SCOPES = ["openid", "email", "profile"]


@router.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource(request: Request) -> dict[str, object]:
    """Return RFC 9728 metadata for clients authenticating to the MCP server."""

    settings = get_settings()
    origin = settings.backend_public_url.rstrip("/") or str(request.base_url).rstrip("/")
    supabase_auth_url = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    return {
        "resource": f"{origin}/mcp",
        "authorization_servers": [supabase_auth_url],
        "scopes_supported": DEFAULT_MCP_SCOPES,
        "resource_documentation": settings.frontend_url,
    }

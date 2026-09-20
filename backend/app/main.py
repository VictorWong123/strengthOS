"""FastAPI app for health, sync, analytics, and MCP operations."""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.dependencies import extract_bearer_token, verify_supabase_token
from app.config import get_settings
from app.mcp.server import create_mcp_app
from app.routers import account, admin, exercise_images, health, oauth_metadata, progress_photos


def create_app() -> FastAPI:
    """Create and configure the FastAPI backend application."""

    settings = get_settings()
    mcp_app = create_mcp_app(settings)
    app = FastAPI(
        title="strengthOS backend API",
        version="0.1.0",
        lifespan=mcp_app.lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_frontend_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["authorization", "content-type", "x-admin-key"],
    )
    app.include_router(health.router)
    app.include_router(oauth_metadata.router)
    app.include_router(account.router)
    app.include_router(admin.router)
    app.include_router(exercise_images.router)
    app.include_router(progress_photos.router)
    app.mount("/mcp", mcp_app)

    @app.middleware("http")
    async def require_mcp_bearer_token(request: Request, call_next):
        """Challenge unauthenticated MCP clients without blocking public endpoints."""

        if request.url.path.startswith("/mcp"):
            try:
                token = extract_bearer_token(request.headers.get("authorization"))
                await verify_supabase_token(token, settings)
            except HTTPException as exc:
                if exc.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
                    raise
                return JSONResponse(
                    {"detail": "Missing, invalid, or expired bearer token."},
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    headers={"WWW-Authenticate": oauth_metadata.bearer_challenge(settings, request)},
                )
        return await call_next(request)
    return app


app = create_app()

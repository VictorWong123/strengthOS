"""FastAPI app for health, sync, analytics, and MCP operations."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.mcp.server import create_mcp_app
from app.routers import admin, health


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
        allow_methods=["GET", "POST"],
        allow_headers=["authorization", "content-type", "x-admin-key"],
    )
    app.include_router(health.router)
    app.include_router(admin.router)
    app.mount("/mcp", mcp_app)
    return app


app = create_app()

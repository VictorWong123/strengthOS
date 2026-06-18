"""FastAPI app for backend-only health, sync, and export operations."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, health


def create_app() -> FastAPI:
    """Create and configure the FastAPI management application."""

    settings = get_settings()
    app = FastAPI(title="strengthOS management API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["authorization", "content-type", "x-admin-key"],
    )
    app.include_router(health.router)
    app.include_router(admin.router)
    return app


app = create_app()

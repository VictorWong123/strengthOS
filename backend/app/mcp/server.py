"""FastMCP tool registration for direct Supabase training analytics."""

from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from fastapi import HTTPException
from fastmcp import FastMCP
from fastmcp.dependencies import CurrentHeaders

from app.auth.dependencies import extract_bearer_token, verify_supabase_token
from app.config import Settings
from app.services.training_analytics import TrainingAnalyticsService

ToolResult = TypeVar("ToolResult")


def create_mcp_app(settings: Settings):
    """Create the ASGI app mounted by FastAPI at ``/mcp``."""

    mcp = FastMCP("strengthOS")
    analytics = TrainingAnalyticsService(settings)

    async def authenticated_call(
        headers: dict[str, str],
        handler: Callable[[str], Awaitable[ToolResult]],
    ) -> ToolResult:
        """Authenticate an MCP request and run a user-scoped tool handler."""

        authorization = headers.get("authorization") or headers.get("Authorization")
        user = await verify_supabase_token(extract_bearer_token(authorization), settings)
        try:
            return await handler(user.id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @mcp.tool
    async def get_recent_workouts(
        days: int = 30,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return recent workouts for the authenticated user."""

        return await authenticated_call(headers, lambda user_id: analytics.get_recent_workouts(user_id, days))

    @mcp.tool
    async def get_workout(
        workout_id: str,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return one workout for the authenticated user."""

        return await authenticated_call(headers, lambda user_id: analytics.get_workout(user_id, workout_id))

    @mcp.tool
    async def get_exercise_history(
        exercise_name: str,
        days: int = 90,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return recent set history for one exercise."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.get_exercise_history(user_id, exercise_name, days),
        )

    @mcp.tool
    async def get_strength_progress(
        exercise_name: str,
        days: int = 90,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return strength and volume trend data for one exercise."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.get_strength_progress(user_id, exercise_name, days),
        )

    @mcp.tool
    async def get_weekly_training_summary(
        weeks: int = 4,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return week-by-week training summary for the authenticated user."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.get_weekly_training_summary(user_id, weeks),
        )

    @mcp.tool
    async def get_volume_by_muscle_group(
        days: int = 30,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return training volume grouped by primary muscle."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.get_volume_by_muscle_group(user_id, days),
        )

    @mcp.tool
    async def get_personal_records(
        days: int = 365,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return best estimated one-rep-max records by exercise."""

        return await authenticated_call(headers, lambda user_id: analytics.get_personal_records(user_id, days))

    @mcp.tool
    async def find_stagnating_exercises(
        days: int = 90,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return exercises with enough exposures and little recent progress."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.find_stagnating_exercises(user_id, days),
        )

    @mcp.tool
    async def find_undertrained_muscle_groups(
        days: int = 30,
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return muscle groups with low recent working-set exposure."""

        return await authenticated_call(
            headers,
            lambda user_id: analytics.find_undertrained_muscle_groups(user_id, days),
        )

    @mcp.tool
    async def get_current_routines(
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return the authenticated user's current routines."""

        return await authenticated_call(headers, analytics.get_current_routines)

    @mcp.tool
    async def get_user_training_context(
        headers: dict[str, str] = CurrentHeaders(),
    ) -> dict[str, Any]:
        """Return compact profile, routine, record, and recent training context."""

        return await authenticated_call(headers, analytics.get_user_training_context)

    return mcp.http_app(path="/")

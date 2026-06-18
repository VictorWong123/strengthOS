"""User-scoped Supabase repositories for training analytics."""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import Settings
from app.services.supabase import SupabaseService

DEFAULT_PAGE_SIZE = 1000


def cutoff_filter(days: int) -> str:
    """Return a PostgREST timestamp filter for rows newer than ``days`` ago."""

    cutoff = datetime.now(UTC) - timedelta(days=days)
    return f"gte.{cutoff.isoformat()}"


class TrainingRepository:
    """Read user-owned training records from Supabase through explicit scopes."""

    def __init__(self, settings: Settings) -> None:
        """Create a repository using the backend service-role Supabase client."""

        self._settings = settings

    async def __aenter__(self) -> "TrainingRepository":
        """Open the underlying Supabase REST client."""

        self._supabase = SupabaseService(self._settings)
        await self._supabase.__aenter__()
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        """Close the underlying Supabase REST client."""

        await self._supabase.__aexit__(*_exc_info)

    async def get_recent_workouts(self, user_id: str, days: int) -> list[dict[str, Any]]:
        """Return workouts owned by ``user_id`` inside the requested day window."""

        return await self._supabase.select_all(
            "workouts",
            page_size=DEFAULT_PAGE_SIZE,
            order="started_at.desc",
            user_id=f"eq.{user_id}",
            started_at=cutoff_filter(days),
        )

    async def get_workout(self, user_id: str, workout_id: str) -> dict[str, Any] | None:
        """Return one workout only when it belongs to ``user_id``."""

        rows = await self._supabase.select(
            "workouts",
            user_id=f"eq.{user_id}",
            id=f"eq.{workout_id}",
            limit=1,
        )
        return rows[0] if rows else None

    async def get_current_routines(self, user_id: str) -> list[dict[str, Any]]:
        """Return routines owned by ``user_id`` in newest-first order."""

        return await self._supabase.select_all(
            "routines",
            page_size=DEFAULT_PAGE_SIZE,
            order="created_at.desc",
            user_id=f"eq.{user_id}",
        )

    async def get_profile(self, user_id: str) -> dict[str, Any] | None:
        """Return the authenticated user's profile row when one exists."""

        rows = await self._supabase.select("profiles", id=f"eq.{user_id}", limit=1)
        return rows[0] if rows else None

    async def get_visible_exercises(
        self,
        user_id: str,
        *,
        exercise_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Return active global exercises and custom exercises owned by ``user_id``."""

        filters: dict[str, str] = {
            "is_active": "eq.true",
            "or": f"(user_id.is.null,user_id.eq.{user_id})",
        }
        in_filters = {"id": exercise_ids} if exercise_ids is not None else None
        return await self._supabase.select_all(
            "exercises",
            page_size=DEFAULT_PAGE_SIZE,
            in_filters=in_filters,
            **filters,
        )

    async def find_exercise_by_name(self, user_id: str, exercise_name: str) -> dict[str, Any] | None:
        """Find the first visible exercise whose name matches case-insensitively."""

        rows = await self.get_visible_exercises(user_id)
        normalized = exercise_name.strip().casefold()
        for row in rows:
            if str(row.get("name", "")).casefold() == normalized:
                return row
        for row in rows:
            if normalized in str(row.get("name", "")).casefold():
                return row
        return None

    async def get_workout_exercises_by_workouts(
        self,
        workout_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Return child exercise rows for a trusted list of user-owned workouts."""

        return await self._supabase.select_all(
            "workout_exercises",
            page_size=DEFAULT_PAGE_SIZE,
            in_filters={"workout_id": workout_ids},
            order="exercise_order.asc",
        )

    async def get_sets_by_workout_exercises(
        self,
        workout_exercise_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Return set rows for trusted workout exercise ids."""

        return await self._supabase.select_all(
            "workout_sets",
            page_size=DEFAULT_PAGE_SIZE,
            in_filters={"workout_exercise_id": workout_exercise_ids},
            order="set_order.asc",
        )

    async def get_routine_exercises_by_routines(
        self,
        routine_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Return child exercise rows for a trusted list of user-owned routines."""

        return await self._supabase.select_all(
            "routine_exercises",
            page_size=DEFAULT_PAGE_SIZE,
            in_filters={"routine_id": routine_ids},
            order="exercise_order.asc",
        )

"""ExerciseDB provider backed by RapidAPI."""

import asyncio
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from app.config import Settings
from app.providers.base import ExerciseProvider, ProviderExercise
from app.providers.normalization import titleish


class ExerciseDBProvider(ExerciseProvider):
    """Fetch and normalize exercises from ExerciseDB through RapidAPI."""

    source = "exercisedb"

    def __init__(self, settings: Settings) -> None:
        """Create a provider using backend-only RapidAPI credentials."""

        self.settings = settings
        self.failures: list[dict[str, Any]] = []
        self.base_url = settings.exercise_api_base_url.rstrip("/")
        self.headers = {
            "x-rapidapi-host": settings.exercise_api_host,
            "x-rapidapi-key": settings.exercise_api_key.get_secret_value(),
        }

    async def list_exercises(self) -> list[ProviderExercise]:
        """Fetch the paginated ExerciseDB catalog."""

        exercises: list[ProviderExercise] = []
        self.failures = []
        offset = 0
        limit = self.settings.exercise_sync_page_size
        retries = 0
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                response = await client.get(
                    f"{self.base_url}/exercises",
                    headers=self.headers,
                    params={"limit": limit, "offset": offset},
                )
                if response.status_code == 429:
                    if retries >= self.settings.exercise_api_max_retries:
                        response.raise_for_status()
                    retry_after = self._retry_after_seconds(response.headers.get("retry-after"))
                    await asyncio.sleep(retry_after)
                    retries += 1
                    continue
                retries = 0
                response.raise_for_status()
                page = response.json()
                if not page:
                    break
                for item in page:
                    try:
                        exercises.append(self._normalize(item))
                    except Exception as exc:
                        self.failures.append(
                            {
                                "external_id": item.get("exerciseId") or item.get("id"),
                                "payload": item,
                                "error": str(exc),
                            }
                        )
                if len(page) < limit:
                    break
                offset += limit
        return exercises

    async def get_exercise(self, external_id: str) -> ProviderExercise | None:
        """Fetch a single ExerciseDB exercise by external ID."""

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{self.base_url}/exercises/exercise/{external_id}",
                headers=self.headers,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return self._normalize(response.json())

    async def search_exercises(self, query: str) -> list[ProviderExercise]:
        """Search by fetching the catalog and filtering normalized names."""

        normalized_query = query.lower()
        return [
            exercise
            for exercise in await self.list_exercises()
            if normalized_query in exercise.name.lower()
        ]

    async def list_equipment(self) -> list[str]:
        """Return equipment labels observed in the provider catalog."""

        return sorted({exercise.equipment for exercise in await self.list_exercises() if exercise.equipment})

    async def list_body_parts(self) -> list[str]:
        """Return body part labels observed in the provider catalog."""

        return sorted({exercise.body_part for exercise in await self.list_exercises() if exercise.body_part})

    async def list_target_muscles(self) -> list[str]:
        """Return target muscle labels observed in the provider catalog."""

        return sorted(
            {exercise.primary_muscle for exercise in await self.list_exercises() if exercise.primary_muscle}
        )

    def _normalize(self, item: dict[str, Any]) -> ProviderExercise:
        """Map ExerciseDB V2 fields into the provider-neutral model."""

        external_id = item.get("exerciseId") or item.get("id")
        name = item.get("name")
        if not external_id or not name:
            raise ValueError("ExerciseDB record is missing exerciseId/id or name.")
        equipments = item.get("equipments") or []
        body_parts = item.get("bodyParts") or []
        target_muscles = item.get("targetMuscles") or []
        secondary_muscles = item.get("secondaryMuscles") or []
        image_url = item.get("imageUrl")
        video_url = item.get("videoUrl")
        return ProviderExercise(
            external_id=str(external_id),
            name=str(name),
            primary_muscle=titleish(target_muscles[0] if target_muscles else None),
            secondary_muscles=[titleish(muscle) or muscle for muscle in secondary_muscles],
            body_part=titleish(body_parts[0] if body_parts else None),
            equipment=titleish(equipments[0] if equipments else None),
            movement_category=titleish(item.get("exerciseType")),
            instructions=list(item.get("instructions") or []),
            image_url=image_url,
            animation_url=video_url,
            thumbnail_url=image_url,
        )

    def _retry_after_seconds(self, header_value: str | None) -> int:
        """Parse and bound an HTTP Retry-After value."""

        fallback = 2
        if not header_value:
            return fallback
        try:
            delay = int(header_value)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(header_value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                delay = int((retry_at - datetime.now(UTC)).total_seconds())
            except (TypeError, ValueError):
                delay = fallback
        return max(1, min(delay, self.settings.exercise_api_max_retry_delay_seconds))

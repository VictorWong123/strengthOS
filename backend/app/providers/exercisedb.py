"""ExerciseDB provider backed by RapidAPI."""

from typing import Any
from urllib.parse import quote

import httpx

from app.config import Settings
from app.providers.base import ExerciseProvider, ProviderExercise
from app.providers.exercisedb_client import ExerciseDBClient
from app.providers.normalization import titleish


class ExerciseDBProvider(ExerciseProvider):
    """Fetch and normalize exercises from ExerciseDB through RapidAPI."""

    source = "exercisedb"

    def __init__(self, settings: Settings) -> None:
        """Create a provider using backend-only RapidAPI credentials."""

        self.settings = settings
        self.failures: list[dict[str, Any]] = []
        self.client = ExerciseDBClient(settings)

    async def list_exercises(self) -> list[ProviderExercise]:
        """Fetch the paginated ExerciseDB catalog."""

        self.failures = []
        async with httpx.AsyncClient(timeout=30) as client:
            response = await self.client.get(
                client,
                "/exercises",
                params={"limit": self.settings.exercise_sync_page_size, "offset": 0},
            )
            if response.status_code == 403:
                return await self._list_exercises_by_body_part(client)

            response.raise_for_status()
            return await self._list_paginated_exercises(client, "/exercises", first_response=response)

    async def _list_exercises_by_body_part(self, client: httpx.AsyncClient) -> list[ProviderExercise]:
        """Fetch the catalog through body-part endpoints when the all-exercises endpoint is unavailable."""

        response = await self.client.get(client, "/exercises/bodyPartList")
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("ExerciseDB bodyPartList response must be a list.")

        exercises_by_external_id: dict[str, ProviderExercise] = {}
        for body_part in payload:
            if not isinstance(body_part, str) or not body_part:
                continue
            page_exercises = await self._list_paginated_exercises(
                client,
                f"/exercises/bodyPart/{quote(body_part, safe='')}",
            )
            for exercise in page_exercises:
                exercises_by_external_id[exercise.external_id] = exercise

        return list(exercises_by_external_id.values())

    async def _list_paginated_exercises(
        self,
        client: httpx.AsyncClient,
        path: str,
        *,
        first_response: httpx.Response | None = None,
    ) -> list[ProviderExercise]:
        """Fetch and normalize one paginated ExerciseDB list endpoint."""

        exercises: list[ProviderExercise] = []
        seen_external_ids: set[str] = set()
        offset = 0
        limit = self.settings.exercise_sync_page_size

        while True:
            if first_response is not None and offset == 0:
                response = first_response
            else:
                response = await self.client.get(
                    client,
                    path,
                    params={"limit": limit, "offset": offset},
                )

            response.raise_for_status()
            page = response.json()
            if not page:
                break
            if not isinstance(page, list):
                raise ValueError("ExerciseDB exercise list response must be a list.")
            new_count = 0
            for item in page:
                try:
                    exercise = self._normalize(item)
                    if exercise.external_id in seen_external_ids:
                        continue
                    seen_external_ids.add(exercise.external_id)
                    exercises.append(exercise)
                    new_count += 1
                except Exception as exc:
                    payload = item if isinstance(item, dict) else {"value": item}
                    self.failures.append(
                        {
                            "external_id": payload.get("exerciseId") or payload.get("id"),
                            "payload": payload,
                            "error": str(exc),
                        }
                    )
            if new_count == 0:
                break
            offset += len(page)

        return exercises

    async def get_exercise(self, external_id: str) -> ProviderExercise | None:
        """Fetch a single ExerciseDB exercise by external ID."""

        async with httpx.AsyncClient(timeout=30) as client:
            response = await self.client.get(client, f"/exercises/exercise/{external_id}")
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
        external_id = str(external_id)
        equipments = item.get("equipments") or []
        body_parts = item.get("bodyParts") or []
        target_muscles = item.get("targetMuscles") or []
        secondary_muscles = item.get("secondaryMuscles") or []
        image_url = item.get("imageUrl") or f"/api/exercise-images/{external_id}?resolution=180"
        video_url = item.get("videoUrl")
        return ProviderExercise(
            external_id=external_id,
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

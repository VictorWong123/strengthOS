"""Shared ExerciseDB HTTP helpers."""

import asyncio
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import httpx

from app.config import Settings


class ExerciseDBClient:
    """Small RapidAPI ExerciseDB client with shared auth headers and retry behavior."""

    def __init__(self, settings: Settings) -> None:
        """Create a client from backend-only ExerciseDB settings."""

        self.settings = settings
        self.base_url = settings.exercise_api_base_url.rstrip("/")
        self.headers = {
            "x-rapidapi-host": settings.exercise_api_host,
            "x-rapidapi-key": settings.exercise_api_key.get_secret_value(),
            "content-type": "application/json",
        }

    async def get(
        self,
        client: httpx.AsyncClient,
        path: str,
        params: dict[str, int | str] | None = None,
    ) -> httpx.Response:
        """GET one ExerciseDB endpoint with bounded 429 retry handling."""

        retries = 0
        while True:
            response = await client.get(
                f"{self.base_url}{path}",
                headers=self.headers,
                params=params,
            )
            if response.status_code != 429:
                return response
            if retries >= self.settings.exercise_api_max_retries:
                response.raise_for_status()
            retry_after = retry_after_seconds(
                response.headers.get("retry-after"),
                self.settings.exercise_api_max_retry_delay_seconds,
            )
            await asyncio.sleep(retry_after)
            retries += 1


def retry_after_seconds(header_value: str | None, max_delay_seconds: int) -> int:
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
    return max(1, min(delay, max_delay_seconds))

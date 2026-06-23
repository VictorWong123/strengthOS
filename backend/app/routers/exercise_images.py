"""ExerciseDB image proxy endpoints."""

import re

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.providers.exercisedb_client import ExerciseDBClient

router = APIRouter(prefix="/exercise-images", tags=["exercise-images"])

EXERCISEDB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ALLOWED_RESOLUTIONS = {"180", "360", "720", "1080"}


@router.get("/{external_id}")
async def get_exercise_image(
    external_id: str,
    resolution: str = Query(default="180"),
) -> StreamingResponse:
    """Stream an ExerciseDB GIF for the provider exercise id without exposing the API key."""

    if not EXERCISEDB_ID_PATTERN.fullmatch(external_id):
        raise HTTPException(status_code=400, detail="Invalid exercise id.")
    if resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Invalid image resolution.")

    settings = get_settings()
    if not settings.has_exercise_credentials:
        raise HTTPException(status_code=503, detail="Exercise image provider is not configured.")

    provider_client = ExerciseDBClient(settings)
    params = {"exerciseId": external_id, "resolution": resolution}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await provider_client.get(client, "/image", params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Exercise image provider request failed.") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Exercise image not found.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Exercise image provider returned an error.")

    content_type = response.headers.get("content-type", "image/gif")
    return StreamingResponse(
        iter([response.content]),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )

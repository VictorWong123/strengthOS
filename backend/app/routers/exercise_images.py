"""ExerciseDB image proxy endpoints."""

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from app.config import get_settings
from app.providers.exercisedb_client import ExerciseDBClient

router = APIRouter(prefix="/exercise-images", tags=["exercise-images"])

EXERCISEDB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ALLOWED_RESOLUTIONS = {"180", "360", "720", "1080"}
IMAGE_CACHE_DIR = Path(".cache/exercise-images")
CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
PROVIDER_DAILY_MISS_LIMIT = 500


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

    cached = read_cached_image(external_id, resolution)
    if cached:
        content, content_type = cached
        return Response(
            content=content,
            media_type=content_type,
            headers={"Cache-Control": f"public, max-age={CACHE_MAX_AGE_SECONDS}"},
        )

    settings = get_settings()
    if not settings.has_exercise_credentials:
        raise HTTPException(status_code=503, detail="Exercise image provider is not configured.")

    if not reserve_provider_miss():
        raise HTTPException(status_code=429, detail="Exercise image provider daily cache-miss limit reached.")

    provider_client = ExerciseDBClient(settings)
    params = {"exerciseId": external_id, "resolution": resolution}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await provider_client.get(client, "/image", params=params)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Exercise image provider rate limit reached.") from exc
        raise HTTPException(status_code=502, detail="Exercise image provider returned an error.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Exercise image provider request failed.") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Exercise image not found.")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Exercise image provider rate limit reached.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Exercise image provider returned an error.")

    content_type = response.headers.get("content-type", "image/gif")
    write_cached_image(external_id, resolution, response.content, content_type)
    return StreamingResponse(
        iter([response.content]),
        media_type=content_type,
        headers={"Cache-Control": f"public, max-age={CACHE_MAX_AGE_SECONDS}"},
    )


def read_cached_image(external_id: str, resolution: str) -> tuple[bytes, str] | None:
    """Return a cached image body and media type when this image was fetched before."""

    content_path, metadata_path = cache_paths(external_id, resolution)
    if not content_path.exists():
        return None
    content_type = "image/gif"
    if metadata_path.exists():
        content_type = metadata_path.read_text(encoding="utf-8").strip() or content_type
    return content_path.read_bytes(), content_type


def write_cached_image(external_id: str, resolution: str, content: bytes, content_type: str) -> None:
    """Persist provider images so browsing exercise lists does not exhaust RapidAPI quota."""

    if not content:
        return
    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    content_path, metadata_path = cache_paths(external_id, resolution)
    content_path.write_bytes(content)
    metadata_path.write_text(content_type, encoding="utf-8")


def cache_paths(external_id: str, resolution: str) -> tuple[Path, Path]:
    """Build stable cache paths without trusting provider ids as file names."""

    digest = hashlib.sha256(f"{external_id}:{resolution}".encode("utf-8")).hexdigest()
    return IMAGE_CACHE_DIR / f"{digest}.bin", IMAGE_CACHE_DIR / f"{digest}.type"


def reserve_provider_miss() -> bool:
    """Reserve one daily provider request for an uncached image fetch."""

    today = datetime.now(UTC).date().isoformat()
    state_path = IMAGE_CACHE_DIR / "daily-provider-misses.json"
    count = 0
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if state.get("date") == today:
                count = int(state.get("count", 0))
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            count = 0
    if count >= PROVIDER_DAILY_MISS_LIMIT:
        return False

    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"date": today, "count": count + 1}), encoding="utf-8")
    return True

"""Authenticated ExerciseDB image proxy with bounded local caching."""

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Annotated
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth.dependencies import AuthenticatedUser, get_authenticated_user
from app.config import get_settings
from app.services.supabase import SupabaseService

router = APIRouter(prefix="/exercise-images", tags=["exercise-images"])

EXERCISEDB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
ALLOWED_RESOLUTIONS = {"180", "360", "720", "1080"}
IMAGE_CACHE_DIR = Path(".cache/exercise-images")
CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
PROVIDER_DAILY_MISS_LIMIT = 500
CACHE_MAX_BYTES = 256 * 1024 * 1024
MAX_IMAGE_BYTES = 20 * 1024 * 1024
NEGATIVE_CACHE_SECONDS = 5 * 60
ALLOWED_CONTENT_TYPES = {"image/gif", "image/jpeg", "image/png", "image/webp"}

_fetch_locks: dict[str, asyncio.Lock] = {}
_fetch_locks_guard = Lock()


@dataclass(frozen=True)
class CachedImage:
    """Validated cached provider response."""

    content: bytes
    content_type: str


@dataclass(frozen=True)
class ProviderImage:
    """Bounded provider response needed by proxy logic."""

    content: bytes
    content_type: str
    status_code: int


@router.get("/{external_id}")
async def get_exercise_image(
    external_id: str,
    resolution: str = Query(default="180"),
    user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)] = None,
) -> Response:
    """Stream an ExerciseDB GIF for the provider exercise id without exposing the API key."""

    if not EXERCISEDB_ID_PATTERN.fullmatch(external_id):
        raise HTTPException(status_code=400, detail="Invalid exercise id.")
    if resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Invalid image resolution.")

    cached = read_cached_image(external_id, resolution)
    if cached:
        return cached_response(cached)

    settings = get_settings()
    if settings.exercise_api_provider.strip().casefold() != "exercisedb":
        raise HTTPException(status_code=404, detail="Exercise image not available in seed mode.")
    if not settings.has_exercise_credentials or not settings.has_supabase_credentials:
        raise HTTPException(status_code=503, detail="Exercise image provider is not configured.")

    cache_key = cache_digest(external_id, resolution)
    persistent = await read_persistent_cache(cache_key, settings)
    if persistent:
        write_cached_image(external_id, resolution, persistent.content, persistent.content_type)
        return cached_response(persistent)

    lock = fetch_lock(external_id, resolution)
    async with lock:
        cached = read_cached_image(external_id, resolution)
        if cached:
            return cached_response(cached)
        await ensure_visible_exercise(external_id, user, settings)
        async with SupabaseService(settings) as service:
            state = await service.rpc(
                "claim_exercise_image_fetch",
                {
                    "p_cache_key": cache_key,
                    "p_external_id": external_id,
                    "p_resolution": resolution,
                    "p_daily_limit": PROVIDER_DAILY_MISS_LIMIT,
                },
            )
            if state == "ready":
                persistent = await read_persistent_cache(cache_key, settings, service)
                if persistent:
                    write_cached_image(external_id, resolution, persistent.content, persistent.content_type)
                    return cached_response(persistent)
                raise HTTPException(status_code=503, detail="Cached exercise image is temporarily unavailable.")
            if state == "missing":
                raise HTTPException(status_code=404, detail="Exercise image not found.")
            if state == "quota":
                raise HTTPException(status_code=429, detail="Exercise image provider daily cache-miss limit reached.")
            if state == "busy":
                persistent = await wait_for_persistent_cache(cache_key, settings, service)
                if persistent:
                    write_cached_image(external_id, resolution, persistent.content, persistent.content_type)
                    return cached_response(persistent)
                raise HTTPException(status_code=503, detail="Exercise image is still being cached.")

        response = await fetch_provider_image(external_id, resolution, settings)
        async with SupabaseService(settings) as cache_service:
            if response.status_code == 404:
                await store_cache_state(cache_service, cache_key, external_id, resolution, "missing", NEGATIVE_CACHE_SECONDS)
                raise HTTPException(status_code=404, detail="Exercise image not found.")
            if response.status_code == 429:
                await store_cache_state(cache_service, cache_key, external_id, resolution, "failed", 0)
                raise HTTPException(status_code=429, detail="Exercise image provider rate limit reached.")
            if response.status_code >= 400:
                await store_cache_state(cache_service, cache_key, external_id, resolution, "failed", 0)
                raise HTTPException(status_code=502, detail="Exercise image provider returned an error.")

            content_type = response.content_type
            if content_type not in ALLOWED_CONTENT_TYPES or not response.content:
                await store_cache_state(cache_service, cache_key, external_id, resolution, "failed", 0)
                raise HTTPException(status_code=502, detail="Exercise image provider returned invalid content.")
            object_path = f"{cache_key}/{uuid4().hex}.bin"
            await cache_service.upload_storage_object("exercise-media-cache", object_path, response.content, content_type)
            await store_cache_state(
                cache_service,
                cache_key,
                external_id,
                resolution,
                "ready",
                CACHE_MAX_AGE_SECONDS,
                object_path=object_path,
                content_type=content_type,
                size_bytes=len(response.content),
            )
            await cleanup_persistent_cache(cache_service)
        write_cached_image(external_id, resolution, response.content, content_type)
        return cached_response(CachedImage(response.content, content_type))


async def read_persistent_cache(
    cache_key: str,
    settings,
    service: SupabaseService | None = None,
) -> CachedImage | None:
    """Read a non-expired image from private Supabase Storage."""

    owns_service = service is None
    resolved = service or SupabaseService(settings)
    try:
        rows = await resolved.select(
            "exercise_image_cache",
            "object_path,content_type",
            cache_key=f"eq.{cache_key}",
            status="eq.ready",
            expires_at=f"gt.{datetime.now(UTC).isoformat()}",
            limit=1,
        )
        if not rows or not rows[0].get("object_path") or rows[0].get("content_type") not in ALLOWED_CONTENT_TYPES:
            return None
        content = await resolved.download_storage_object("exercise-media-cache", rows[0]["object_path"])
        if not content or len(content) > MAX_IMAGE_BYTES:
            return None
        return CachedImage(content, rows[0]["content_type"])
    except httpx.HTTPError:
        return None
    finally:
        if owns_service:
            await resolved.aclose()


async def wait_for_persistent_cache(cache_key: str, settings, service: SupabaseService) -> CachedImage | None:
    """Wait briefly for another backend instance that owns the fetch lease."""

    for _ in range(10):
        await asyncio.sleep(0.25)
        cached = await read_persistent_cache(cache_key, settings, service)
        if cached:
            return cached
    return None


async def store_cache_state(
    service: SupabaseService,
    cache_key: str,
    external_id: str,
    resolution: str,
    status: str,
    max_age_seconds: int,
    *,
    object_path: str | None = None,
    content_type: str | None = None,
    size_bytes: int | None = None,
) -> None:
    """Publish provider fetch outcome for every backend instance."""

    await service.upsert(
        "exercise_image_cache",
        {
            "cache_key": cache_key,
            "external_id": external_id,
            "resolution": resolution,
            "status": status,
            "object_path": object_path,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "expires_at": (datetime.now(UTC) + timedelta(seconds=max_age_seconds)).isoformat(),
            "lease_until": None,
            "last_accessed_at": datetime.now(UTC).isoformat(),
        },
        "cache_key",
    )


async def cleanup_persistent_cache(service: SupabaseService) -> None:
    """Atomically claim expired/LRU rows, then delete their versioned objects."""

    doomed = await service.rpc("evict_exercise_image_cache", {"p_max_bytes": CACHE_MAX_BYTES})
    if not isinstance(doomed, list):
        return
    await service.delete_storage_objects(
        "exercise-media-cache",
        [str(row["object_path"]) for row in doomed if row.get("object_path")],
    )


async def fetch_provider_image(external_id: str, resolution: str, settings) -> ProviderImage:
    """Fetch one image without retries and stop reading above the size limit."""

    headers = {
        "x-rapidapi-host": settings.exercise_api_host,
        "x-rapidapi-key": settings.exercise_api_key.get_secret_value(),
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "GET",
                f"{settings.exercise_api_base_url.rstrip('/')}/image",
                headers=headers,
                params={"exerciseId": external_id, "resolution": resolution},
            ) as response:
                content_length = int(response.headers.get("content-length", "0") or 0)
                if content_length > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=502, detail="Exercise image provider response is too large.")
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_IMAGE_BYTES:
                        raise HTTPException(status_code=502, detail="Exercise image provider response is too large.")
                content_type = response.headers.get("content-type", "").partition(";")[0].strip().casefold()
                return ProviderImage(bytes(content), content_type, response.status_code)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Exercise image provider request failed.") from exc


async def ensure_visible_exercise(external_id: str, user: AuthenticatedUser, settings) -> None:
    """Reject uncached provider requests for unknown or hidden catalog rows."""

    if user is None or not settings.has_supabase_credentials:
        raise HTTPException(status_code=503, detail="Exercise catalog validation is unavailable.")
    async with SupabaseService(settings) as service:
        rows = await service.select(
            "exercises",
            "id",
            external_id=f"eq.{external_id}",
            source="eq.exercisedb",
            is_active="eq.true",
            limit=1,
            **{"or": f"(user_id.is.null,user_id.eq.{user.id})"},
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Exercise image not found.")


def read_cached_image(external_id: str, resolution: str) -> CachedImage | None:
    """Return a cached image body and media type when this image was fetched before."""

    content_path, metadata_path, _ = cache_paths(external_id, resolution)
    if not content_path.exists() or not metadata_path.exists():
        return None
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(metadata["fetched_at"])
        if datetime.now(UTC) - fetched_at > timedelta(seconds=CACHE_MAX_AGE_SECONDS):
            content_path.unlink(missing_ok=True)
            metadata_path.unlink(missing_ok=True)
            return None
        content_type = str(metadata["content_type"])
        if content_type not in ALLOWED_CONTENT_TYPES:
            return None
        content_path.touch()
        metadata_path.touch()
        return CachedImage(content_path.read_bytes(), content_type)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def write_cached_image(external_id: str, resolution: str, content: bytes, content_type: str) -> None:
    """Persist provider images so browsing exercise lists does not exhaust RapidAPI quota."""

    if not content:
        return
    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    content_path, metadata_path, negative_path = cache_paths(external_id, resolution)
    content_path.write_bytes(content)
    metadata_path.write_text(
        json.dumps({"content_type": content_type, "fetched_at": datetime.now(UTC).isoformat()}),
        encoding="utf-8",
    )
    negative_path.unlink(missing_ok=True)
    enforce_cache_limit()


def cache_paths(external_id: str, resolution: str) -> tuple[Path, Path, Path]:
    """Build stable cache paths without trusting provider ids as file names."""

    digest = cache_digest(external_id, resolution)
    return (
        IMAGE_CACHE_DIR / f"{digest}.bin",
        IMAGE_CACHE_DIR / f"{digest}.json",
        IMAGE_CACHE_DIR / f"{digest}.missing",
    )


def cache_digest(external_id: str, resolution: str) -> str:
    return hashlib.sha256(f"{external_id}:{resolution}".encode("utf-8")).hexdigest()


def cached_response(cached: CachedImage) -> Response:
    """Return cache-friendly media response."""

    return Response(
        content=cached.content,
        media_type=cached.content_type,
        headers={"Cache-Control": f"private, max-age={CACHE_MAX_AGE_SECONDS}, immutable"},
    )


def fetch_lock(external_id: str, resolution: str) -> asyncio.Lock:
    """Return process-local lock that coalesces identical misses."""

    key = f"{external_id}:{resolution}"
    with _fetch_locks_guard:
        return _fetch_locks.setdefault(key, asyncio.Lock())


def enforce_cache_limit() -> None:
    """Evict least recently used image files until cache is under its byte cap."""

    files = sorted(IMAGE_CACHE_DIR.glob("*.bin"), key=lambda path: path.stat().st_mtime)
    total = sum(path.stat().st_size for path in files)
    while files and total > CACHE_MAX_BYTES:
        path = files.pop(0)
        total -= path.stat().st_size
        path.unlink(missing_ok=True)
        path.with_suffix(".json").unlink(missing_ok=True)

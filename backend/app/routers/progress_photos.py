"""Authenticated progress-photo upload and deletion."""

from datetime import date
from io import BytesIO
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.auth.dependencies import AuthenticatedUser, get_authenticated_user
from app.config import get_settings
from app.services.supabase import SupabaseService

router = APIRouter(prefix="/progress-photos", tags=["progress-photos"])
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 24_000_000
MAX_DIMENSION = 4096
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@router.post("")
async def upload_progress_photo(
    request: Request,
    measured_at: date = Query(...),
    caption: str | None = Query(default=None, max_length=240),
    user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)] = None,
) -> dict[str, object]:
    """Validate, resize, strip metadata, and store one private WebP photo."""

    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo is too large.")
    encoded = sanitize_photo(bytes(content))
    photo_id = uuid4()
    storage_path = f"{user.id}/{photo_id}.webp"
    row = {
        "id": str(photo_id),
        "user_id": user.id,
        "measured_at": measured_at.isoformat(),
        "storage_path": storage_path,
        "caption": caption.strip() if caption and caption.strip() else None,
    }
    settings = get_settings()
    try:
        async with SupabaseService(settings) as service:
            saved = await service.insert("progress_photos", row)
            try:
                await service.upload_storage_object("progress-photos", storage_path, encoded, "image/webp")
            except Exception:
                try:
                    await service.delete("progress_photos", id=f"eq.{photo_id}", user_id=f"eq.{user.id}")
                except Exception:
                    pass
                raise
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to store progress photo.") from exc
    return saved


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_progress_photo(
    photo_id: UUID,
    user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)] = None,
) -> None:
    """Delete one owned Storage object before removing its metadata row."""

    settings = get_settings()
    async with SupabaseService(settings) as service:
        rows = await service.select(
            "progress_photos",
            "id,storage_path",
            id=f"eq.{photo_id}",
            user_id=f"eq.{user.id}",
            limit=1,
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Progress photo not found.")
        await service.delete_storage_objects("progress-photos", [rows[0]["storage_path"]])
        await service.delete("progress_photos", id=f"eq.{photo_id}", user_id=f"eq.{user.id}")


def sanitize_photo(content: bytes) -> bytes:
    """Decode untrusted image bytes and re-encode without EXIF, XMP, or ICC data."""

    if not content:
        raise HTTPException(status_code=400, detail="Photo is empty.")
    try:
        with Image.open(BytesIO(content)) as source:
            source.verify()
        with Image.open(BytesIO(content)) as source:
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=400, detail="Photo dimensions are too large.")
            oriented = ImageOps.exif_transpose(source)
            image = oriented.convert("RGBA" if oriented.has_transparency_data else "RGB")
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
            output = BytesIO()
            image.save(output, format="WEBP", quality=90, method=4, exif=b"", icc_profile=None)
            return output.getvalue()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Unsupported or invalid photo.") from exc

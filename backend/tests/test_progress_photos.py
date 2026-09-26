import asyncio
from io import BytesIO
from threading import Event

import pytest
from fastapi import HTTPException
from PIL import Image

from app.routers import progress_photos
from app.routers.progress_photos import read_and_sanitize_photo, sanitize_photo


class FakeRequest:
    def __init__(self, content: bytes) -> None:
        self.content = content

    async def stream(self):
        yield self.content


class SlowRequest:
    async def stream(self):
        await asyncio.sleep(1)
        yield b"photo"


def test_sanitize_photo_applies_orientation_and_strips_metadata() -> None:
    source = Image.new("RGB", (2, 3), "red")
    exif = source.getexif()
    exif[274] = 6
    raw = BytesIO()
    source.save(raw, format="JPEG", exif=exif)

    sanitized = sanitize_photo(raw.getvalue())

    with Image.open(BytesIO(sanitized)) as result:
        assert result.format == "WEBP"
        assert result.size == (3, 2)
        assert "exif" not in result.info
        assert "xmp" not in result.info


def test_sanitize_photo_rejects_invalid_bytes() -> None:
    with pytest.raises(HTTPException, match="Unsupported or invalid"):
        sanitize_photo(b"not-an-image")


def test_sanitize_photo_preserves_transparency() -> None:
    source = Image.new("RGBA", (2, 2), (255, 0, 0, 0))
    raw = BytesIO()
    source.save(raw, format="PNG")

    with Image.open(BytesIO(sanitize_photo(raw.getvalue()))) as result:
        assert result.mode == "RGBA"
        assert result.getpixel((0, 0))[3] == 0


@pytest.mark.asyncio
async def test_photo_processing_is_bounded_and_keeps_slot_until_cancelled_work_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = Event()
    finish = Event()

    def blocking_sanitize(content: bytes) -> bytes:
        started.set()
        finish.wait(timeout=2)
        return content

    monkeypatch.setattr(progress_photos, "sanitize_photo", blocking_sanitize)
    async def admitted_photo() -> bytes:
        progress_photos.acquire_upload_slot()
        try:
            return await read_and_sanitize_photo(FakeRequest(b"photo"))
        finally:
            progress_photos._upload_slots.release()

    tasks = [asyncio.create_task(admitted_photo()) for _ in range(progress_photos.MAX_CONCURRENT_UPLOADS)]
    await asyncio.to_thread(started.wait, 1)

    with pytest.raises(HTTPException) as exc_info:
        progress_photos.acquire_upload_slot()
    assert exc_info.value.status_code == 503

    tasks[0].cancel()
    await asyncio.sleep(0)
    tasks[0].cancel()
    await asyncio.sleep(0)
    with pytest.raises(HTTPException) as exc_info:
        progress_photos.acquire_upload_slot()
    assert exc_info.value.status_code == 503

    finish.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    assert isinstance(results[0], asyncio.CancelledError)
    progress_photos.acquire_upload_slot()
    progress_photos._upload_slots.release()


@pytest.mark.asyncio
async def test_photo_upload_read_has_total_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(progress_photos, "UPLOAD_READ_TIMEOUT_SECONDS", 0.01)
    progress_photos.acquire_upload_slot()
    try:
        with pytest.raises(HTTPException) as exc_info:
            await read_and_sanitize_photo(SlowRequest())
    finally:
        progress_photos._upload_slots.release()

    assert exc_info.value.status_code == 408

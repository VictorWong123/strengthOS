from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.routers.progress_photos import sanitize_photo


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

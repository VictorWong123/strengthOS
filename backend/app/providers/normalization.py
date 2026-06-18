"""Normalization and alias helpers for exercise search and storage."""

import re

ALIAS_MAP: dict[str, list[str]] = {
    "barbell bench press": ["bench", "bench press", "barbell bench"],
    "dumbbell bench press": ["db bench", "dumbbell bench"],
    "smith machine bench press": ["smith bench", "smith machine bench"],
    "chest press machine": ["chest press", "machine press"],
    "lat pulldown": ["lat pull down", "pulldown"],
    "seated cable row": ["cable row", "row cable"],
    "romanian deadlift": ["rdl", "romanian deadlift"],
}


def normalize_text(value: str | None) -> str:
    """Normalize text for matching by lowercasing and removing punctuation."""

    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def titleish(value: str | None) -> str | None:
    """Convert provider labels into readable title-case strings."""

    if not value:
        return None
    return " ".join(word.capitalize() for word in normalize_text(value).split())


def aliases_for_name(name: str) -> list[str]:
    """Return normalized aliases for an exercise name."""

    normalized = normalize_text(name)
    aliases = {normalized}
    for canonical, mapped_aliases in ALIAS_MAP.items():
        if canonical in normalized or normalized in canonical:
            aliases.update(normalize_text(alias) for alias in mapped_aliases)
    return sorted(alias for alias in aliases if alias)

"""Factory for selecting the configured exercise provider."""

from app.config import Settings
from app.providers.base import ExerciseProvider
from app.providers.exercisedb import ExerciseDBProvider
from app.providers.seed import SeedExerciseProvider


def get_exercise_provider(settings: Settings) -> ExerciseProvider:
    """Return the explicitly configured exercise provider.

    Seed data is only used when requested with ``exercise_api_provider=seed``.
    ExerciseDB misconfiguration raises so catalog syncs do not silently import
    fallback data under the wrong source.
    """

    provider = settings.exercise_api_provider.strip().lower()
    if provider == "seed":
        return SeedExerciseProvider()
    if provider == "exercisedb" and settings.has_exercise_credentials:
        return ExerciseDBProvider(settings)
    if provider == "exercisedb":
        raise ValueError("ExerciseDB provider requires RapidAPI key and host configuration.")
    raise ValueError(f"Unsupported exercise API provider: {settings.exercise_api_provider}")

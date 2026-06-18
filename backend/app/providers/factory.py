"""Factory for selecting the configured exercise provider."""

from app.config import Settings
from app.providers.base import ExerciseProvider
from app.providers.exercisedb import ExerciseDBProvider
from app.providers.seed import SeedExerciseProvider


def get_exercise_provider(settings: Settings) -> ExerciseProvider:
    """Return ExerciseDB when configured, otherwise the local seed provider."""

    if settings.exercise_api_provider == "exercisedb" and settings.has_exercise_credentials:
        return ExerciseDBProvider(settings)
    return SeedExerciseProvider()

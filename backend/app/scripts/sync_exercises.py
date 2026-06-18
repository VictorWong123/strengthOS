"""Command-line entrypoint for ExerciseDB-to-Supabase sync."""

import asyncio

from app.config import Settings, get_settings
from app.services.exercise_sync import ExerciseSyncResult, sync_catalog


async def sync_exercises(settings: Settings | None = None) -> ExerciseSyncResult:
    """Run the configured exercise catalog synchronization."""

    return await sync_catalog(settings or get_settings())


def main() -> None:
    """Run the sync job from `python -m app.scripts.sync_exercises`."""

    result = asyncio.run(sync_exercises())
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()

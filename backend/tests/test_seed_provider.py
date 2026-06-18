import pytest

from app.providers.seed import SeedExerciseProvider


@pytest.mark.asyncio
async def test_seed_provider_has_distinct_bench_variations() -> None:
    provider = SeedExerciseProvider()
    exercises = await provider.list_exercises()
    names = {exercise.name for exercise in exercises}

    assert "Barbell Bench Press" in names
    assert "Dumbbell Bench Press" in names
    assert "Smith Machine Bench Press" in names

"""Small fallback exercise catalog used without ExerciseDB credentials."""

from app.providers.base import ExerciseProvider, ProviderExercise

SEED_EXERCISES = [
    ProviderExercise(
        external_id="seed-barbell-bench-press",
        name="Barbell Bench Press",
        primary_muscle="Chest",
        secondary_muscles=["Triceps", "Front Delts"],
        body_part="Chest",
        equipment="Barbell",
        movement_category="Strength",
        instructions=["Lie on a bench.", "Lower the bar to your chest.", "Press the bar upward."],
    ),
    ProviderExercise(
        external_id="seed-dumbbell-bench-press",
        name="Dumbbell Bench Press",
        primary_muscle="Chest",
        secondary_muscles=["Triceps", "Front Delts"],
        body_part="Chest",
        equipment="Dumbbell",
        movement_category="Strength",
        instructions=["Lie on a bench with dumbbells.", "Lower under control.", "Press upward evenly."],
    ),
    ProviderExercise(
        external_id="seed-smith-machine-bench-press",
        name="Smith Machine Bench Press",
        primary_muscle="Chest",
        secondary_muscles=["Triceps", "Front Delts"],
        body_part="Chest",
        equipment="Smith Machine",
        movement_category="Strength",
        instructions=["Set the bench under the Smith bar.", "Lower to chest height.", "Press to lockout."],
    ),
    ProviderExercise(
        external_id="seed-lat-pulldown",
        name="Lat Pulldown",
        primary_muscle="Lats",
        secondary_muscles=["Biceps", "Upper Back"],
        body_part="Back",
        equipment="Cable",
        movement_category="Strength",
        instructions=["Grip the bar.", "Pull toward the upper chest.", "Return under control."],
    ),
    ProviderExercise(
        external_id="seed-romanian-deadlift",
        name="Romanian Deadlift",
        primary_muscle="Hamstrings",
        secondary_muscles=["Glutes", "Lower Back"],
        body_part="Legs",
        equipment="Barbell",
        movement_category="Strength",
        instructions=["Stand tall with the bar.", "Hinge at the hips.", "Return by driving hips forward."],
    ),
]


class SeedExerciseProvider(ExerciseProvider):
    """Local provider used when external ExerciseDB credentials are missing."""

    source = "seed"

    async def list_exercises(self) -> list[ProviderExercise]:
        """Return the bundled seed exercises."""

        return SEED_EXERCISES

    async def get_exercise(self, external_id: str) -> ProviderExercise | None:
        """Return one bundled exercise by external ID."""

        return next((exercise for exercise in SEED_EXERCISES if exercise.external_id == external_id), None)

    async def search_exercises(self, query: str) -> list[ProviderExercise]:
        """Search bundled exercises by name."""

        normalized_query = query.lower()
        return [exercise for exercise in SEED_EXERCISES if normalized_query in exercise.name.lower()]

    async def list_equipment(self) -> list[str]:
        """Return equipment labels in the seed catalog."""

        return sorted({exercise.equipment for exercise in SEED_EXERCISES if exercise.equipment})

    async def list_body_parts(self) -> list[str]:
        """Return body part labels in the seed catalog."""

        return sorted({exercise.body_part for exercise in SEED_EXERCISES if exercise.body_part})

    async def list_target_muscles(self) -> list[str]:
        """Return target muscle labels in the seed catalog."""

        return sorted({exercise.primary_muscle for exercise in SEED_EXERCISES if exercise.primary_muscle})

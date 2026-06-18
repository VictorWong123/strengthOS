"""Provider interface for external exercise catalogs."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(slots=True)
class ProviderExercise:
    """Normalized exercise data returned by an exercise provider."""

    external_id: str
    name: str
    primary_muscle: str | None = None
    secondary_muscles: list[str] = field(default_factory=list)
    body_part: str | None = None
    equipment: str | None = None
    movement_category: str | None = None
    instructions: list[str] = field(default_factory=list)
    image_url: str | None = None
    animation_url: str | None = None
    thumbnail_url: str | None = None


class ExerciseProvider(ABC):
    """Abstract catalog provider used by sync jobs."""

    source: str

    @abstractmethod
    async def list_exercises(self) -> list[ProviderExercise]:
        """Return all available provider exercises."""

    @abstractmethod
    async def get_exercise(self, external_id: str) -> ProviderExercise | None:
        """Return a single provider exercise by external ID."""

    @abstractmethod
    async def search_exercises(self, query: str) -> list[ProviderExercise]:
        """Return provider exercises matching a search query."""

    @abstractmethod
    async def list_equipment(self) -> list[str]:
        """Return known equipment values."""

    @abstractmethod
    async def list_body_parts(self) -> list[str]:
        """Return known body part values."""

    @abstractmethod
    async def list_target_muscles(self) -> list[str]:
        """Return known target muscle values."""

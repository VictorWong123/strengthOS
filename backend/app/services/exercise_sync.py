"""Exercise catalog synchronization service."""

from datetime import UTC, datetime

from pydantic import BaseModel

from app.config import Settings
from app.providers.base import ProviderExercise
from app.providers.factory import get_exercise_provider
from app.providers.normalization import aliases_for_name, normalize_text
from app.services.supabase import SupabaseService


class ExerciseSyncResult(BaseModel):
    """Summary of an exercise catalog synchronization run."""

    provider: str
    sync_run_id: str
    fetched_count: int
    upserted_count: int
    failed_count: int
    status: str


def utc_now() -> str:
    """Return an ISO timestamp suitable for Supabase REST writes."""

    return datetime.now(UTC).isoformat()


def exercise_to_row(exercise: ProviderExercise, source: str) -> dict[str, object]:
    """Convert a provider exercise into a Supabase exercises row."""

    return {
        "external_id": exercise.external_id,
        "source": source,
        "user_id": None,
        "name": exercise.name,
        "normalized_name": normalize_text(exercise.name),
        "primary_muscle": exercise.primary_muscle,
        "secondary_muscles": exercise.secondary_muscles,
        "body_part": exercise.body_part,
        "equipment": exercise.equipment,
        "movement_category": exercise.movement_category,
        "instructions": exercise.instructions,
        "image_url": exercise.image_url,
        "animation_url": exercise.animation_url,
        "thumbnail_url": exercise.thumbnail_url,
        "is_custom": False,
        "is_active": True,
    }


async def sync_catalog(settings: Settings) -> ExerciseSyncResult:
    """Synchronize the configured provider catalog into Supabase.

    Individual malformed provider records are logged and skipped so a single
    catalog issue does not fail the whole import.
    """

    provider = get_exercise_provider(settings)
    async with SupabaseService(settings) as supabase:
        sync_run = await supabase.insert(
            "exercise_sync_runs",
            {"provider": provider.source, "status": "running"},
        )
        sync_run_id = sync_run["id"]
        fetched_count = 0
        upserted_count = 0
        failed_count = 0

        try:
            exercises = await provider.list_exercises()
            fetched_count = len(exercises)
        except Exception as exc:
            failed_count = 1
            message = safe_error_message(exc)
            await _log_failure(supabase, sync_run_id, None, None, exc)
            await _finish_run(supabase, sync_run_id, "failed", fetched_count, upserted_count, failed_count, message)
            raise

        for exercise in exercises:
            try:
                rows = await supabase.upsert(
                    "exercises", exercise_to_row(exercise, provider.source), "source,external_id"
                )
                if not rows:
                    raise RuntimeError("Supabase returned no exercise row after upsert.")
                upserted_count += 1
                alias_rows = [
                    {
                        "exercise_id": rows[0]["id"],
                        "alias": alias,
                        "normalized_alias": normalize_text(alias),
                    }
                    for alias in aliases_for_name(exercise.name)
                ]
                if alias_rows:
                    await supabase.upsert("exercise_aliases", alias_rows, "exercise_id,normalized_alias")
            except Exception as exc:
                failed_count += 1
                await _log_failure(
                    supabase,
                    sync_run_id,
                    exercise.external_id,
                    exercise_to_row(exercise, provider.source),
                    exc,
                )

        for failure in getattr(provider, "failures", []):
            failed_count += 1
            await _log_failure(
                supabase,
                sync_run_id,
                failure.get("external_id"),
                failure.get("payload"),
                RuntimeError(failure.get("error", "Provider record failed normalization.")),
            )

        status = "completed_with_errors" if failed_count else "completed"
        await _finish_run(supabase, sync_run_id, status, fetched_count, upserted_count, failed_count)
        return ExerciseSyncResult(
            provider=provider.source,
            sync_run_id=sync_run_id,
            fetched_count=fetched_count,
            upserted_count=upserted_count,
            failed_count=failed_count,
            status=status,
        )


def safe_error_message(exc: Exception) -> str:
    """Return a bounded exception summary suitable for persistent sync logs."""

    message = str(exc).strip() or exc.__class__.__name__
    return message[:500]


async def _log_failure(
    supabase: SupabaseService,
    sync_run_id: str,
    external_id: str | None,
    payload: dict[str, object] | None,
    exc: Exception,
) -> None:
    """Persist one provider record failure without aborting the sync."""

    await supabase.insert(
        "exercise_sync_failures",
        {
            "sync_run_id": sync_run_id,
            "external_id": external_id,
            "payload": payload,
            "error_message": safe_error_message(exc),
        },
    )


async def _finish_run(
    supabase: SupabaseService,
    sync_run_id: str,
    status: str,
    fetched_count: int,
    upserted_count: int,
    failed_count: int,
    message: str | None = None,
) -> None:
    """Mark a sync run as finished with final counters."""

    await supabase.patch_by_id(
        "exercise_sync_runs",
        sync_run_id,
        {
            "status": status,
            "completed_at": utc_now(),
            "fetched_count": fetched_count,
            "upserted_count": upserted_count,
            "failed_count": failed_count,
            "message": message,
        },
    )

"""Training analytics services shared by REST endpoints and MCP tools."""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import Settings
from app.repositories.supabase_training import TrainingRepository

MIN_DAYS = 1
MAX_DAYS = 3650
MIN_WEEKS = 1
MAX_WEEKS = 104
MAX_ONE_REP_MAX_REPS = 15
MIN_STAGNATION_EXPOSURES = 3
DEFAULT_UNDERTRAINED_SET_THRESHOLD = 4


def validate_days(days: int) -> int:
    """Validate a day-range tool argument."""

    if days < MIN_DAYS or days > MAX_DAYS:
        raise ValueError(f"days must be between {MIN_DAYS} and {MAX_DAYS}.")
    return days


def validate_weeks(weeks: int) -> int:
    """Validate a week-range tool argument."""

    if weeks < MIN_WEEKS or weeks > MAX_WEEKS:
        raise ValueError(f"weeks must be between {MIN_WEEKS} and {MAX_WEEKS}.")
    return weeks


def estimated_one_rep_max(weight: float | int | None, reps: int | None) -> float | None:
    """Return Epley estimated 1RM for completed working sets up to 15 reps."""

    if weight is None or reps is None or reps <= 0 or reps > MAX_ONE_REP_MAX_REPS:
        return None
    return round(float(weight) * (1 + reps / 30), 2)


def working_volume(set_row: dict[str, Any], mode: str = "weight_reps") -> float:
    """Return set volume for completed non-warmup sets."""

    if not is_working_set(set_row) or mode != "weight_reps":
        return 0.0
    return float(set_row.get("weight") or 0) * int(set_row.get("reps") or 0)


def is_working_set(set_row: dict[str, Any]) -> bool:
    """Return whether a set should contribute to normal analytics."""

    if not set_row.get("is_completed"):
        return False
    if set_row.get("set_type") == "warmup":
        return False
    if set_row.get("set_type") in {"working", "failure", "drop"}:
        return True
    notes = str(set_row.get("notes") or "").casefold()
    return "warm" not in notes


def parse_timestamp(value: str | None) -> datetime | None:
    """Parse an ISO timestamp from Supabase into a timezone-aware datetime."""

    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class TrainingAnalyticsService:
    """Compute read-only workout, routine, and progress views from Supabase."""

    def __init__(self, settings: Settings) -> None:
        """Create a service using repository-backed Supabase reads."""

        self._settings = settings

    async def get_recent_workouts(self, user_id: str, days: int = 30) -> dict[str, Any]:
        """Return recent user workouts with exercises and sets attached."""

        days = validate_days(days)
        async with TrainingRepository(self._settings) as repository:
            workouts = await repository.get_recent_workouts(user_id, days)
            await self._attach_workout_children(repository, user_id, workouts)
        return {"date_range": self._date_range(days), "workouts": workouts}

    async def get_workout(self, user_id: str, workout_id: str) -> dict[str, Any]:
        """Return one user-owned workout with exercises and sets."""

        async with TrainingRepository(self._settings) as repository:
            workout = await repository.get_workout(user_id, workout_id)
            if not workout:
                return {"workout": None, "warnings": ["Workout was not found for the authenticated user."]}
            await self._attach_workout_children(repository, user_id, [workout])
        return {"workout": workout, "warnings": []}

    async def get_exercise_history(
        self,
        user_id: str,
        exercise_name: str,
        days: int = 90,
    ) -> dict[str, Any]:
        """Return dated working-set history for a visible exercise."""

        exercise, performances, warnings = await self._exercise_performances(user_id, exercise_name, days)
        return {
            "exercise": exercise,
            "date_range": self._date_range(validate_days(days)),
            "performances": performances,
            "warnings": warnings,
        }

    async def get_strength_progress(
        self,
        user_id: str,
        exercise_name: str,
        days: int = 90,
    ) -> dict[str, Any]:
        """Return estimated strength and volume trend for one exercise."""

        exercise, performances, warnings = await self._exercise_performances(user_id, exercise_name, days)
        one_rep_maxes = [p["best_set"]["estimated_1rm"] for p in performances if p["best_set"]]
        volumes = [p["working_volume"] for p in performances]
        max_change = _percent_change(one_rep_maxes[0], one_rep_maxes[-1]) if len(one_rep_maxes) > 1 else None
        volume_change = _percent_change(volumes[0], volumes[-1]) if len(volumes) > 1 else None
        classification = "insufficient_data"
        if max_change is not None:
            if max_change > 2:
                classification = "progressing"
            elif max_change < -2:
                classification = "regressing"
            else:
                classification = "stable"
        return {
            "exercise": exercise,
            "date_range": self._date_range(validate_days(days)),
            "performances": performances,
            "summary": {
                "estimated_1rm_change_percent": max_change,
                "volume_change_percent": volume_change,
                "classification": classification,
            },
            "evidence": performances[-MIN_STAGNATION_EXPOSURES:],
            "warnings": warnings,
        }

    async def get_weekly_training_summary(self, user_id: str, weeks: int = 4) -> dict[str, Any]:
        """Return workout frequency, set count, and volume grouped by week."""

        weeks = validate_weeks(weeks)
        days = weeks * 7
        rows = await self._training_rows(user_id, days)
        profile = (await self.get_user_profile(user_id)).get("profile") or {}
        try:
            timezone = ZoneInfo(profile.get("timezone") or "America/New_York")
        except ZoneInfoNotFoundError:
            timezone = ZoneInfo("America/New_York")
        summary: dict[str, dict[str, Any]] = {}
        for row in rows:
            week_start = _week_start(row["started_at"], timezone).isoformat()
            bucket = summary.setdefault(
                week_start,
                {"week_start": week_start, "workout_ids": set(), "working_sets": 0, "volume": 0.0},
            )
            bucket["workout_ids"].add(row["workout_id"])
            if is_working_set(row["set"]):
                bucket["working_sets"] += 1
                bucket["volume"] += working_volume(row["set"], row["logging_mode"])
        weekly = []
        for bucket in summary.values():
            weekly.append(
                {
                    "week_start": bucket["week_start"],
                    "workouts": len(bucket["workout_ids"]),
                    "working_sets": bucket["working_sets"],
                    "volume": round(bucket["volume"], 2),
                }
            )
        return {"weeks": sorted(weekly, key=lambda item: item["week_start"])}

    async def get_volume_by_muscle_group(self, user_id: str, days: int = 30) -> dict[str, Any]:
        """Return completed working volume grouped by primary muscle."""

        rows = await self._training_rows(user_id, validate_days(days))
        volume: Counter[str] = Counter()
        for row in rows:
            muscle = row["exercise"].get("primary_muscle") or "unknown"
            volume[muscle] += working_volume(row["set"], row["logging_mode"])
        return {
            "date_range": self._date_range(days),
            "muscle_groups": [{"muscle_group": key, "volume": round(value, 2)} for key, value in volume.items()],
        }

    async def get_personal_records(self, user_id: str, days: int = 365) -> dict[str, Any]:
        """Return best estimated 1RM records by exercise."""

        rows = await self._training_rows(user_id, validate_days(days))
        records: dict[str, dict[str, Any]] = {}
        for row in rows:
            set_row = row["set"]
            if not is_working_set(set_row):
                continue
            mode = row["logging_mode"]
            estimate = estimated_one_rep_max(set_row.get("weight"), set_row.get("reps")) if mode == "weight_reps" else None
            metric = _record_metric(set_row, mode)
            if metric is None:
                continue
            exercise = row["exercise"]
            current = records.get(exercise["id"])
            if current is None or metric > current["metric"]:
                records[exercise["id"]] = {
                    "exercise": _exercise_summary(exercise),
                    "logging_mode": mode,
                    "date": row["started_at"].date().isoformat(),
                    "workout_id": row["workout_id"],
                    "weight": set_row.get("weight"),
                    "reps": set_row.get("reps"),
                    "duration_seconds": set_row.get("duration_seconds"),
                    "assistance_weight": set_row.get("assistance_weight"),
                    "estimated_1rm": estimate,
                    "metric": metric,
                }
        return {"date_range": self._date_range(days), "records": list(records.values())}

    async def find_stagnating_exercises(self, user_id: str, days: int = 90) -> dict[str, Any]:
        """Find exercises with enough exposures but no recent estimated 1RM gain."""

        rows = await self._training_rows(user_id, validate_days(days))
        by_exercise: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            estimate = estimated_one_rep_max(row["set"].get("weight"), row["set"].get("reps"))
            if row["logging_mode"] == "weight_reps" and is_working_set(row["set"]) and estimate is not None:
                by_exercise[row["exercise"]["id"]].append({**row, "estimated_1rm": estimate})

        stagnating = []
        for rows_for_exercise in by_exercise.values():
            session_best: dict[str, dict[str, Any]] = {}
            for row in rows_for_exercise:
                current = session_best.get(row["workout_id"])
                if current is None or row["estimated_1rm"] > current["estimated_1rm"]:
                    session_best[row["workout_id"]] = row
            exposures = sorted(session_best.values(), key=lambda row: row["started_at"])
            if len(exposures) < MIN_STAGNATION_EXPOSURES:
                continue
            first = exposures[0]["estimated_1rm"]
            latest = exposures[-1]["estimated_1rm"]
            change = _percent_change(first, latest)
            if change is not None and change <= 2:
                exercise = rows_for_exercise[0]["exercise"]
                stagnating.append(
                    {
                        "exercise": _exercise_summary(exercise),
                        "exposures": len(exposures),
                        "estimated_1rm_change_percent": change,
                        "evidence": [
                            {"date": row["started_at"].date().isoformat(), "estimated_1rm": row["estimated_1rm"]}
                            for row in exposures[-MIN_STAGNATION_EXPOSURES:]
                        ],
                    }
                )
        return {"date_range": self._date_range(days), "stagnating_exercises": stagnating}

    async def find_undertrained_muscle_groups(self, user_id: str, days: int = 30) -> dict[str, Any]:
        """Find muscle groups with low recent working-set exposure."""

        rows = await self._training_rows(user_id, validate_days(days))
        async with TrainingRepository(self._settings) as repository:
            visible = await repository.get_visible_exercises(user_id)
        known_muscles = {str(exercise["primary_muscle"]) for exercise in visible if exercise.get("primary_muscle")}
        counts: Counter[str] = Counter()
        last_trained: dict[str, datetime] = {}
        unknown_sets = 0
        for row in rows:
            if not is_working_set(row["set"]):
                continue
            muscle = row["exercise"].get("primary_muscle")
            if not muscle:
                unknown_sets += 1
                continue
            counts[muscle] += 1
            last_trained[muscle] = max(last_trained.get(muscle, row["started_at"]), row["started_at"])
        findings = []
        today = datetime.now(UTC)
        for muscle in sorted(known_muscles):
            set_count = counts[muscle]
            if set_count < DEFAULT_UNDERTRAINED_SET_THRESHOLD:
                findings.append(
                    {
                        "muscle_group": muscle,
                        "working_sets": set_count,
                        "days_since_last_trained": (today.date() - last_trained[muscle].date()).days if muscle in last_trained else None,
                    }
                )
        return {"date_range": self._date_range(days), "undertrained_muscle_groups": findings, "unknown_primary_muscle_sets": unknown_sets}

    async def get_current_routines(self, user_id: str) -> dict[str, Any]:
        """Return current routines with routine exercises attached."""

        async with TrainingRepository(self._settings) as repository:
            routines = await repository.get_current_routines(user_id)
            routine_ids = [row["id"] for row in routines]
            routine_exercises = await repository.get_routine_exercises_by_routines(routine_ids)
            exercise_ids = list({row["exercise_id"] for row in routine_exercises})
            visible_exercises = await repository.get_visible_exercises(
                user_id,
                exercise_ids=exercise_ids,
            )
            exercises = {row["id"]: row for row in visible_exercises}
        by_routine: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in routine_exercises:
            by_routine[row["routine_id"]].append(
                {**row, "exercise": _exercise_summary(exercises.get(row["exercise_id"], {}))}
            )
        for routine in routines:
            routine["exercises"] = by_routine.get(routine["id"], [])
        return {"routines": routines}

    async def get_user_profile(self, user_id: str) -> dict[str, Any]:
        """Return optional profile details for personalized training recommendations."""

        async with TrainingRepository(self._settings) as repository:
            profile = await repository.get_profile(user_id)
        return {"profile": _profile_summary(profile)}

    async def get_user_training_context(self, user_id: str) -> dict[str, Any]:
        """Return a compact profile, recent summary, records, and routine context."""

        profile = await self.get_user_profile(user_id)
        recent = await self.get_weekly_training_summary(user_id, weeks=4)
        records = await self.get_personal_records(user_id, days=365)
        routines = await self.get_current_routines(user_id)
        return {
            "profile": profile["profile"],
            "weekly_summary": recent,
            "personal_records": records,
            "routines": routines,
        }

    async def _exercise_performances(
        self,
        user_id: str,
        exercise_name: str,
        days: int,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], list[str]]:
        days = validate_days(days)
        async with TrainingRepository(self._settings) as repository:
            exercise = await repository.find_exercise_by_name(user_id, exercise_name)
            if not exercise:
                return None, [], ["Exercise was not found for the authenticated user."]
            workouts = await repository.get_recent_workouts(user_id, days)
            workout_ids = [row["id"] for row in workouts]
            workout_by_id = {row["id"]: row for row in workouts}
            workout_exercises = await repository.get_workout_exercises_by_workouts(workout_ids)
            matching = [row for row in workout_exercises if row["exercise_id"] == exercise["id"]]
            sets = await repository.get_sets_by_workout_exercises([row["id"] for row in matching])

        exercise_row_by_id = {row["id"]: row for row in matching}
        by_workout: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for set_row in sets:
            workout_exercise = exercise_row_by_id.get(set_row["workout_exercise_id"])
            if not workout_exercise:
                continue
            workout = workout_by_id.get(workout_exercise["workout_id"])
            started_at = parse_timestamp(workout.get("started_at") if workout else None)
            if not started_at:
                continue
            by_workout[workout_exercise["workout_id"]].append(set_row)

        performances = []
        for workout_id, set_rows in by_workout.items():
            workout = workout_by_id[workout_id]
            if not workout.get("completed_at"):
                continue
            performed_at = parse_timestamp(workout.get("started_at"))
            occurrence = next((row for row in matching if row["workout_id"] == workout_id), {})
            mode = occurrence.get("logging_mode") or exercise.get("logging_mode") or "weight_reps"
            best = _best_set(set_rows, mode)
            performances.append(
                {
                    "workout_id": workout_id,
                    "date": performed_at.date().isoformat() if performed_at else None,
                    "best_set": best,
                    "logging_mode": mode,
                    "working_volume": round(sum(working_volume(set_row, mode) for set_row in set_rows), 2),
                }
            )
        return _exercise_summary(exercise), sorted(performances, key=lambda row: row["date"] or ""), []

    async def _training_rows(self, user_id: str, days: int) -> list[dict[str, Any]]:
        async with TrainingRepository(self._settings) as repository:
            workouts = await repository.get_recent_workouts(user_id, days)
            workout_by_id = {row["id"]: row for row in workouts}
            workout_exercises = await repository.get_workout_exercises_by_workouts(list(workout_by_id))
            exercise_ids = list({row["exercise_id"] for row in workout_exercises})
            visible_exercises = await repository.get_visible_exercises(
                user_id,
                exercise_ids=exercise_ids,
            )
            exercises = {row["id"]: row for row in visible_exercises}
            workout_exercise_by_id = {row["id"]: row for row in workout_exercises}
            sets = await repository.get_sets_by_workout_exercises(list(workout_exercise_by_id))

        rows = []
        for set_row in sets:
            workout_exercise = workout_exercise_by_id.get(set_row["workout_exercise_id"])
            if not workout_exercise:
                continue
            workout = workout_by_id.get(workout_exercise["workout_id"])
            exercise = exercises.get(workout_exercise["exercise_id"])
            started_at = parse_timestamp(workout.get("started_at") if workout else None)
            if workout and workout.get("completed_at") and exercise and started_at:
                rows.append(
                    {
                        "workout_id": workout["id"],
                        "started_at": started_at,
                        "exercise": exercise,
                        "logging_mode": workout_exercise.get("logging_mode") or exercise.get("logging_mode") or "weight_reps",
                        "set": set_row,
                    }
                )
        return sorted(rows, key=lambda row: row["started_at"])

    async def _attach_workout_children(
        self,
        repository: TrainingRepository,
        user_id: str,
        workouts: list[dict[str, Any]],
    ) -> None:
        workout_ids = [row["id"] for row in workouts]
        workout_exercises = await repository.get_workout_exercises_by_workouts(workout_ids)
        exercise_ids = list({row["exercise_id"] for row in workout_exercises})
        visible_exercises = await repository.get_visible_exercises(user_id, exercise_ids=exercise_ids)
        exercises = {row["id"]: row for row in visible_exercises}
        sets = await repository.get_sets_by_workout_exercises([row["id"] for row in workout_exercises])
        sets_by_workout_exercise: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for set_row in sets:
            sets_by_workout_exercise[set_row["workout_exercise_id"]].append(set_row)
        by_workout: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in workout_exercises:
            by_workout[row["workout_id"]].append(
                {
                    **row,
                    "exercise": _exercise_summary(exercises.get(row["exercise_id"], {})),
                    "sets": sets_by_workout_exercise.get(row["id"], []),
                }
            )
        for workout in workouts:
            workout["exercises"] = by_workout.get(workout["id"], [])

    @staticmethod
    def _date_range(days: int) -> dict[str, str]:
        end = date.today()
        start = end - timedelta(days=days)
        return {"start": start.isoformat(), "end": end.isoformat()}


def _exercise_summary(exercise: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": exercise.get("id"),
        "name": exercise.get("name"),
        "equipment": exercise.get("equipment"),
        "primary_muscle": exercise.get("primary_muscle"),
        "secondary_muscles": exercise.get("secondary_muscles") or [],
        "logging_mode": exercise.get("logging_mode") or "weight_reps",
    }


def _profile_summary(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not profile:
        return None
    return {
        "first_name": profile.get("first_name"),
        "last_name": profile.get("last_name"),
        "display_name": profile.get("display_name"),
        "age": profile.get("age"),
        "body_weight_lbs": profile.get("body_weight_lbs"),
        "height_inches": profile.get("height_inches"),
        "training_goal": profile.get("training_goal"),
        "training_experience": profile.get("training_experience"),
        "limitations": profile.get("limitations"),
        "timezone": profile.get("timezone") or "America/New_York",
    }


def _best_set(sets: list[dict[str, Any]], mode: str = "weight_reps") -> dict[str, Any] | None:
    candidates = []
    for set_row in sets:
        if not is_working_set(set_row):
            continue
        if mode == "duration":
            score = float(set_row.get("duration_seconds") or 0)
        elif mode == "assisted_bodyweight":
            score = float(set_row.get("reps") or 0) * 10000 - float(set_row.get("assistance_weight") or 0)
        elif mode in {"bodyweight_reps", "weighted_bodyweight"}:
            score = float(set_row.get("reps") or 0) * 10000 + float(set_row.get("weight") or 0)
        else:
            score = estimated_one_rep_max(set_row.get("weight"), set_row.get("reps")) or 0
        if score > 0:
            candidates.append((score, set_row))
    if not candidates:
        return None
    _score, set_row = max(candidates, key=lambda item: item[0])
    return {
        "weight": set_row.get("weight"),
        "reps": set_row.get("reps"),
        "duration_seconds": set_row.get("duration_seconds"),
        "assistance_weight": set_row.get("assistance_weight"),
        "rpe": set_row.get("rpe"),
        "estimated_1rm": estimated_one_rep_max(set_row.get("weight"), set_row.get("reps")) if mode == "weight_reps" else None,
    }


def _record_metric(set_row: dict[str, Any], mode: str) -> float | None:
    """Return a comparable mode-specific score for one completed working set."""

    if mode == "duration":
        value = float(set_row.get("duration_seconds") or 0)
    elif mode == "bodyweight_reps":
        value = float(set_row.get("reps") or 0)
    elif mode == "assisted_bodyweight":
        reps = float(set_row.get("reps") or 0)
        assistance = set_row.get("assistance_weight")
        value = reps * 1_000_000 - float(assistance) if reps and assistance is not None else 0
    elif mode == "weighted_bodyweight":
        value = float(set_row.get("weight") or 0) * 1_000 + float(set_row.get("reps") or 0)
    else:
        estimate = estimated_one_rep_max(set_row.get("weight"), set_row.get("reps"))
        return estimate
    return value if value > 0 else None


def _percent_change(start: float | int | None, end: float | int | None) -> float | None:
    if start in (None, 0) or end is None:
        return None
    return round(((float(end) - float(start)) / float(start)) * 100, 2)


def _week_start(value: datetime, timezone: ZoneInfo = ZoneInfo("UTC")) -> date:
    local = value.astimezone(timezone)
    return local.date() - timedelta(days=(local.weekday() + 1) % 7)

"""Validate a Hevy CSV and emit one idempotent SQL transaction for review.

The command is dry-run only unless ``--emit-sql`` is provided. It never opens
a database connection, so account resolution and execution remain separate,
explicit steps.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("America/New_York")
MAPPED_EXERCISES = {
    "Bench Press (Barbell)": ("seed", "seed-barbell-bench-press"),
    "Preacher Curl (Dumbbell)": ("exercisedb", "0372"),
    "Pull Up": ("exercisedb", "0652"),
    "Triceps Rope Pushdown": ("exercisedb", "0200"),
    "Incline Bench Press (Dumbbell)": ("exercisedb", "0314"),
    "Pull Up (Weighted)": ("exercisedb", "0841"),
    "Lat Pulldown (Cable)": ("seed", "seed-lat-pulldown"),
    "Leg Raise Parallel Bars": ("exercisedb", "0826"),
    "Triceps Dip (Weighted)": ("exercisedb", "1755"),
    "Triceps Dip": ("exercisedb", "0814"),
    "Lunge (Dumbbell)": ("exercisedb", "0336"),
    "Bench Press (Dumbbell)": ("seed", "seed-dumbbell-bench-press"),
    "Squat (Smith Machine)": ("exercisedb", "0770"),
    "Lateral Raise (Dumbbell)": ("exercisedb", "0334"),
    "Hammer Curl (Dumbbell)": ("exercisedb", "0313"),
    "Bicep Curl (Dumbbell)": ("exercisedb", "0294"),
    "Bench Press (Smith Machine)": ("seed", "seed-smith-machine-bench-press"),
    "Plank": ("strengthos", "plank"),
    "Face Pull": ("strengthos", "face-pull"),
    "Dead Hang": ("strengthos", "dead-hang"),
}
PRIMARY_MUSCLES = {
    "Squat (Barbell)": "Quads", "Leg Extension (Machine)": "Quads", "Sit Up (Weighted)": "Abs",
    "Seated Shoulder Press (Machine)": "Shoulders", "Hip Abduction (Machine)": "Abductors",
    "Hip Adduction (Machine)": "Adductors", "Lying Leg Curl (Machine)": "Hamstrings",
    "Cable Crunch": "Abs", "Shoulder Press (Machine Plates)": "Shoulders",
    "Seated Cable Row - V Grip (Cable)": "Upper Back", "T Bar Row": "Upper Back",
    "Butterfly (Pec Deck)": "Chest", "Rear Delt Reverse Fly (Machine)": "Shoulders",
    "Seated Row (Machine)": "Upper Back", "Seated Leg Curl (Machine)": "Hamstrings",
    "Calf Extension (Machine)": "Calves", "Iso-Lateral Row (Machine)": "Upper Back",
    "Iso-Lateral Chest Press (Machine)": "Chest", "Toes to Bar": "Abs",
    "Bulgarian Split Squat (Dumbbell)": "Quads", "Seated Dip Machine": "Triceps",
    "Bicycle Crunch Raised Legs": "Abs", "Behind the Back Curl (Cable)": "Biceps",
    "Preacher Curl (Machine)": "Biceps", "Leg Press Horizontal (Machine)": "Quads",
}
KNOWN_SET_TYPES = {"normal", "warmup", "failure", "dropset"}


@dataclass(frozen=True)
class ExerciseBlock:
    """One contiguous exercise occurrence inside a workout."""

    title: str
    notes: str
    superset_id: str
    rows: tuple[dict[str, str], ...]


@dataclass(frozen=True)
class HevyWorkout:
    """Validated source workout with ordered exercise blocks."""

    title: str
    started_at: datetime
    ended_at: datetime
    description: str
    blocks: tuple[ExerciseBlock, ...]
    payload_hash: str


def parse_hevy_csv(path: Path) -> list[HevyWorkout]:
    """Parse export rows while preserving source order and repeated blocks."""

    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    required = {
        "title", "start_time", "end_time", "description", "exercise_title",
        "superset_id", "exercise_notes", "set_index", "set_type", "weight_lbs",
        "reps", "duration_seconds", "rpe",
    }
    if not rows or not required.issubset(rows[0]):
        raise ValueError("CSV does not match the supported Hevy export columns.")

    grouped: OrderedDict[tuple[str, str, str], list[dict[str, str]]] = OrderedDict()
    for row in rows:
        validate_row(row)
        key = (row["title"], row["start_time"], row["end_time"])
        grouped.setdefault(key, []).append(row)

    workouts: list[HevyWorkout] = []
    for (title, start, end), workout_rows in grouped.items():
        blocks: list[ExerciseBlock] = []
        current: list[dict[str, str]] = []
        for row in workout_rows:
            reset = current and (
                row["exercise_title"] != current[-1]["exercise_title"]
                or number(row["set_index"]) <= number(current[-1]["set_index"])
            )
            if reset:
                blocks.append(block_from_rows(current))
                current = []
            current.append(row)
        if current:
            blocks.append(block_from_rows(current))
        canonical = json.dumps(workout_rows, sort_keys=True, separators=(",", ":"))
        started_at = parse_local_time(start)
        ended_at = parse_local_time(end)
        if ended_at < started_at:
            raise ValueError(f"Workout ends before it starts: {title} at {start}.")
        workouts.append(
            HevyWorkout(
                title=title,
                started_at=started_at,
                ended_at=ended_at,
                description=workout_rows[0]["description"],
                blocks=tuple(blocks),
                payload_hash=hashlib.sha256(canonical.encode()).hexdigest(),
            )
        )

    return workouts


def block_from_rows(rows: list[dict[str, str]]) -> ExerciseBlock:
    first = rows[0]
    return ExerciseBlock(first["exercise_title"], first["exercise_notes"], first["superset_id"], tuple(rows))


def parse_local_time(value: str) -> datetime:
    return datetime.strptime(value, "%b %d, %Y, %I:%M %p").replace(tzinfo=TIMEZONE)


def number(value: str) -> float | None:
    if value == "":
        return None
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"Non-finite number: {value}.")
    return int(parsed) if parsed.is_integer() else parsed


def validate_row(row: dict[str, str]) -> None:
    """Reject malformed values instead of silently changing imported history."""

    if row["set_type"].casefold() not in KNOWN_SET_TYPES:
        raise ValueError(f"Unsupported Hevy set type: {row['set_type']}.")
    for field in ("set_index", "reps", "duration_seconds"):
        value = number(row[field])
        if value is not None and (not isinstance(value, int) or value < 0):
            raise ValueError(f"{field} must be a nonnegative integer.")
    for field in ("weight_lbs", "rpe"):
        value = number(row[field])
        if value is not None and value < 0:
            raise ValueError(f"{field} must be nonnegative.")
    rpe = number(row["rpe"])
    if rpe is not None and not 1 <= rpe <= 10:
        raise ValueError("rpe must be between 1 and 10.")


def infer_logging_mode(block: ExerciseBlock) -> str:
    if all(row["duration_seconds"] and not row["reps"] for row in block.rows):
        return "duration"
    if "(Weighted)" in block.title:
        return "weighted_bodyweight"
    if all(not row["weight_lbs"] for row in block.rows):
        return "bodyweight_reps"
    return "weight_reps"


def emit_sql(workouts: list[HevyWorkout], user_id: uuid.UUID) -> str:
    """Build an all-or-nothing, conflict-detecting import transaction."""

    private_titles = sorted({block.title for workout in workouts for block in workout.blocks} - MAPPED_EXERCISES.keys())
    lines = [
        "begin;",
        "set local standard_conforming_strings = on;",
        "set local statement_timeout = '60s';",
        f"select pg_advisory_xact_lock(hashtextextended({sql(str(user_id))}, 0));",
    ]
    for title in private_titles:
        exercise_id = stable_id(user_id, f"exercise:{title}")
        mode = next(infer_logging_mode(block) for workout in workouts for block in workout.blocks if block.title == title)
        external_id = f"hevy-{hashlib.sha256(f'{user_id}:{title}'.encode()).hexdigest()[:24]}"
        lines.append(
            "insert into public.exercises "
            "(id, external_id, source, user_id, name, normalized_name, primary_muscle, is_custom, is_active, logging_mode) values "
            f"({sql(exercise_id)}, {sql(external_id)}, 'custom', {sql(user_id)}, {sql(title)}, {sql(title.casefold())}, {sql_or_null(PRIMARY_MUSCLES.get(title))}, true, true, {sql(mode)}) "
            "on conflict (source, external_id) do nothing;"
        )

    for workout in workouts:
        delimiter = safe_dollar_delimiter(workout)
        external_id = hashlib.sha256(f"{workout.started_at.isoformat()}:{workout.title}".encode()).hexdigest()[:32]
        workout_id = stable_id(user_id, f"workout:{external_id}")
        lines.append(
            "do $$ begin if exists (select 1 from public.workouts where "
            f"user_id = {sql(user_id)} and source = 'hevy' and external_id = {sql(external_id)} "
            f"and import_hash is distinct from {sql(workout.payload_hash)}) then "
            "raise exception 'Hevy import conflict; source row changed'; end if; end $$;"
        )
        lines.append(
            f"do {delimiter} begin if not exists (select 1 from public.workouts where "
            f"user_id = {sql(user_id)} and source = 'hevy' and external_id = {sql(external_id)}) then"
        )
        duration = max(0, int((workout.ended_at - workout.started_at).total_seconds()))
        lines.append(
            "insert into public.workouts "
            "(id, user_id, name, started_at, completed_at, duration_seconds, notes, source, external_id, import_hash) values "
            f"({sql(workout_id)}, {sql(user_id)}, {sql(workout.title)}, {sql(workout.started_at.isoformat())}, "
            f"{sql(workout.ended_at.isoformat())}, {duration}, {sql_or_null(workout.description)}, 'hevy', {sql(external_id)}, {sql(workout.payload_hash)}) "
            "on conflict (user_id, source, external_id) where external_id is not null do nothing;"
        )
        for exercise_order, block in enumerate(workout.blocks):
            workout_exercise_id = stable_id(user_id, f"workout-exercise:{external_id}:{exercise_order}")
            exercise_id = exercise_sql(user_id, block.title)
            superset = stable_id(user_id, f"superset:{external_id}:{block.superset_id}") if block.superset_id else None
            mode = infer_logging_mode(block)
            lines.append(
                "insert into public.workout_exercises "
                "(id, workout_id, exercise_id, exercise_order, logging_mode, session_notes, superset_group, source_name) values "
                f"({sql(workout_exercise_id)}, {sql(workout_id)}, {exercise_id}, {exercise_order}, {sql(mode)}, "
                f"{sql_or_null(block.notes)}, {sql_or_null(superset)}, {sql(block.title)}) on conflict (id) do nothing;"
            )
            for row_order, row in enumerate(block.rows):
                set_id = stable_id(user_id, f"set:{external_id}:{exercise_order}:{row_order}")
                lines.append(
                    "insert into public.workout_sets "
                    "(id, workout_exercise_id, set_order, set_type, weight, reps, duration_seconds, rpe, is_completed, completed_at) values "
                    f"({sql(set_id)}, {sql(workout_exercise_id)}, {int(number(row['set_index']) or 0)}, {sql(set_type(row['set_type']))}, "
                    f"{sql_or_null(number(row['weight_lbs']))}, {sql_or_null(number(row['reps']))}, "
                    f"{sql_or_null(number(row['duration_seconds']))}, {sql_or_null(number(row['rpe']))}, true, null) "
                    "on conflict (id) do nothing;"
                )
        lines.append(f"end if; end {delimiter};")
    lines.extend(["commit;", ""])
    return "\n".join(lines)


def exercise_sql(user_id: uuid.UUID, title: str) -> str:
    if title in MAPPED_EXERCISES:
        source, external_id = MAPPED_EXERCISES[title]
        return f"(select id from public.exercises where source = {sql(source)} and external_id = {sql(external_id)})"
    return sql(stable_id(user_id, f"exercise:{title}"))


def stable_id(user_id: uuid.UUID, label: str) -> uuid.UUID:
    return uuid.uuid5(user_id, f"strengthos:hevy:{label}")


def safe_dollar_delimiter(workout: HevyWorkout) -> str:
    """Choose a PL/pgSQL delimiter absent from all source-controlled text."""

    source = json.dumps([
        workout.title,
        workout.description,
        [row for block in workout.blocks for row in block.rows],
    ], sort_keys=True)
    suffix = 0
    while True:
        delimiter = f"$hevy_{workout.payload_hash[:16]}_{suffix}$"
        if delimiter not in source:
            return delimiter
        suffix += 1


def set_type(value: str) -> str:
    return {"warmup": "warmup", "failure": "failure", "dropset": "drop"}.get(value.casefold(), "working")


def sql(value: object) -> str:
    text = str(value)
    if "\x00" in text:
        raise ValueError("PostgreSQL text values cannot contain NUL bytes.")
    return "'" + text.replace("'", "''") + "'"


def sql_or_null(value: object | None) -> str:
    return "null" if value is None or value == "" else sql(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--user-id", type=uuid.UUID, required=True)
    parser.add_argument("--emit-sql", type=Path)
    args = parser.parse_args()
    workouts = parse_hevy_csv(args.csv)
    summary = {
        "workouts": len(workouts),
        "exercise_blocks": sum(len(item.blocks) for item in workouts),
        "sets": sum(len(block.rows) for item in workouts for block in item.blocks),
        "mapped_titles": len(MAPPED_EXERCISES),
        "private_titles": len({block.title for item in workouts for block in item.blocks} - MAPPED_EXERCISES.keys()),
    }
    if args.emit_sql:
        args.emit_sql.write_text(emit_sql(workouts, args.user_id), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

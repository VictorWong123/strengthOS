import csv
from pathlib import Path
from uuid import UUID

import pytest

from app.scripts.import_hevy import emit_sql, parse_hevy_csv


FIELDS = [
    "title", "start_time", "end_time", "description", "exercise_title",
    "superset_id", "exercise_notes", "set_index", "set_type", "weight_lbs",
    "reps", "duration_seconds", "rpe",
]


def write_csv(path: Path, rows: list[dict[str, str]]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def row(**overrides: str) -> dict[str, str]:
    values = {
        "title": "Synthetic workout",
        "start_time": "Jan 01, 2026, 06:00 PM",
        "end_time": "Jan 01, 2026, 07:00 PM",
        "description": "Synthetic import",
        "exercise_title": "Synthetic Lift (Weighted)",
        "superset_id": "",
        "exercise_notes": "Controlled reps",
        "set_index": "0",
        "set_type": "normal",
        "weight_lbs": "25",
        "reps": "8",
        "duration_seconds": "",
        "rpe": "8",
    }
    values.update(overrides)
    return values


def test_hevy_import_preserves_generic_shape_and_unknown_load(tmp_path: Path) -> None:
    csv_path = write_csv(tmp_path / "synthetic-hevy.csv", [
        row(),
        row(set_index="1", weight_lbs="", reps="10", set_type="failure"),
        row(exercise_title="Synthetic Row", exercise_notes="Private exercise", weight_lbs="50", reps="12"),
        row(exercise_title="Synthetic Lift (Weighted)", set_type="dropset", weight_lbs="15", reps="12"),
        row(
            title="Timed session",
            start_time="Jan 02, 2026, 08:00 AM",
            end_time="Jan 02, 2026, 08:30 AM",
            description="Duration work",
            exercise_title="Static Hold",
            exercise_notes="",
            weight_lbs="",
            reps="",
            duration_seconds="45",
            rpe="",
        ),
    ])
    workouts = parse_hevy_csv(csv_path)

    assert len(workouts) == 2
    assert [block.title for block in workouts[0].blocks] == [
        "Synthetic Lift (Weighted)", "Synthetic Row", "Synthetic Lift (Weighted)",
    ]
    assert workouts[0].blocks[0].rows[1]["weight_lbs"] == ""

    sql = emit_sql(workouts, UUID("11111111-1111-1111-1111-111111111111"))
    assert "'Synthetic Row'" in sql
    assert "'weighted_bodyweight'" in sql
    assert "'duration'" in sql
    assert "'hevy'" in sql
    assert "begin;" in sql and sql.endswith("commit;\n")


def test_hevy_import_rejects_invalid_rows(tmp_path: Path) -> None:
    csv_path = write_csv(tmp_path / "invalid-hevy.csv", [row(set_type="unsupported")])

    with pytest.raises(ValueError, match="Unsupported Hevy set type"):
        parse_hevy_csv(csv_path)

"""Export Supabase data into Turso/libSQL for later FastMCP access."""

from __future__ import annotations

from typing import Any

import libsql

from app.config import Settings
from app.services.supabase import SupabaseService

POSTGREST_IN_FILTER_CHUNK_SIZE = 100

MCP_TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "mcp_exercises": (
        "id",
        "source",
        "external_id",
        "name",
        "normalized_name",
        "primary_muscle",
        "body_part",
        "equipment",
        "is_custom",
        "user_id",
        "is_active",
    ),
    "mcp_exercise_aliases": ("id", "exercise_id", "alias", "normalized_alias"),
    "mcp_workouts": ("id", "user_id", "name", "started_at", "completed_at", "notes"),
    "mcp_workout_exercises": ("id", "workout_id", "exercise_id", "exercise_order"),
    "mcp_workout_sets": (
        "id",
        "workout_exercise_id",
        "set_order",
        "reps",
        "weight",
        "is_completed",
        "completed_at",
    ),
    "mcp_routines": ("id", "user_id", "name", "notes"),
    "mcp_routine_exercises": ("id", "routine_id", "exercise_id", "exercise_order"),
}


async def export_to_turso(settings: Settings) -> dict[str, int]:
    """Copy selected Supabase data into Turso read tables."""

    if not settings.has_turso_credentials:
        raise ValueError("Turso credentials are required.")

    user_filter = settings.turso_export_user_id
    async with SupabaseService(settings) as supabase:
        global_exercises = await supabase.select_all(
            "exercises",
            "id,source,external_id,name,normalized_name,primary_muscle,body_part,equipment,is_custom,user_id,is_active",
            is_active="eq.true",
            is_custom="eq.false",
        )
        exercises = global_exercises
        if user_filter:
            custom_exercises = await supabase.select_all(
                "exercises",
                "id,source,external_id,name,normalized_name,primary_muscle,body_part,equipment,is_custom,user_id,is_active",
                is_active="eq.true",
                user_id=f"eq.{user_filter}",
            )
            exercises = [*global_exercises, *custom_exercises]

        aliases = await _select_by_ids(
            supabase,
            "exercise_aliases",
            "id,exercise_id,alias,normalized_alias",
            "exercise_id",
            [row["id"] for row in exercises],
        )
        workouts = []
        workout_exercises = []
        workout_sets = []
        routines = []
        routine_exercises = []
        if user_filter:
            workouts = await supabase.select_all(
                "workouts",
                "id,user_id,name,started_at,completed_at,notes",
                user_id=f"eq.{user_filter}",
            )
            workout_exercises = await _select_by_ids(
                supabase,
                "workout_exercises",
                "id,workout_id,exercise_id,exercise_order",
                "workout_id",
                [row["id"] for row in workouts],
            )
            workout_sets = await _select_by_ids(
                supabase,
                "workout_sets",
                "id,workout_exercise_id,set_order,reps,weight,is_completed,completed_at",
                "workout_exercise_id",
                [row["id"] for row in workout_exercises],
            )
            routines = await supabase.select_all(
                "routines",
                "id,user_id,name,notes",
                user_id=f"eq.{user_filter}",
            )
            routine_exercises = await _select_by_ids(
                supabase,
                "routine_exercises",
                "id,routine_id,exercise_id,exercise_order",
                "routine_id",
                [row["id"] for row in routines],
            )

    conn = libsql.connect(
        database=settings.turso_database_url,
        auth_token=settings.turso_auth_token.get_secret_value() or None,
    )
    try:
        _create_tables(conn)
        _clear_scope(conn, settings.turso_export_user_id)
        _upsert_rows(conn, "mcp_exercises", exercises)
        _upsert_rows(conn, "mcp_exercise_aliases", aliases)
        _upsert_rows(conn, "mcp_workouts", workouts)
        _upsert_rows(conn, "mcp_workout_exercises", workout_exercises)
        _upsert_rows(conn, "mcp_workout_sets", workout_sets)
        _upsert_rows(conn, "mcp_routines", routines)
        _upsert_rows(conn, "mcp_routine_exercises", routine_exercises)
        conn.commit()
    finally:
        conn.close()

    return {
        "exercises": len(exercises),
        "aliases": len(aliases),
        "workouts": len(workouts),
        "workout_exercises": len(workout_exercises),
        "workout_sets": len(workout_sets),
        "routines": len(routines),
        "routine_exercises": len(routine_exercises),
    }


async def _select_by_ids(
    supabase: SupabaseService,
    table: str,
    select: str,
    column: str,
    ids: list[str],
) -> list[dict[str, Any]]:
    """Select child rows by parent identifiers without loading the whole table."""

    rows: list[dict[str, Any]] = []
    for index in range(0, len(ids), POSTGREST_IN_FILTER_CHUNK_SIZE):
        chunk = ids[index : index + POSTGREST_IN_FILTER_CHUNK_SIZE]
        if chunk:
            rows.extend(await supabase.select_all(table, select, in_filters={column: chunk}))
    return rows


def _create_tables(conn: Any) -> None:
    """Create MCP read tables if they do not exist."""

    statements = [
        """
        create table if not exists mcp_exercises (
          id text primary key,
          source text,
          external_id text,
          name text,
          normalized_name text,
          primary_muscle text,
          body_part text,
          equipment text,
          is_custom integer,
          user_id text,
          is_active integer
        )
        """,
        """
        create table if not exists mcp_exercise_aliases (
          id text primary key,
          exercise_id text,
          alias text,
          normalized_alias text
        )
        """,
        """
        create table if not exists mcp_workouts (
          id text primary key,
          user_id text,
          name text,
          started_at text,
          completed_at text,
          notes text
        )
        """,
        """
        create table if not exists mcp_workout_exercises (
          id text primary key,
          workout_id text,
          exercise_id text,
          exercise_order integer
        )
        """,
        """
        create table if not exists mcp_workout_sets (
          id text primary key,
          workout_exercise_id text,
          set_order integer,
          reps integer,
          weight real,
          is_completed integer,
          completed_at text
        )
        """,
        """
        create table if not exists mcp_routines (
          id text primary key,
          user_id text,
          name text,
          notes text
        )
        """,
        """
        create table if not exists mcp_routine_exercises (
          id text primary key,
          routine_id text,
          exercise_id text,
          exercise_order integer
        )
        """,
    ]
    for statement in statements:
        conn.execute(statement)


def _clear_scope(conn: Any, user_id: str) -> None:
    """Remove stale Turso rows before writing the current export scope."""

    if user_id:
        conn.execute(
            "delete from mcp_workout_sets where workout_exercise_id in "
            "(select we.id from mcp_workout_exercises we join mcp_workouts w on w.id = we.workout_id where w.user_id = ?)",
            [user_id],
        )
        conn.execute(
            "delete from mcp_workout_exercises where workout_id in "
            "(select id from mcp_workouts where user_id = ?)",
            [user_id],
        )
        conn.execute("delete from mcp_workouts where user_id = ?", [user_id])
        conn.execute(
            "delete from mcp_routine_exercises where routine_id in "
            "(select id from mcp_routines where user_id = ?)",
            [user_id],
        )
        conn.execute("delete from mcp_routines where user_id = ?", [user_id])
        conn.execute("delete from mcp_exercises where is_custom = 1 and user_id = ?", [user_id])
        conn.execute(
            "delete from mcp_exercise_aliases where exercise_id not in (select id from mcp_exercises)"
        )
        return

    for table in (
        "mcp_workout_sets",
        "mcp_workout_exercises",
        "mcp_workouts",
        "mcp_routine_exercises",
        "mcp_routines",
    ):
        conn.execute(f"delete from {table}")
    conn.execute("delete from mcp_exercises where is_custom = 1")
    conn.execute("delete from mcp_exercise_aliases where exercise_id not in (select id from mcp_exercises)")


def _upsert_rows(
    conn: Any,
    table: str,
    rows: list[dict[str, Any]],
) -> None:
    """Idempotently upsert REST rows into an allowlisted Turso table."""

    allowed_columns = MCP_TABLE_COLUMNS.get(table)
    if not allowed_columns:
        raise ValueError(f"Unsupported Turso export table: {table}")
    allowed_column_set = set(allowed_columns)
    for row in rows:
        unexpected_columns = set(row) - allowed_column_set
        if unexpected_columns:
            columns = ", ".join(sorted(unexpected_columns))
            raise ValueError(f"Unsupported columns for {table}: {columns}")
        columns = list(row.keys())
        if not columns:
            continue
        placeholders = ", ".join(["?"] * len(columns))
        assignments = ", ".join(f"{column}=excluded.{column}" for column in columns if column != "id")
        if not assignments:
            assignments = "id=excluded.id"
        sql = (
            f"insert into {table} ({', '.join(columns)}) values ({placeholders}) "
            f"on conflict(id) do update set {assignments}"
        )
        values = [int(value) if isinstance(value, bool) else value for value in row.values()]
        conn.execute(sql, values)

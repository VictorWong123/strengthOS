"""Export Supabase data into Turso/libSQL for later FastMCP access."""

from __future__ import annotations

from typing import Any

import libsql

from app.config import Settings
from app.services.supabase import SupabaseService


async def export_to_turso(settings: Settings) -> dict[str, int]:
    """Copy selected Supabase data into Turso read tables."""

    if not settings.has_turso_credentials:
        raise ValueError("Turso credentials are required.")

    supabase = SupabaseService(settings)
    global_exercises = await supabase.select(
        "exercises",
        "id,source,external_id,name,normalized_name,primary_muscle,body_part,equipment,is_custom,user_id,is_active",
        is_active="eq.true",
        is_custom="eq.false",
    )
    exercises = global_exercises
    user_filter = settings.turso_export_user_id
    if user_filter:
        custom_exercises = await supabase.select(
            "exercises",
            "id,source,external_id,name,normalized_name,primary_muscle,body_part,equipment,is_custom,user_id,is_active",
            is_active="eq.true",
            user_id=f"eq.{user_filter}",
        )
        exercises = [*global_exercises, *custom_exercises]
    exported_exercise_ids = {row["id"] for row in exercises}
    alias_rows = await supabase.select("exercise_aliases", "id,exercise_id,alias,normalized_alias")
    aliases = [row for row in alias_rows if row["exercise_id"] in exported_exercise_ids]
    workouts = []
    workout_exercises = []
    workout_sets = []
    routines = []
    routine_exercises = []
    if user_filter:
        workouts = await supabase.select(
            "workouts",
            "id,user_id,name,started_at,completed_at,notes",
            user_id=f"eq.{user_filter}",
        )
        workout_rows = {row["id"] for row in workouts}
        workout_exercise_rows = await supabase.select(
            "workout_exercises",
            "id,workout_id,exercise_id,exercise_order",
        )
        workout_exercises = [row for row in workout_exercise_rows if row["workout_id"] in workout_rows]
        workout_exercise_ids = {row["id"] for row in workout_exercises}
        workout_set_rows = await supabase.select(
            "workout_sets",
            "id,workout_exercise_id,set_order,reps,weight,is_completed,completed_at",
        )
        workout_sets = [row for row in workout_set_rows if row["workout_exercise_id"] in workout_exercise_ids]
        routines = await supabase.select("routines", "id,user_id,name,notes", user_id=f"eq.{user_filter}")
        routine_rows = {row["id"] for row in routines}
        routine_exercise_rows = await supabase.select(
            "routine_exercises",
            "id,routine_id,exercise_id,exercise_order",
        )
        routine_exercises = [row for row in routine_exercise_rows if row["routine_id"] in routine_rows]

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
    """Idempotently upsert REST rows into a Turso table."""

    for row in rows:
        columns = list(row.keys())
        placeholders = ", ".join(["?"] * len(columns))
        assignments = ", ".join(f"{column}=excluded.{column}" for column in columns if column != "id")
        sql = (
            f"insert into {table} ({', '.join(columns)}) values ({placeholders}) "
            f"on conflict(id) do update set {assignments}"
        )
        values = [int(value) if isinstance(value, bool) else value for value in row.values()]
        conn.execute(sql, values)

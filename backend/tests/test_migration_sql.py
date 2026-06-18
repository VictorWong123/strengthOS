from pathlib import Path


MIGRATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202606180002_harden_workout_rls_constraints.sql"
).read_text(encoding="utf-8")


def test_workout_sets_update_policy_checks_new_owner() -> None:
    policy_start = MIGRATION_SQL.index(
        'create policy "Users can update own sets" on public.workout_sets'
    )
    policy_sql = MIGRATION_SQL[policy_start:]

    assert "for update to authenticated using" in policy_sql
    assert ")) with check (exists (" in policy_sql
    assert policy_sql.count("where we.id = workout_exercise_id") == 2
    assert policy_sql.count("w.user_id = (select auth.uid())") == 2


def test_user_entered_workout_numbers_are_nonnegative() -> None:
    expected_constraints = [
        "add constraint workout_exercises_nonnegative_order check (exercise_order >= 0)",
        "add constraint workout_sets_nonnegative_order check (set_order >= 0)",
        "add constraint workout_sets_nonnegative_reps check (reps is null or reps >= 0)",
        "add constraint workout_sets_nonnegative_weight check (weight is null or weight >= 0)",
        "add constraint routine_exercises_nonnegative_order check (exercise_order >= 0)",
        "add constraint routine_exercises_nonnegative_target_sets check (target_sets is null or target_sets >= 0)",
    ]

    for constraint in expected_constraints:
        assert constraint in MIGRATION_SQL

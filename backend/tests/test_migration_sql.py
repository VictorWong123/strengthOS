from pathlib import Path


MIGRATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202606180002_harden_workout_rls_constraints.sql"
).read_text(encoding="utf-8")

TRAINING_FEATURES_MIGRATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260919233018_add_training_features.sql"
).read_text(encoding="utf-8")

WORKOUT_OPERATION_INDEXES_SQL = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260926035856_index_workout_operations.sql"
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


def test_profile_names_are_added_without_breaking_existing_display_names() -> None:
    assert "add column if not exists first_name text" in TRAINING_FEATURES_MIGRATION_SQL
    assert "add column if not exists last_name text" in TRAINING_FEATURES_MIGRATION_SQL


def test_training_mutations_are_revision_checked_and_idempotent() -> None:
    assert "create or replace function public.save_workout_set" in TRAINING_FEATURES_MIGRATION_SQL
    assert "create or replace function public.add_workout_set" in TRAINING_FEATURES_MIGRATION_SQL
    assert "create or replace function public.delete_workout_set" in TRAINING_FEATURES_MIGRATION_SQL
    assert "create or replace function public.mutate_workout_exercise" in TRAINING_FEATURES_MIGRATION_SQL
    assert "current_revision <> p_expected_revision" in TRAINING_FEATURES_MIGRATION_SQL
    assert "Operation id reused with different payload" in TRAINING_FEATURES_MIGRATION_SQL
    assert "workout_sets_unique_order unique (workout_exercise_id, set_order)" in TRAINING_FEATURES_MIGRATION_SQL


def test_private_photos_require_backend_and_cache_eviction_is_service_only() -> None:
    assert 'drop policy if exists "Users insert own progress photo objects"' in TRAINING_FEATURES_MIGRATION_SQL
    assert 'create policy "Users insert own progress photo objects"' not in TRAINING_FEATURES_MIGRATION_SQL
    assert "create or replace function public.evict_exercise_image_cache" in TRAINING_FEATURES_MIGRATION_SQL
    assert "cache.status <> 'fetching'" in TRAINING_FEATURES_MIGRATION_SQL
    assert "grant execute on function public.evict_exercise_image_cache(bigint) to service_role" in TRAINING_FEATURES_MIGRATION_SQL


def test_training_tables_have_owner_rls_and_input_constraints() -> None:
    for table in ("exercise_cues", "body_measurements", "progress_photos", "workout_operations"):
        assert f"alter table public.{table} enable row level security" in TRAINING_FEATURES_MIGRATION_SQL
    assert "body_measurements_has_value" in TRAINING_FEATURES_MIGRATION_SQL
    assert "workout_sets_rpe_range" in TRAINING_FEATURES_MIGRATION_SQL
    assert "workout_exercises_logging_mode_check" in TRAINING_FEATURES_MIGRATION_SQL


def test_workout_operation_foreign_keys_are_indexed() -> None:
    assert "on public.workout_operations (user_id, created_at)" in WORKOUT_OPERATION_INDEXES_SQL
    assert "on public.workout_operations (workout_id)" in WORKOUT_OPERATION_INDEXES_SQL

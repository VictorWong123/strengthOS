do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_exercises_nonnegative_order'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_nonnegative_order check (exercise_order >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_sets_nonnegative_order'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_nonnegative_order check (set_order >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_sets_nonnegative_reps'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_nonnegative_reps check (reps is null or reps >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_sets_nonnegative_weight'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_nonnegative_weight check (weight is null or weight >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_nonnegative_order'
  ) then
    alter table public.routine_exercises
      add constraint routine_exercises_nonnegative_order check (exercise_order >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_nonnegative_target_sets'
  ) then
    alter table public.routine_exercises
      add constraint routine_exercises_nonnegative_target_sets check (target_sets is null or target_sets >= 0);
  end if;
end $$;

drop policy if exists "Users can update own sets" on public.workout_sets;
create policy "Users can update own sets" on public.workout_sets
  for update to authenticated using (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  ));

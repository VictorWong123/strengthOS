-- Seed realistic test training data for one existing auth user.
--
-- Usage:
-- 1. Update target_user_id, target_user_email, or anchor_date if needed.
-- 2. Run this whole file in the Supabase SQL editor.
--
-- The script is rerunnable. It deletes only rows previously created by this
-- script, identified by the seed marker in workout/routine notes.

do $$
declare
  target_user_id uuid := 'ef53a6f6-ff28-45eb-9afb-257bfcb9bb1e';
  target_user_email text := 'testuser123@gmail.com';
  anchor_date date := date '2026-06-25';
  seed_marker constant text := '[seed-test-training-data]';

  bench_id uuid;
  db_bench_id uuid;
  smith_bench_id uuid;
  pulldown_id uuid;
  rdl_id uuid;

  upper_routine_id uuid := gen_random_uuid();
  lower_routine_id uuid := gen_random_uuid();
  full_body_routine_id uuid := gen_random_uuid();

  week_start date;
  last_week_start date := date_trunc('week', anchor_date)::date - interval '1 week';
  week_index integer := 0;
  started_at_value timestamptz;
  workout_id uuid;
  workout_exercise_id uuid;
begin
  if not exists (
    select 1
    from auth.users
    where id = target_user_id
      and (email = target_user_email or target_user_email is null)
  ) then
    raise exception 'No matching auth.users row exists for id % and email %', target_user_id, target_user_email;
  end if;

  insert into public.profiles (
    id,
    display_name,
    age,
    body_weight_lbs,
    height_inches,
    training_goal,
    training_experience,
    limitations
  )
  values (
    target_user_id,
    'Test Lifter',
    34,
    185,
    70,
    'Build strength and consistency',
    'Intermediate',
    null
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    age = excluded.age,
    body_weight_lbs = excluded.body_weight_lbs,
    height_inches = excluded.height_inches,
    training_goal = excluded.training_goal,
    training_experience = excluded.training_experience,
    limitations = excluded.limitations,
    updated_at = now();

  insert into public.exercises (
    external_id,
    source,
    user_id,
    name,
    normalized_name,
    primary_muscle,
    secondary_muscles,
    body_part,
    equipment,
    movement_category,
    instructions,
    is_custom,
    is_active
  )
  values
    ('seed-barbell-bench-press', 'seed', null, 'Barbell Bench Press', 'barbell bench press', 'Chest', array['Triceps', 'Front Delts'], 'Chest', 'Barbell', 'Strength', array['Lie on a bench.', 'Lower the bar to your chest.', 'Press the bar upward.'], false, true),
    ('seed-dumbbell-bench-press', 'seed', null, 'Dumbbell Bench Press', 'dumbbell bench press', 'Chest', array['Triceps', 'Front Delts'], 'Chest', 'Dumbbell', 'Strength', array['Lie on a bench with dumbbells.', 'Lower under control.', 'Press upward evenly.'], false, true),
    ('seed-smith-machine-bench-press', 'seed', null, 'Smith Machine Bench Press', 'smith machine bench press', 'Chest', array['Triceps', 'Front Delts'], 'Chest', 'Smith Machine', 'Strength', array['Set the bench under the Smith bar.', 'Lower to chest height.', 'Press to lockout.'], false, true),
    ('seed-lat-pulldown', 'seed', null, 'Lat Pulldown', 'lat pulldown', 'Lats', array['Biceps', 'Upper Back'], 'Back', 'Cable', 'Strength', array['Grip the bar.', 'Pull toward the upper chest.', 'Return under control.'], false, true),
    ('seed-romanian-deadlift', 'seed', null, 'Romanian Deadlift', 'romanian deadlift', 'Hamstrings', array['Glutes', 'Lower Back'], 'Legs', 'Barbell', 'Strength', array['Stand tall with the bar.', 'Hinge at the hips.', 'Return by driving hips forward.'], false, true)
  on conflict (source, external_id) do update set
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    primary_muscle = excluded.primary_muscle,
    secondary_muscles = excluded.secondary_muscles,
    body_part = excluded.body_part,
    equipment = excluded.equipment,
    movement_category = excluded.movement_category,
    instructions = excluded.instructions,
    is_active = true,
    updated_at = now();

  select id into bench_id from public.exercises where source = 'seed' and external_id = 'seed-barbell-bench-press';
  select id into db_bench_id from public.exercises where source = 'seed' and external_id = 'seed-dumbbell-bench-press';
  select id into smith_bench_id from public.exercises where source = 'seed' and external_id = 'seed-smith-machine-bench-press';
  select id into pulldown_id from public.exercises where source = 'seed' and external_id = 'seed-lat-pulldown';
  select id into rdl_id from public.exercises where source = 'seed' and external_id = 'seed-romanian-deadlift';

  delete from public.workouts
  where user_id = target_user_id
    and notes like '%' || seed_marker || '%';

  delete from public.routines
  where user_id = target_user_id
    and notes like '%' || seed_marker || '%';

  insert into public.routines (id, user_id, name, notes)
  values
    (upper_routine_id, target_user_id, 'Upper Strength', seed_marker || ' Seed upper routine.'),
    (lower_routine_id, target_user_id, 'Lower Pull', seed_marker || ' Seed lower routine.'),
    (full_body_routine_id, target_user_id, 'Full Body', seed_marker || ' Seed full body routine.');

  insert into public.routine_exercises (routine_id, exercise_id, exercise_order, target_sets, target_reps, notes)
  values
    (upper_routine_id, bench_id, 0, 3, '5-8', null),
    (upper_routine_id, pulldown_id, 1, 3, '8-12', null),
    (upper_routine_id, db_bench_id, 2, 2, '8-10', null),
    (lower_routine_id, rdl_id, 0, 3, '6-8', null),
    (lower_routine_id, pulldown_id, 1, 3, '8-12', null),
    (lower_routine_id, smith_bench_id, 2, 2, '8-10', null),
    (full_body_routine_id, bench_id, 0, 3, '5-8', null),
    (full_body_routine_id, rdl_id, 1, 3, '6-8', null),
    (full_body_routine_id, pulldown_id, 2, 3, '8-12', null);

  for week_start in
    select generate_series(last_week_start - interval '12 weeks', last_week_start, interval '1 week')::date
  loop
    started_at_value := (week_start + 1) + time '18:15';

    insert into public.workouts (user_id, name, started_at, completed_at, notes)
    values (
      target_user_id,
      case when week_index % 2 = 0 then 'Upper Strength' else 'Full Body' end,
      started_at_value,
      started_at_value + interval '62 minutes',
      seed_marker || ' Generated workout.'
    )
    returning id into workout_id;

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, bench_id, 0)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 8, 135 + (week_index * 2.5), true, started_at_value + interval '12 minutes'),
      (workout_exercise_id, 1, 6, 145 + (week_index * 2.5), true, started_at_value + interval '18 minutes'),
      (workout_exercise_id, 2, 5, 155 + (week_index * 2.5), true, started_at_value + interval '24 minutes');

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, pulldown_id, 1)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 12, 90 + (week_index * 2.5), true, started_at_value + interval '34 minutes'),
      (workout_exercise_id, 1, 10, 100 + (week_index * 2.5), true, started_at_value + interval '40 minutes'),
      (workout_exercise_id, 2, 9, 105 + (week_index * 2.5), true, started_at_value + interval '46 minutes');

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, case when week_index % 2 = 0 then db_bench_id else rdl_id end, 2)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 10, case when week_index % 2 = 0 then 55 + week_index else 165 + (week_index * 5) end, true, started_at_value + interval '52 minutes'),
      (workout_exercise_id, 1, 8, case when week_index % 2 = 0 then 60 + week_index else 175 + (week_index * 5) end, true, started_at_value + interval '58 minutes');

    started_at_value := (week_start + 4) + time '09:30';

    insert into public.workouts (user_id, name, started_at, completed_at, notes)
    values (
      target_user_id,
      'Lower Pull',
      started_at_value,
      started_at_value + interval '58 minutes',
      seed_marker || ' Generated workout.'
    )
    returning id into workout_id;

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, rdl_id, 0)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 8, 155 + (week_index * 5), true, started_at_value + interval '10 minutes'),
      (workout_exercise_id, 1, 6, 175 + (week_index * 5), true, started_at_value + interval '17 minutes'),
      (workout_exercise_id, 2, 6, 185 + (week_index * 5), true, started_at_value + interval '24 minutes');

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, smith_bench_id, 1)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 10, 115 + (week_index * 2.5), true, started_at_value + interval '35 minutes'),
      (workout_exercise_id, 1, 8, 125 + (week_index * 2.5), true, started_at_value + interval '42 minutes');

    insert into public.workout_exercises (workout_id, exercise_id, exercise_order)
    values (workout_id, pulldown_id, 2)
    returning id into workout_exercise_id;
    insert into public.workout_sets (workout_exercise_id, set_order, reps, weight, is_completed, completed_at)
    values
      (workout_exercise_id, 0, 12, 95 + (week_index * 2.5), true, started_at_value + interval '49 minutes'),
      (workout_exercise_id, 1, 10, 105 + (week_index * 2.5), true, started_at_value + interval '55 minutes');

    week_index := week_index + 1;
  end loop;

  if exists (
    select 1
    from public.workouts
    where user_id = target_user_id
      and notes like '%' || seed_marker || '%'
      and started_at::date > anchor_date
  ) then
    raise exception 'Seed generated workouts after anchor_date %', anchor_date;
  end if;

  raise notice 'Seeded 3 routines and % workouts for user %, from % through %',
    week_index * 2,
    target_user_id,
    (last_week_start - interval '12 weeks')::date,
    (last_week_start + 4);
end $$;

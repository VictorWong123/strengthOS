create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  external_id text not null default gen_random_uuid()::text,
  source text not null,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  body_part text,
  equipment text,
  movement_category text,
  instructions text[] not null default '{}',
  image_url text,
  animation_url text,
  thumbnail_url text,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_source_external_id_key unique (source, external_id),
  constraint exercises_nonempty_source check (length(source) > 0),
  constraint exercises_nonempty_name check (length(name) > 0),
  constraint exercises_nonempty_normalized_name check (length(normalized_name) > 0),
  constraint custom_exercises_have_owner check (
    (is_custom = false and user_id is null) or
    (is_custom = true and source = 'custom' and user_id is not null)
  )
);

create table public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (exercise_id, normalized_alias)
);

create table public.exercise_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  fetched_count integer not null default 0,
  upserted_count integer not null default 0,
  failed_count integer not null default 0,
  message text
);

create table public.exercise_sync_failures (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.exercise_sync_runs(id) on delete cascade,
  external_id text,
  payload jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Workout',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  exercise_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_order integer not null default 0,
  reps integer,
  weight numeric(8, 2),
  is_completed boolean not null default false,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  exercise_order integer not null default 0,
  target_sets integer,
  target_reps text,
  notes text,
  created_at timestamptz not null default now()
);

create index exercises_normalized_name_idx on public.exercises(normalized_name);
create index exercises_equipment_idx on public.exercises(equipment);
create index exercises_primary_muscle_idx on public.exercises(primary_muscle);
create index exercises_body_part_idx on public.exercises(body_part);
create index exercises_user_id_idx on public.exercises(user_id);
create index exercise_aliases_normalized_idx on public.exercise_aliases(normalized_alias);
create index workouts_user_started_idx on public.workouts(user_id, started_at desc);
create index workout_exercises_workout_idx on public.workout_exercises(workout_id, exercise_order);
create index workout_exercises_exercise_idx on public.workout_exercises(exercise_id);
create index workout_sets_exercise_idx on public.workout_sets(workout_exercise_id, set_order);
create index routines_user_idx on public.routines(user_id, created_at desc);
create index routine_exercises_routine_idx on public.routine_exercises(routine_id, exercise_order);

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_aliases enable row level security;
alter table public.exercise_sync_runs enable row level security;
alter table public.exercise_sync_failures enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;

create policy "Users can read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Authenticated users can read visible exercises" on public.exercises
  for select to authenticated using (is_active and (user_id is null or (select auth.uid()) = user_id));
create policy "Users can create custom exercises" on public.exercises
  for insert to authenticated with check (is_custom and source = 'custom' and (select auth.uid()) = user_id);
create policy "Users can update own custom exercises" on public.exercises
  for update to authenticated using (is_custom and (select auth.uid()) = user_id)
  with check (is_custom and source = 'custom' and (select auth.uid()) = user_id);
create policy "Users can delete own custom exercises" on public.exercises
  for delete to authenticated using (is_custom and (select auth.uid()) = user_id);

create policy "Authenticated users can read aliases for visible exercises" on public.exercise_aliases
  for select to authenticated using (
    exists (
      select 1 from public.exercises e
      where e.id = exercise_aliases.exercise_id
        and e.is_active
        and (e.user_id is null or e.user_id = (select auth.uid()))
    )
  );

create policy "Users can read own workouts" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own workouts" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own workouts" on public.workouts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own workouts" on public.workouts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read own workout exercises" on public.workout_exercises
  for select to authenticated using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
  ));
create policy "Users can create own workout exercises" on public.workout_exercises
  for insert to authenticated with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.exercises e
    where e.id = exercise_id
      and e.is_active
      and (e.user_id is null or e.user_id = (select auth.uid()))
  ));
create policy "Users can update own workout exercises" on public.workout_exercises
  for update to authenticated using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.exercises e
    where e.id = exercise_id
      and e.is_active
      and (e.user_id is null or e.user_id = (select auth.uid()))
  ));
create policy "Users can delete own workout exercises" on public.workout_exercises
  for delete to authenticated using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
  ));

create policy "Users can read own sets" on public.workout_sets
  for select to authenticated using (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  ));
create policy "Users can create own sets" on public.workout_sets
  for insert to authenticated with check (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  ));
create policy "Users can update own sets" on public.workout_sets
  for update to authenticated using (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  ));
create policy "Users can delete own sets" on public.workout_sets
  for delete to authenticated using (exists (
    select 1 from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = (select auth.uid())
  ));

create policy "Users can read own routines" on public.routines
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own routines" on public.routines
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own routines" on public.routines
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own routines" on public.routines
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read own routine exercises" on public.routine_exercises
  for select to authenticated using (exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
  ));
create policy "Users can create own routine exercises" on public.routine_exercises
  for insert to authenticated with check (exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.exercises e
    where e.id = exercise_id
      and e.is_active
      and (e.user_id is null or e.user_id = (select auth.uid()))
  ));
create policy "Users can update own routine exercises" on public.routine_exercises
  for update to authenticated using (exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.exercises e
    where e.id = exercise_id
      and e.is_active
      and (e.user_id is null or e.user_id = (select auth.uid()))
  ));
create policy "Users can delete own routine exercises" on public.routine_exercises
  for delete to authenticated using (exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
  ));

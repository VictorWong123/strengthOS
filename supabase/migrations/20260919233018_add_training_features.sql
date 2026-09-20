-- Training accuracy, history correction, recovery, measurements, and private photos.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists default_weight_increment numeric(8, 2) not null default 5;

alter table public.exercises
  add column if not exists logging_mode text not null default 'weight_reps';

alter table public.exercises drop constraint if exists exercises_logging_mode_check;
alter table public.exercises add constraint exercises_logging_mode_check check (
  logging_mode in ('weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration')
);

update public.exercises set logging_mode = 'bodyweight_reps'
where (source, external_id) in (('exercisedb', '0652'), ('exercisedb', '0814'), ('exercisedb', '0826'));
update public.exercises set logging_mode = 'weighted_bodyweight'
where (source, external_id) in (('exercisedb', '0841'), ('exercisedb', '1755'));
update public.exercises set logging_mode = 'duration'
where (source, external_id) in (('strengthos', 'plank'), ('strengthos', 'dead-hang'));

alter table public.workouts
  add column if not exists revision integer not null default 0,
  add column if not exists duration_seconds integer,
  add column if not exists paused_at timestamptz,
  add column if not exists accumulated_pause_seconds integer not null default 0,
  add column if not exists source text not null default 'strengthos',
  add column if not exists external_id text,
  add column if not exists import_hash text;

alter table public.workouts drop constraint if exists workouts_revision_nonnegative;
alter table public.workouts add constraint workouts_revision_nonnegative check (revision >= 0);
alter table public.workouts drop constraint if exists workouts_duration_nonnegative;
alter table public.workouts add constraint workouts_duration_nonnegative check (duration_seconds is null or duration_seconds >= 0);
alter table public.workouts drop constraint if exists workouts_pause_nonnegative;
alter table public.workouts add constraint workouts_pause_nonnegative check (accumulated_pause_seconds >= 0);
create unique index if not exists workouts_import_source_key
  on public.workouts(user_id, source, external_id) where external_id is not null;

alter table public.workout_exercises
  add column if not exists logging_mode text not null default 'weight_reps',
  add column if not exists target_sets integer,
  add column if not exists target_reps text,
  add column if not exists target_rpe numeric(3, 1),
  add column if not exists rest_seconds integer,
  add column if not exists timer_enabled boolean not null default true,
  add column if not exists session_notes text,
  add column if not exists superset_group uuid,
  add column if not exists source_name text;

alter table public.workout_exercises drop constraint if exists workout_exercises_logging_mode_check;
alter table public.workout_exercises add constraint workout_exercises_logging_mode_check check (
  logging_mode in ('weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration')
);
alter table public.workout_exercises drop constraint if exists workout_exercises_target_sets_nonnegative;
alter table public.workout_exercises add constraint workout_exercises_target_sets_nonnegative check (target_sets is null or target_sets >= 0);
alter table public.workout_exercises drop constraint if exists workout_exercises_target_rpe_range;
alter table public.workout_exercises add constraint workout_exercises_target_rpe_range check (target_rpe is null or target_rpe between 1 and 10);
alter table public.workout_exercises drop constraint if exists workout_exercises_rest_nonnegative;
alter table public.workout_exercises add constraint workout_exercises_rest_nonnegative check (rest_seconds is null or rest_seconds >= 0);

alter table public.workout_sets
  add column if not exists set_type text not null default 'working',
  add column if not exists duration_seconds integer,
  add column if not exists assistance_weight numeric(8, 2),
  add column if not exists bodyweight numeric(8, 2),
  add column if not exists rpe numeric(3, 1),
  add column if not exists operation_id uuid;

alter table public.workout_sets drop constraint if exists workout_sets_type_check;
alter table public.workout_sets add constraint workout_sets_type_check check (
  set_type in ('warmup', 'working', 'failure', 'drop')
);
alter table public.workout_sets drop constraint if exists workout_sets_duration_nonnegative;
alter table public.workout_sets add constraint workout_sets_duration_nonnegative check (duration_seconds is null or duration_seconds >= 0);
alter table public.workout_sets drop constraint if exists workout_sets_assistance_nonnegative;
alter table public.workout_sets add constraint workout_sets_assistance_nonnegative check (assistance_weight is null or assistance_weight >= 0);
alter table public.workout_sets drop constraint if exists workout_sets_bodyweight_nonnegative;
alter table public.workout_sets add constraint workout_sets_bodyweight_nonnegative check (bodyweight is null or bodyweight >= 0);
alter table public.workout_sets drop constraint if exists workout_sets_rpe_range;
alter table public.workout_sets add constraint workout_sets_rpe_range check (rpe is null or rpe between 1 and 10);
alter table public.workout_sets drop constraint if exists workout_sets_unique_order;
alter table public.workout_sets add constraint workout_sets_unique_order unique (workout_exercise_id, set_order);
create unique index if not exists workout_sets_operation_key
  on public.workout_sets(operation_id) where operation_id is not null;

alter table public.routine_exercises
  add column if not exists target_rpe numeric(3, 1),
  add column if not exists rest_seconds integer,
  add column if not exists timer_enabled boolean not null default true,
  add column if not exists superset_group uuid;
alter table public.routine_exercises drop constraint if exists routine_exercises_target_rpe_range;
alter table public.routine_exercises add constraint routine_exercises_target_rpe_range check (target_rpe is null or target_rpe between 1 and 10);
alter table public.routine_exercises drop constraint if exists routine_exercises_rest_nonnegative;
alter table public.routine_exercises add constraint routine_exercises_rest_nonnegative check (rest_seconds is null or rest_seconds >= 0);

create table if not exists public.exercise_cues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  cue text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id),
  constraint exercise_cues_nonempty check (length(trim(cue)) > 0)
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null,
  bodyweight numeric(8, 2),
  neck numeric(8, 2),
  shoulders numeric(8, 2),
  chest numeric(8, 2),
  waist numeric(8, 2),
  hips numeric(8, 2),
  left_arm numeric(8, 2),
  right_arm numeric(8, 2),
  left_thigh numeric(8, 2),
  right_thigh numeric(8, 2),
  left_calf numeric(8, 2),
  right_calf numeric(8, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_measurements_has_value check (
    num_nonnulls(bodyweight, neck, shoulders, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf) > 0
  ),
  constraint body_measurements_nonnegative check (
    coalesce(bodyweight, 0) >= 0 and coalesce(neck, 0) >= 0 and coalesce(shoulders, 0) >= 0 and
    coalesce(chest, 0) >= 0 and coalesce(waist, 0) >= 0 and coalesce(hips, 0) >= 0 and
    coalesce(left_arm, 0) >= 0 and coalesce(right_arm, 0) >= 0 and coalesce(left_thigh, 0) >= 0 and
    coalesce(right_thigh, 0) >= 0 and coalesce(left_calf, 0) >= 0 and coalesce(right_calf, 0) >= 0
  )
);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now(),
  unique (user_id, storage_path),
  constraint progress_photos_owned_path check (storage_path = user_id::text || '/' || id::text || '.webp')
);

create table if not exists public.workout_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.exercise_image_cache (
  cache_key text primary key,
  external_id text not null,
  resolution text not null,
  status text not null,
  object_path text,
  content_type text,
  size_bytes bigint,
  expires_at timestamptz not null,
  lease_until timestamptz,
  last_accessed_at timestamptz not null default now(),
  constraint exercise_image_cache_status check (status in ('fetching', 'ready', 'missing', 'failed')),
  constraint exercise_image_cache_size check (size_bytes is null or size_bytes between 0 and 20971520)
);

create table if not exists public.provider_daily_usage (
  provider text not null,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (provider, usage_date)
);

create index if not exists exercise_cues_user_idx on public.exercise_cues(user_id, exercise_id);
create index if not exists body_measurements_user_date_idx on public.body_measurements(user_id, measured_at desc);
create index if not exists progress_photos_user_date_idx on public.progress_photos(user_id, measured_at desc);

alter table public.exercise_cues enable row level security;
alter table public.body_measurements enable row level security;
alter table public.progress_photos enable row level security;
alter table public.workout_operations enable row level security;
alter table public.exercise_image_cache enable row level security;
alter table public.provider_daily_usage enable row level security;

drop policy if exists "Users manage own exercise cues" on public.exercise_cues;
create policy "Users manage own exercise cues" on public.exercise_cues
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.exercises e
      where e.id = exercise_id and e.is_active and (e.user_id is null or e.user_id = (select auth.uid()))
    )
  );

drop policy if exists "Users manage own body measurements" on public.body_measurements;
create policy "Users manage own body measurements" on public.body_measurements
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own progress photos" on public.progress_photos;
create policy "Users manage own progress photos" on public.progress_photos
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own workout operations" on public.workout_operations;
create policy "Users read own workout operations" on public.workout_operations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own workout operations" on public.workout_operations;
create policy "Users create own workout operations" on public.workout_operations
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media-cache', 'exercise-media-cache', false, 20971520, array['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own progress photo objects" on storage.objects;
create policy "Users read own progress photo objects" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users insert own progress photo objects" on storage.objects;
drop policy if exists "Users update own progress photo objects" on storage.objects;
drop policy if exists "Users delete own progress photo objects" on storage.objects;
create policy "Users delete own progress photo objects" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and owner_id = (select auth.uid())::text);

grant select, insert, update, delete on public.exercise_cues, public.body_measurements, public.progress_photos to authenticated;
grant select, insert on public.workout_operations to authenticated;
revoke all on public.exercise_cues, public.body_measurements, public.progress_photos from anon;
revoke all on public.workout_operations, public.exercise_image_cache, public.provider_daily_usage from anon;
revoke all on public.exercise_image_cache, public.provider_daily_usage from authenticated;

create or replace function public.claim_exercise_image_fetch(
  p_cache_key text,
  p_external_id text,
  p_resolution text,
  p_daily_limit integer
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.exercise_image_cache;
begin
  if p_daily_limit <= 0 then return 'quota'; end if;
  insert into public.exercise_image_cache(cache_key, external_id, resolution, status, expires_at)
  values (p_cache_key, p_external_id, p_resolution, 'failed', now())
  on conflict (cache_key) do nothing;
  select * into current_row from public.exercise_image_cache where cache_key = p_cache_key for update;
  if found and current_row.status = 'ready' and current_row.expires_at > now() then
    update public.exercise_image_cache set last_accessed_at = now() where cache_key = p_cache_key;
    return 'ready';
  end if;
  if found and current_row.status = 'missing' and current_row.expires_at > now() then return 'missing'; end if;
  if found and current_row.status = 'fetching' and current_row.lease_until > now() then return 'busy'; end if;

  insert into public.provider_daily_usage(provider, usage_date, request_count)
  values ('exercisedb', current_date, 1)
  on conflict (provider, usage_date) do update
    set request_count = public.provider_daily_usage.request_count + 1
    where public.provider_daily_usage.request_count < p_daily_limit;
  if not found then return 'quota'; end if;

  insert into public.exercise_image_cache(cache_key, external_id, resolution, status, expires_at, lease_until)
  values (p_cache_key, p_external_id, p_resolution, 'fetching', now(), now() + interval '45 seconds')
  on conflict (cache_key) do update set
    status = 'fetching', lease_until = now() + interval '45 seconds', expires_at = now(), last_accessed_at = now();
  return 'claimed';
end;
$$;

revoke all on function public.claim_exercise_image_fetch(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_exercise_image_fetch(text, text, text, integer) to service_role;

create or replace function public.evict_exercise_image_cache(p_max_bytes bigint)
returns table(object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_bytes bigint;
  victim record;
begin
  if p_max_bytes < 0 then raise exception 'Cache byte limit must be nonnegative'; end if;

  for victim in
    delete from public.exercise_image_cache cache
    where cache.expires_at < now()
      and (cache.status <> 'fetching' or cache.lease_until is null or cache.lease_until <= now())
    returning cache.object_path
  loop
    object_path := victim.object_path;
    return next;
  end loop;

  select coalesce(sum(cache.size_bytes), 0) into total_bytes
  from public.exercise_image_cache cache
  where cache.status = 'ready' and cache.expires_at >= now();

  while total_bytes > p_max_bytes loop
    select cache.cache_key, cache.object_path, coalesce(cache.size_bytes, 0) as size_bytes
      into victim
    from public.exercise_image_cache cache
    where cache.status = 'ready' and cache.expires_at >= now()
    order by cache.last_accessed_at, cache.cache_key
    for update skip locked
    limit 1;
    exit when not found;
    delete from public.exercise_image_cache cache
      where cache.cache_key = victim.cache_key
        and cache.object_path is not distinct from victim.object_path;
    if found then
      total_bytes := greatest(0, total_bytes - victim.size_bytes);
      object_path := victim.object_path;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.evict_exercise_image_cache(bigint) from public, anon, authenticated;
grant execute on function public.evict_exercise_image_cache(bigint) to service_role;

create or replace function public.save_workout_set(
  p_workout_id uuid,
  p_set_id uuid,
  p_expected_revision integer,
  p_operation_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_revision integer;
  saved_result jsonb;
  saved_set public.workout_sets;
  stored_hash text;
  request_hash text := md5(jsonb_build_object(
    'workout_id', p_workout_id,
    'set_id', p_set_id,
    'patch', p_patch
  )::text);
begin
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Expected revision must be nonnegative'; end if;
  if p_operation_id is null then raise exception 'Operation id is required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Patch must be a JSON object'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations
    where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then
    if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if;
    return saved_result;
  end if;
  if p_patch - array['weight','reps','duration_seconds','assistance_weight','bodyweight','rpe','set_type','is_completed','completed_at','notes'] <> '{}'::jsonb then
    raise exception 'Unsupported workout set field';
  end if;
  select revision into current_revision from public.workouts
    where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations
    where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then
    if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if;
    return saved_result;
  end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;
  update public.workout_sets ws set
    weight = case when p_patch ? 'weight' then (p_patch->>'weight')::numeric else ws.weight end,
    reps = case when p_patch ? 'reps' then (p_patch->>'reps')::integer else ws.reps end,
    duration_seconds = case when p_patch ? 'duration_seconds' then (p_patch->>'duration_seconds')::integer else ws.duration_seconds end,
    assistance_weight = case when p_patch ? 'assistance_weight' then (p_patch->>'assistance_weight')::numeric else ws.assistance_weight end,
    bodyweight = case when p_patch ? 'bodyweight' then (p_patch->>'bodyweight')::numeric else ws.bodyweight end,
    rpe = case when p_patch ? 'rpe' then (p_patch->>'rpe')::numeric else ws.rpe end,
    set_type = case when p_patch ? 'set_type' then p_patch->>'set_type' else ws.set_type end,
    is_completed = case when p_patch ? 'is_completed' then (p_patch->>'is_completed')::boolean else ws.is_completed end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch->>'completed_at')::timestamptz else ws.completed_at end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else ws.notes end,
    operation_id = p_operation_id,
    updated_at = now()
  from public.workout_exercises we
  where ws.id = p_set_id and we.id = ws.workout_exercise_id and we.workout_id = p_workout_id
  returning ws.* into saved_set;
  if not found then raise exception 'Workout set not found'; end if;
  update public.workouts set revision = revision + 1, updated_at = now() where id = p_workout_id;
  saved_result = jsonb_build_object('set', to_jsonb(saved_set), 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result)
  values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end;
$$;

revoke all on function public.save_workout_set(uuid, uuid, integer, uuid, jsonb) from public, anon;
grant execute on function public.save_workout_set(uuid, uuid, integer, uuid, jsonb) to authenticated;

create or replace function public.add_workout_set(
  p_workout_id uuid, p_workout_exercise_id uuid, p_set_id uuid,
  p_expected_revision integer, p_operation_id uuid, p_values jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision integer;
  saved_result jsonb;
  saved_set public.workout_sets;
  request_hash text := md5(jsonb_build_object('workout_id', p_workout_id, 'workout_exercise_id', p_workout_exercise_id, 'set_id', p_set_id, 'values', p_values)::text);
  stored_hash text;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null or p_set_id is null then raise exception 'Invalid mutation identity'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values - array['weight','reps','duration_seconds','assistance_weight','bodyweight','rpe','set_type','notes'] <> '{}'::jsonb then raise exception 'Unsupported set values'; end if;
  select revision into current_revision from public.workouts where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if; return saved_result; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;
  if not exists (select 1 from public.workout_exercises where id = p_workout_exercise_id and workout_id = p_workout_id) then raise exception 'Workout exercise not found'; end if;
  insert into public.workout_sets(id, workout_exercise_id, set_order, weight, reps, duration_seconds, assistance_weight, bodyweight, rpe, set_type, notes)
  values (p_set_id, p_workout_exercise_id,
    (select coalesce(max(set_order), -1) + 1 from public.workout_sets where workout_exercise_id = p_workout_exercise_id),
    (p_values->>'weight')::numeric, (p_values->>'reps')::integer, (p_values->>'duration_seconds')::integer,
    (p_values->>'assistance_weight')::numeric, (p_values->>'bodyweight')::numeric, (p_values->>'rpe')::numeric,
    coalesce(p_values->>'set_type', 'working'), p_values->>'notes') returning * into saved_set;
  update public.workouts set revision = revision + 1, updated_at = now() where id = p_workout_id;
  saved_result := jsonb_build_object('set', to_jsonb(saved_set), 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result) values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end; $$;
revoke all on function public.add_workout_set(uuid, uuid, uuid, integer, uuid, jsonb) from public, anon;
grant execute on function public.add_workout_set(uuid, uuid, uuid, integer, uuid, jsonb) to authenticated;

create or replace function public.delete_workout_set(
  p_workout_id uuid, p_set_id uuid, p_expected_revision integer, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision integer;
  saved_result jsonb;
  stored_hash text;
  request_hash text := md5(jsonb_build_object('workout_id', p_workout_id, 'set_id', p_set_id, 'action', 'delete')::text);
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null then raise exception 'Invalid mutation identity'; end if;
  select revision into current_revision from public.workouts where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if; return saved_result; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;
  delete from public.workout_sets s using public.workout_exercises we where s.id = p_set_id and s.workout_exercise_id = we.id and we.workout_id = p_workout_id;
  if not found then raise exception 'Workout set not found'; end if;
  update public.workouts set revision = revision + 1, updated_at = now() where id = p_workout_id;
  saved_result := jsonb_build_object('set_id', p_set_id, 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result) values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end; $$;
revoke all on function public.delete_workout_set(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.delete_workout_set(uuid, uuid, integer, uuid) to authenticated;

create or replace function public.save_workout_exercises(
  p_workout_id uuid, p_expected_revision integer, p_operation_id uuid, p_patches jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision integer;
  saved_result jsonb;
  stored_hash text;
  request_hash text := md5(jsonb_build_object('workout_id', p_workout_id, 'patches', p_patches)::text);
  patch jsonb;
  saved public.workout_exercises;
  rows jsonb := '[]'::jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null then raise exception 'Invalid mutation identity'; end if;
  if p_patches is null or jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) = 0 then raise exception 'Patches must be a nonempty array'; end if;
  select revision into current_revision from public.workouts where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if; return saved_result; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;
  for patch in select value from jsonb_array_elements(p_patches) loop
    if patch - array['id','exercise_order','logging_mode','rest_seconds','timer_enabled','session_notes','superset_group','notes'] <> '{}'::jsonb or not patch ? 'id' then raise exception 'Unsupported workout exercise field'; end if;
    update public.workout_exercises we set
      exercise_order = case when patch ? 'exercise_order' then (patch->>'exercise_order')::integer else we.exercise_order end,
      logging_mode = case when patch ? 'logging_mode' then patch->>'logging_mode' else we.logging_mode end,
      rest_seconds = case when patch ? 'rest_seconds' then (patch->>'rest_seconds')::integer else we.rest_seconds end,
      timer_enabled = case when patch ? 'timer_enabled' then (patch->>'timer_enabled')::boolean else we.timer_enabled end,
      session_notes = case when patch ? 'session_notes' then patch->>'session_notes' else we.session_notes end,
      superset_group = case when patch ? 'superset_group' then (patch->>'superset_group')::uuid else we.superset_group end,
      notes = case when patch ? 'notes' then patch->>'notes' else we.notes end
    where we.id = (patch->>'id')::uuid and we.workout_id = p_workout_id returning we.* into saved;
    if not found then raise exception 'Workout exercise not found'; end if;
    rows := rows || jsonb_build_array(to_jsonb(saved));
  end loop;
  update public.workouts set revision = revision + 1, updated_at = now() where id = p_workout_id;
  saved_result := jsonb_build_object('workout_exercises', rows, 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result) values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end; $$;
revoke all on function public.save_workout_exercises(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function public.save_workout_exercises(uuid, integer, uuid, jsonb) to authenticated;

create or replace function public.mutate_workout_exercise(
  p_workout_id uuid, p_expected_revision integer, p_operation_id uuid, p_action text,
  p_target_id uuid default null, p_new_id uuid default null, p_exercise_id uuid default null,
  p_exercise_order integer default null, p_logging_mode text default null, p_source_name text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision integer;
  saved_result jsonb;
  stored_hash text;
  request_hash text := md5(jsonb_build_object('workout_id', p_workout_id, 'action', p_action, 'target_id', p_target_id, 'new_id', p_new_id, 'exercise_id', p_exercise_id, 'exercise_order', p_exercise_order, 'logging_mode', p_logging_mode, 'source_name', p_source_name)::text);
  inserted public.workout_exercises;
  target public.workout_exercises;
  removed_id uuid;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null or p_action is null or p_action not in ('add','remove','replace') then raise exception 'Invalid exercise mutation'; end if;
  select revision into current_revision from public.workouts where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if; return saved_result; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;

  if p_action in ('remove','replace') then
    select * into target from public.workout_exercises where id = p_target_id and workout_id = p_workout_id for update;
    if not found then raise exception 'Workout exercise not found'; end if;
    if p_action = 'remove' or not exists (select 1 from public.workout_sets where workout_exercise_id = target.id and is_completed) then
      if exists (select 1 from public.workout_sets where workout_exercise_id = target.id and is_completed) then raise exception 'Completed work must be preserved'; end if;
      delete from public.workout_exercises where id = target.id;
      removed_id := target.id;
    end if;
  end if;

  if p_action in ('add','replace') then
    if p_new_id is null or p_exercise_id is null or p_logging_mode is null then raise exception 'New exercise fields are required'; end if;
    if p_action = 'replace' and removed_id is null then
      update public.workout_exercises set exercise_order = exercise_order + 1
      where workout_id = p_workout_id and exercise_order > target.exercise_order;
    end if;
    insert into public.workout_exercises(id, workout_id, exercise_id, exercise_order, logging_mode, source_name)
    values (p_new_id, p_workout_id, p_exercise_id,
      case when p_action = 'replace' then target.exercise_order + case when removed_id is null then 1 else 0 end
        else (select coalesce(max(exercise_order), -1) + 1 from public.workout_exercises where workout_id = p_workout_id) end,
      p_logging_mode, p_source_name)
    returning * into inserted;
  end if;

  update public.workouts set revision = revision + 1, updated_at = now() where id = p_workout_id;
  saved_result := jsonb_build_object('workout_exercise', case when inserted.id is null then null else to_jsonb(inserted) end, 'removed_id', removed_id, 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result) values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end; $$;
revoke all on function public.mutate_workout_exercise(uuid, integer, uuid, text, uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.mutate_workout_exercise(uuid, integer, uuid, text, uuid, uuid, uuid, integer, text, text) to authenticated;

create or replace function public.save_workout(
  p_workout_id uuid,
  p_expected_revision integer,
  p_operation_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_revision integer;
  saved_result jsonb;
  saved_workout public.workouts;
  stored_hash text;
  request_hash text := md5(jsonb_build_object('workout_id', p_workout_id, 'patch', p_patch)::text);
begin
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Expected revision must be nonnegative'; end if;
  if p_operation_id is null then raise exception 'Operation id is required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Patch must be a JSON object'; end if;
  if p_patch - array['name','notes','started_at','completed_at','duration_seconds','paused_at','accumulated_pause_seconds'] <> '{}'::jsonb then
    raise exception 'Unsupported workout field';
  end if;
  select revision into current_revision from public.workouts
    where id = p_workout_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Workout not found'; end if;
  select result, workout_operations.request_hash into saved_result, stored_hash from public.workout_operations
    where operation_id = p_operation_id and user_id = (select auth.uid());
  if found then
    if stored_hash <> request_hash then raise exception 'Operation id reused with different payload'; end if;
    return saved_result;
  end if;
  if current_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'Workout changed in another session'; end if;
  update public.workouts w set
    name = case when p_patch ? 'name' then p_patch->>'name' else w.name end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else w.notes end,
    started_at = case when p_patch ? 'started_at' then (p_patch->>'started_at')::timestamptz else w.started_at end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch->>'completed_at')::timestamptz else w.completed_at end,
    duration_seconds = case when p_patch ? 'duration_seconds' then (p_patch->>'duration_seconds')::integer else w.duration_seconds end,
    paused_at = case when p_patch ? 'paused_at' then (p_patch->>'paused_at')::timestamptz else w.paused_at end,
    accumulated_pause_seconds = case when p_patch ? 'accumulated_pause_seconds' then (p_patch->>'accumulated_pause_seconds')::integer else w.accumulated_pause_seconds end,
    revision = revision + 1,
    updated_at = now()
  where id = p_workout_id returning w.* into saved_workout;
  if saved_workout.completed_at is not null and saved_workout.completed_at < saved_workout.started_at then
    raise exception 'Workout completion cannot precede its start';
  end if;
  if saved_workout.completed_at is not null and saved_workout.paused_at is not null then
    raise exception 'A completed workout cannot remain paused';
  end if;
  if saved_workout.paused_at is not null and saved_workout.paused_at < saved_workout.started_at then
    raise exception 'Workout pause cannot precede its start';
  end if;
  saved_result = jsonb_build_object('workout', to_jsonb(saved_workout), 'revision', current_revision + 1);
  insert into public.workout_operations(operation_id, user_id, workout_id, request_hash, result)
  values (p_operation_id, (select auth.uid()), p_workout_id, request_hash, saved_result);
  return saved_result;
end;
$$;

revoke all on function public.save_workout(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function public.save_workout(uuid, integer, uuid, jsonb) to authenticated;

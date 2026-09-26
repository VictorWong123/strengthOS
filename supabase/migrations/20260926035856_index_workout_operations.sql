create index if not exists workout_operations_user_created_idx
  on public.workout_operations (user_id, created_at);

create index if not exists workout_operations_workout_id_idx
  on public.workout_operations (workout_id);

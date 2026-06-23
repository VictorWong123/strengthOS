alter table public.profiles
  add column if not exists age integer,
  add column if not exists body_weight_lbs numeric(6, 2),
  add column if not exists height_inches numeric(5, 2),
  add column if not exists training_goal text,
  add column if not exists training_experience text,
  add column if not exists limitations text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_age_range'
  ) then
    alter table public.profiles
      add constraint profiles_age_range check (age is null or age between 1 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_body_weight_positive'
  ) then
    alter table public.profiles
      add constraint profiles_body_weight_positive check (body_weight_lbs is null or body_weight_lbs > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_height_positive'
  ) then
    alter table public.profiles
      add constraint profiles_height_positive check (height_inches is null or height_inches > 0);
  end if;
end $$;

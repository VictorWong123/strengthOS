alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.profiles
set
  first_name = coalesce(first_name, nullif(split_part(display_name, ' ', 1), '')),
  last_name = coalesce(last_name, nullif(trim(substr(display_name, length(split_part(display_name, ' ', 1)) + 1)), ''))
where display_name is not null
  and (first_name is null or last_name is null);

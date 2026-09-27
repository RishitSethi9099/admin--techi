insert into public.clubs (
  name,
  slug,
  short_name,
  description
)
values (
  'IEEE',
  'ieee',
  'IEEE',
  'Institute of Electrical and Electronics Engineers student club.'
)
on conflict (slug) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  updated_at = now();

insert into public.clubs (name, slug, short_name, description)
values
  ('IEEE RAS', 'ieee-ras', 'IEEE RAS', 'IEEE Robotics and Automation Society.'),
  ('IEEE SB', 'ieee-sb', 'IEEE SB', 'IEEE Student Branch.'),
  ('IEEE CS', 'ieee-cs', 'IEEE CS', 'IEEE Computer Society.'),
  ('IEEE CIS', 'ieee-cis', 'IEEE CIS', 'IEEE Computational Intelligence Society.'),
  ('IEEE WIE', 'ieee-wie', 'IEEE WIE', 'IEEE Women in Engineering.'),
  ('IEEE AESS', 'ieee-aess', 'IEEE AESS', 'IEEE Aerospace and Electronic Systems Society.'),
  ('GARUDA', 'garuda', 'GARUDA', 'GARUDA club.'),
  ('APERTURE', 'aperture', 'APERTURE', 'APERTURE club.'),
  ('LITMUS', 'litmus', 'LITMUS', 'LITMUS club.'),
  ('D''Artistry', 'd-artistry', 'D''Artistry', 'D''Artistry club.'),
  ('TMC', 'tmc', 'TMC', 'TMC club.'),
  ('Coreo', 'coreo', 'Coreo', 'Coreo club.'),
  ('ACM', 'acm', 'ACM', 'ACM club.')
on conflict (slug) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  updated_at = now();

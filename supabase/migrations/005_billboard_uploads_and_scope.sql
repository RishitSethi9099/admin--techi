-- Billboard owner flow additions.
-- Adds the club promo description field and makes uploaded event/billboard media
-- readable by the connected public website.

alter table public.billboards
  add column if not exists about_club text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('billboard-media', 'billboard-media', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('event-posters', 'event-posters', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Fields used to export approved events into the Techideate 3D city screens.json shape.
alter table public.events
  add column if not exists event_tier text not null default 'minor',
  add column if not exists screen_slot text,
  add column if not exists poster_tall_url text,
  add column if not exists poster_wide_url text,
  add column if not exists video_url text,
  add column if not exists screen_details text;

alter table public.events
  drop constraint if exists events_event_tier_check;

alter table public.events
  add constraint events_event_tier_check
  check (event_tier in ('major', 'minor'));

create index if not exists events_screen_export_idx
  on public.events (event_tier, event_datetime)
  where status = 'approved' and deleted_at is null;

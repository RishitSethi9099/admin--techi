-- Public TECHIDEATE schedule timeline.
-- Evolves the older events table into the club-managed schedule source used by /api/schedule.

do $$
begin
  create type public.event_status as enum ('draft', 'published');
exception when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists start_datetime timestamptz,
  add column if not exists end_datetime timestamptz,
  add column if not exists venue text,
  add column if not exists registration_url text;

update public.events
set start_datetime = coalesce(start_datetime, event_datetime),
    end_datetime = coalesce(end_datetime, event_datetime + interval '1 hour')
where start_datetime is null
  and event_datetime is not null;

alter table public.events
  alter column start_datetime set not null,
  alter column end_datetime set not null;

alter table public.events
  drop constraint if exists events_end_after_start,
  add constraint events_end_after_start check (end_datetime > start_datetime),
  drop constraint if exists events_title_length,
  add constraint events_title_length check (char_length(title) between 3 and 120),
  drop constraint if exists events_description_length,
  add constraint events_description_length check (char_length(description) between 3 and 1200),
  drop constraint if exists events_venue_length,
  add constraint events_venue_length check (venue is null or char_length(venue) between 2 and 160),
  drop constraint if exists events_registration_url_http,
  add constraint events_registration_url_http check (
    registration_url is null
    or registration_url = ''
    or registration_url ~* '^https?://'
  );

alter table public.events
  alter column status drop default;

alter table public.events
  alter column status type public.event_status
  using (
    case
      when status::text in ('approved', 'published') then 'published'
      else 'draft'
    end
  )::public.event_status;

alter table public.events
  alter column status set default 'draft'::public.event_status;

drop index if exists events_public_sort_idx;
drop index if exists events_screen_export_idx;
create index if not exists events_public_schedule_idx
  on public.events (start_datetime, end_datetime)
  where status = 'published';

create index if not exists events_club_schedule_idx
  on public.events (club_id, start_datetime);

drop policy if exists "Public reads approved events" on public.events;
drop policy if exists "Club admins create own pending events" on public.events;
drop policy if exists "Club admins update own events" on public.events;
drop policy if exists "Super admins delete events" on public.events;
drop policy if exists "Public reads published events" on public.events;
drop policy if exists "Admins read scoped events" on public.events;
drop policy if exists "Admins create scoped events" on public.events;
drop policy if exists "Admins update scoped events" on public.events;
drop policy if exists "Admins delete scoped events" on public.events;

create policy "Public reads published events"
on public.events for select
to anon, authenticated
using (status = 'published' or public.is_super_admin() or public.is_club_admin_for(club_id) or public.is_event_ops());

create policy "Admins read scoped events"
on public.events for select
to authenticated
using (
  public.is_super_admin()
  or public.is_club_admin_for(club_id)
  or exists (
    select 1 from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = events.club_id
  )
);

create policy "Admins create scoped events"
on public.events for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_club_admin_for(club_id)
  or exists (
    select 1 from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = events.club_id
  )
);

create policy "Admins update scoped events"
on public.events for update
to authenticated
using (
  public.is_super_admin()
  or public.is_club_admin_for(club_id)
  or exists (
    select 1 from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = events.club_id
  )
)
with check (
  public.is_super_admin()
  or public.is_club_admin_for(club_id)
  or exists (
    select 1 from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = events.club_id
  )
);

create policy "Admins delete scoped events"
on public.events for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_club_admin_for(club_id)
  or exists (
    select 1 from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = events.club_id
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads event posters" on storage.objects;
create policy "Public reads event posters"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'event-posters');

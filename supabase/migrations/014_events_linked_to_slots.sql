-- Link each schedule entry to the club event it belongs to (event_slots),
-- so the website knows whether it is a major or a minor event.
-- One schedule entry per club event. Special events made by the Super Admin
-- (inauguration etc.) have no slot and count as minor unless set otherwise.

alter table public.events
  add column if not exists event_slot_id uuid references public.event_slots(id) on delete set null;

create unique index if not exists events_one_per_slot_idx
  on public.events (event_slot_id)
  where event_slot_id is not null and deleted_at is null;

-- tier always follows the slot, and the slot must belong to the event's club
create or replace function public.sync_event_tier_from_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot record;
begin
  if new.event_slot_id is null then
    return new;
  end if;
  select club_id, event_tier into slot from public.event_slots where id = new.event_slot_id;
  if not found then
    raise exception 'Event slot not found';
  end if;
  if slot.club_id <> new.club_id then
    raise exception 'This event belongs to a different club';
  end if;
  new.event_tier := slot.event_tier;
  return new;
end;
$$;

drop trigger if exists events_sync_tier_from_slot on public.events;
create trigger events_sync_tier_from_slot
before insert or update on public.events
for each row execute function public.sync_event_tier_from_slot();

-- link existing entries whose title matches one of their club's event names exactly
update public.events e
set event_slot_id = s.id, event_tier = s.event_tier
from public.event_slots s
where e.event_slot_id is null
  and e.deleted_at is null
  and s.club_id = e.club_id
  and lower(trim(s.event_name)) = lower(trim(e.title))
  and not exists (
    select 1 from public.events other
    where other.event_slot_id = s.id and other.deleted_at is null
  )
  and (
    select count(*) from public.events dup
    where dup.club_id = e.club_id and dup.deleted_at is null
      and lower(trim(dup.title)) = lower(trim(e.title))
  ) = 1;

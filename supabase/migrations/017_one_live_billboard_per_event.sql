-- Clubs now have several events (Nexus has two, many have a minor poster and a major video,
-- collabs share one). The first version only allowed ONE live billboard per club, so approving
-- a club's second upload failed. Allow one live billboard per EVENT instead.

drop index if exists public.billboards_one_active_approved_per_club;

create unique index if not exists billboards_one_live_per_event
  on public.billboards (event_slot_id)
  where active = true and status = 'approved' and event_slot_id is not null;

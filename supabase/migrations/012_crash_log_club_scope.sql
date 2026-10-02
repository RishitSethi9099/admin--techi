-- Club-scoped errors.
-- Every error that belongs to a club's billboard or event now carries that club,
-- so club admins and their assigned Event Ops / POCs see (and get emailed about)
-- only their own club's problems. The Super Admin still sees everything.

alter table public.crash_logs
  add column if not exists club_id uuid references public.clubs(id) on delete set null,
  add column if not exists fingerprint text;

create index if not exists crash_logs_club_idx on public.crash_logs (club_id, last_seen_at desc);
create index if not exists crash_logs_open_fingerprint_idx on public.crash_logs (fingerprint, last_seen_at desc) where resolved = false;

-- Earlier reports kept the club only inside metadata; copy it across when it is a real club.
update public.crash_logs log
set club_id = club.id
from public.clubs club
where log.club_id is null
  and log.metadata ->> 'club_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and club.id = (log.metadata ->> 'club_id')::uuid;

drop policy if exists "Club admins read own club crash logs" on public.crash_logs;
create policy "Club admins read own club crash logs"
on public.crash_logs for select
to authenticated
using (club_id is not null and public.is_club_admin_for(club_id));

drop policy if exists "Event ops read assigned club crash logs" on public.crash_logs;
create policy "Event ops read assigned club crash logs"
on public.crash_logs for select
to authenticated
using (
  club_id is not null
  and public.is_event_ops()
  and exists (
    select 1
    from public.admin_club_access access
    where access.user_id = auth.uid()
      and access.club_id = crash_logs.club_id
  )
);

-- Mark an error fixed (or reopen it). Super Admin: any error. Club admin / assigned
-- Event Ops: only their club's errors. Only the resolved flag can change.
create or replace function public.set_crash_log_resolved(log_id uuid, is_resolved boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  log_club uuid;
begin
  select club_id into log_club from public.crash_logs where id = log_id;
  if not found then
    return false;
  end if;
  if not (
    public.is_super_admin()
    or (log_club is not null and public.is_club_admin_for(log_club))
    or (
      log_club is not null
      and public.is_event_ops()
      and exists (select 1 from public.admin_club_access a where a.user_id = auth.uid() and a.club_id = log_club)
    )
  ) then
    raise exception 'Not allowed to change this error';
  end if;
  update public.crash_logs set resolved = is_resolved, updated_at = now() where id = log_id;
  return true;
end;
$$;

revoke all on function public.set_crash_log_resolved(uuid, boolean) from public, anon;
grant execute on function public.set_crash_log_resolved(uuid, boolean) to authenticated;

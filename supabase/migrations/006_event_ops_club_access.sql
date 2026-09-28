-- Event Ops / POC admins may be assigned to up to 10 clubs.
-- Super Admin keeps global access. Club Admin keeps one primary club through users.club_id.

alter table public.users
  drop constraint if exists super_admin_has_no_required_club;

alter table public.users
  add constraint privileged_roles_do_not_need_primary_club check (
    role in ('super_admin', 'event_ops') or club_id is not null
  );

create table if not exists public.admin_club_access (
  user_id uuid not null references public.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

create index if not exists admin_club_access_club_idx
  on public.admin_club_access (club_id);

create or replace function public.prevent_more_than_ten_ops_clubs()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.admin_club_access
    where user_id = new.user_id
  ) >= 10 then
    raise exception 'Event Ops admins can be assigned to at most 10 clubs';
  end if;

  return new;
end;
$$;

drop trigger if exists admin_club_access_max_ten on public.admin_club_access;
create trigger admin_club_access_max_ten
before insert on public.admin_club_access
for each row execute function public.prevent_more_than_ten_ops_clubs();

alter table public.admin_club_access enable row level security;

drop policy if exists "Super admins manage event ops club access" on public.admin_club_access;
create policy "Super admins manage event ops club access"
on public.admin_club_access for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Assigned admins read own club access" on public.admin_club_access;
create policy "Assigned admins read own club access"
on public.admin_club_access for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "Event ops upload assigned event posters" on storage.objects;
create policy "Event ops upload assigned event posters"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'event-posters'
  and exists (
    select 1
    from public.admin_club_access
    where user_id = auth.uid()
      and club_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Event ops update assigned event posters" on storage.objects;
create policy "Event ops update assigned event posters"
on storage.objects for update
to authenticated
using (
  bucket_id = 'event-posters'
  and exists (
    select 1
    from public.admin_club_access
    where user_id = auth.uid()
      and club_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'event-posters'
  and exists (
    select 1
    from public.admin_club_access
    where user_id = auth.uid()
      and club_id::text = (storage.foldername(name))[1]
  )
);

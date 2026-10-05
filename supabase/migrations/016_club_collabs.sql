-- Collab events ("ACM x SIGAI", "Pitchers X EIS", ...).
-- A collab stays one entry in the clubs list (so its events, posters and videos live in one place),
-- and is linked to its partner clubs. The club admins of every partner club can then see and manage
-- everything the collab has, exactly as if it were their own club. Nothing is copied.

create table if not exists public.club_collabs (
  collab_club_id uuid not null references public.clubs(id) on delete cascade,
  member_club_id uuid not null references public.clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collab_club_id, member_club_id),
  check (collab_club_id <> member_club_id)
);
create index if not exists club_collabs_member_idx on public.club_collabs (member_club_id);

alter table public.club_collabs enable row level security;

drop policy if exists "Anyone reads club collabs" on public.club_collabs;
create policy "Anyone reads club collabs"
on public.club_collabs for select
to anon, authenticated
using (true);

drop policy if exists "Super admins manage club collabs" on public.club_collabs;
create policy "Super admins manage club collabs"
on public.club_collabs for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Every club-admin rule (events, billboards, errors, ...) goes through this function,
-- so teaching it about collabs gives partner clubs access everywhere at once.
create or replace function public.is_club_admin_for(check_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'club_admin'
      and u.status = 'active'
      and (
        u.club_id = check_club_id
        or exists (
          select 1 from public.club_collabs c
          where c.collab_club_id = check_club_id
            and c.member_club_id = u.club_id
        )
      )
  )
$$;

-- Uploads go into a folder named after the club. Let partner clubs upload into the collab's folder too.
create or replace function public.storage_folder_club_id(object_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
  end
$$;

drop policy if exists "Club admins upload own billboard media" on storage.objects;
create policy "Club admins upload own billboard media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'billboard-media' and public.is_club_admin_for(public.storage_folder_club_id(name)));

drop policy if exists "Club admins update own billboard media" on storage.objects;
create policy "Club admins update own billboard media"
on storage.objects for update
to authenticated
using (bucket_id = 'billboard-media' and public.is_club_admin_for(public.storage_folder_club_id(name)))
with check (bucket_id = 'billboard-media' and public.is_club_admin_for(public.storage_folder_club_id(name)));

drop policy if exists "Club admins upload own event posters" on storage.objects;
create policy "Club admins upload own event posters"
on storage.objects for insert
to authenticated
with check (bucket_id = 'event-posters' and public.is_club_admin_for(public.storage_folder_club_id(name)));

drop policy if exists "Club admins update own event posters" on storage.objects;
create policy "Club admins update own event posters"
on storage.objects for update
to authenticated
using (bucket_id = 'event-posters' and public.is_club_admin_for(public.storage_folder_club_id(name)))
with check (bucket_id = 'event-posters' and public.is_club_admin_for(public.storage_folder_club_id(name)));

-- Partner clubs see each other's submissions for a shared collab (so both see "waiting for approval").
drop policy if exists "Club admins read their clubs' approval requests" on public.approval_requests;
create policy "Club admins read their clubs' approval requests"
on public.approval_requests for select
to authenticated
using (
  public.is_club_admin_for(
    case when proposed_value ->> 'club_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (proposed_value ->> 'club_id')::uuid
    end
  )
);

-- The collabs in the club list (rows are skipped if a club id doesn't exist).
insert into public.club_collabs (collab_club_id, member_club_id)
select v.collab_id::uuid, v.member_id::uuid
from (values
  -- ACM x SIGAI  ->  ACM + ACM SIGAI
  ('c3580fe7-8d0a-49b4-a315-03b6de720b77', 'c8925cc1-9101-4e68-b1c0-fae782278c66'),
  ('c3580fe7-8d0a-49b4-a315-03b6de720b77', '7f453447-0bae-4053-9b57-7cac2c6084a8'),
  -- Mechatronics X IEI  ->  IEI Mechatronics + IEI
  ('2d776b0d-816d-48df-b5dd-d77e511cda25', '10307a9f-a828-4c54-83cd-5ca824927888'),
  ('2d776b0d-816d-48df-b5dd-d77e511cda25', 'dd003366-22a3-40d7-9c96-6cba2dbdb92c'),
  -- Pitchers X EIS  ->  Pitchers Craft + EIS (both EIS rows in the list)
  ('fbbaa023-d5a6-4e92-8d5e-b9e666ec3349', '33d1784d-2bf5-4a78-9829-1c29a523b6da'),
  ('fbbaa023-d5a6-4e92-8d5e-b9e666ec3349', '7f280f5d-c9ef-4a15-9162-2cfe1e052f88'),
  ('fbbaa023-d5a6-4e92-8d5e-b9e666ec3349', '5604bb1e-b995-4bea-8877-d1e98ebf3b80')
) as v(collab_id, member_id)
where exists (select 1 from public.clubs where id = v.collab_id::uuid)
  and exists (select 1 from public.clubs where id = v.member_id::uuid)
on conflict do nothing;

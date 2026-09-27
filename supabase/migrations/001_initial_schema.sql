-- Techi shared Supabase schema
-- Applies to both techi-admin and techi-website.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('super_admin', 'club_admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.admin_status as enum ('active', 'invited', 'suspended');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.billboard_type as enum ('video', 'poster');
exception when duplicate_object then null;
end $$;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.app_role not null default 'club_admin',
  club_id uuid references public.clubs(id) on delete set null,
  status public.admin_status not null default 'invited',
  last_login_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint super_admin_has_no_required_club check (
    role = 'super_admin' or club_id is not null
  )
);

create table if not exists public.billboards (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  type public.billboard_type not null,
  media_url text not null,
  active boolean not null default false,
  status public.approval_status not null default 'pending',
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billboards_one_active_approved_per_club
  on public.billboards (club_id)
  where active = true and status = 'approved';

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  position text not null,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text not null,
  event_datetime timestamptz not null,
  poster_url text,
  status public.approval_status not null default 'pending',
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_public_sort_idx
  on public.events (event_datetime)
  where status = 'approved';

create table if not exists public.crash_logs (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'warning',
  message text not null,
  page_url text,
  source text not null,
  error_type text,
  response_time_ms integer,
  resolved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crash_logs_created_at_idx on public.crash_logs (created_at desc);
create index if not exists crash_logs_error_type_idx on public.crash_logs (error_type, created_at desc);

create table if not exists public.crash_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  error_type text not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (error_type)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clubs_touch_updated_at on public.clubs;
create trigger clubs_touch_updated_at
before update on public.clubs
for each row execute function public.touch_updated_at();

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

drop trigger if exists billboards_touch_updated_at on public.billboards;
create trigger billboards_touch_updated_at
before update on public.billboards
for each row execute function public.touch_updated_at();

drop trigger if exists team_members_touch_updated_at on public.team_members;
create trigger team_members_touch_updated_at
before update on public.team_members
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists crash_logs_touch_updated_at on public.crash_logs;
create trigger crash_logs_touch_updated_at
before update on public.crash_logs
for each row execute function public.touch_updated_at();

create or replace function public.current_app_user()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.users
  where id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
  )
$$;

create or replace function public.current_user_club_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select club_id
  from public.users
  where id = auth.uid()
    and role = 'club_admin'
    and status = 'active'
  limit 1
$$;

create or replace function public.is_club_admin_for(check_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'club_admin'
      and status = 'active'
      and club_id = check_club_id
  )
$$;

create or replace function public.set_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists billboards_set_created_by on public.billboards;
create trigger billboards_set_created_by
before insert on public.billboards
for each row execute function public.set_created_by();

drop trigger if exists events_set_created_by on public.events;
create trigger events_set_created_by
before insert on public.events
for each row execute function public.set_created_by();

drop trigger if exists team_members_set_created_by on public.team_members;
create trigger team_members_set_created_by
before insert on public.team_members
for each row execute function public.set_created_by();

create or replace function public.prevent_club_admin_approval_changes()
returns trigger
language plpgsql
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status = 'pending';
    new.approved_by = null;
    new.approved_at = null;
    new.rejection_reason = null;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejection_reason is distinct from old.rejection_reason
  then
    raise exception 'Only super admins may approve or reject content';
  end if;

  return new;
end;
$$;

drop trigger if exists billboards_prevent_club_admin_approval_changes on public.billboards;
create trigger billboards_prevent_club_admin_approval_changes
before insert or update on public.billboards
for each row execute function public.prevent_club_admin_approval_changes();

drop trigger if exists events_prevent_club_admin_approval_changes on public.events;
create trigger events_prevent_club_admin_approval_changes
before insert or update on public.events
for each row execute function public.prevent_club_admin_approval_changes();

create or replace function public.prevent_profile_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.club_id is distinct from old.club_id
    or new.status is distinct from old.status
  then
    raise exception 'Only super admins may change role, club, or status';
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_profile_self_escalation on public.users;
create trigger users_prevent_profile_self_escalation
before update on public.users
for each row execute function public.prevent_profile_self_escalation();

alter table public.clubs enable row level security;
alter table public.users enable row level security;
alter table public.billboards enable row level security;
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.crash_logs enable row level security;
alter table public.crash_alert_deliveries enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Public can read clubs" on public.clubs;
create policy "Public can read clubs"
on public.clubs for select
to anon, authenticated
using (true);

drop policy if exists "Super admins manage clubs" on public.clubs;
create policy "Super admins manage clubs"
on public.clubs for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

drop policy if exists "Users can update own basic profile" on public.users;
create policy "Users can update own basic profile"
on public.users for update
to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

drop policy if exists "Super admins manage users" on public.users;
create policy "Super admins manage users"
on public.users for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Public reads active approved billboards" on public.billboards;
create policy "Public reads active approved billboards"
on public.billboards for select
to anon, authenticated
using (
  (status = 'approved' and active = true)
  or public.is_super_admin()
  or public.is_club_admin_for(club_id)
);

drop policy if exists "Club admins create own pending billboards" on public.billboards;
create policy "Club admins create own pending billboards"
on public.billboards for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    public.is_club_admin_for(club_id)
    and status = 'pending'
    and approved_by is null
    and approved_at is null
  )
);

drop policy if exists "Club admins update own billboards" on public.billboards;
create policy "Club admins update own billboards"
on public.billboards for update
to authenticated
using (public.is_super_admin() or public.is_club_admin_for(club_id))
with check (public.is_super_admin() or public.is_club_admin_for(club_id));

drop policy if exists "Super admins delete billboards" on public.billboards;
create policy "Super admins delete billboards"
on public.billboards for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "Public reads team members" on public.team_members;
create policy "Public reads team members"
on public.team_members for select
to anon, authenticated
using (true);

drop policy if exists "Super admins manage team members" on public.team_members;
create policy "Super admins manage team members"
on public.team_members for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Public reads approved events" on public.events;
create policy "Public reads approved events"
on public.events for select
to anon, authenticated
using (
  status = 'approved'
  or public.is_super_admin()
  or public.is_club_admin_for(club_id)
);

drop policy if exists "Club admins create own pending events" on public.events;
create policy "Club admins create own pending events"
on public.events for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    public.is_club_admin_for(club_id)
    and status = 'pending'
    and approved_by is null
    and approved_at is null
  )
);

drop policy if exists "Club admins update own events" on public.events;
create policy "Club admins update own events"
on public.events for update
to authenticated
using (public.is_super_admin() or public.is_club_admin_for(club_id))
with check (public.is_super_admin() or public.is_club_admin_for(club_id));

drop policy if exists "Super admins delete events" on public.events;
create policy "Super admins delete events"
on public.events for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins read crash logs" on public.crash_logs;
create policy "Super admins read crash logs"
on public.crash_logs for select
to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins update crash logs" on public.crash_logs;
create policy "Super admins update crash logs"
on public.crash_logs for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Super admins read crash alert deliveries" on public.crash_alert_deliveries;
create policy "Super admins read crash alert deliveries"
on public.crash_alert_deliveries for select
to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins read audit logs" on public.audit_logs;
create policy "Super admins read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_super_admin());

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.write_audit_log(
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid,
  audit_diff jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  actor record;
begin
  select name, email
  into actor
  from public.users
  where id = auth.uid();

  insert into public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, diff)
  values (
    auth.uid(),
    coalesce(actor.name, actor.email, 'system'),
    audit_action,
    audit_entity_type,
    audit_entity_id,
    coalesce(audit_diff, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.write_audit_log(text, text, uuid, jsonb) from public;
grant execute on function public.write_audit_log(text, text, uuid, jsonb) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('billboard-media', 'billboard-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('event-posters', 'event-posters', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('team-photos', 'team-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Super admins manage all storage objects" on storage.objects;
create policy "Super admins manage all storage objects"
on storage.objects for all
to authenticated
using (
  bucket_id in ('billboard-media', 'event-posters', 'team-photos')
  and public.is_super_admin()
)
with check (
  bucket_id in ('billboard-media', 'event-posters', 'team-photos')
  and public.is_super_admin()
);

drop policy if exists "Club admins upload own billboard media" on storage.objects;
create policy "Club admins upload own billboard media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'billboard-media'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
);

drop policy if exists "Club admins update own billboard media" on storage.objects;
create policy "Club admins update own billboard media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'billboard-media'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
)
with check (
  bucket_id = 'billboard-media'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
);

drop policy if exists "Club admins upload own event posters" on storage.objects;
create policy "Club admins upload own event posters"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'event-posters'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
);

drop policy if exists "Club admins update own event posters" on storage.objects;
create policy "Club admins update own event posters"
on storage.objects for update
to authenticated
using (
  bucket_id = 'event-posters'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
)
with check (
  bucket_id = 'event-posters'
  and (storage.foldername(name))[1] = public.current_user_club_id()::text
);

drop policy if exists "Public reads team photos" on storage.objects;
create policy "Public reads team photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'team-photos');

alter publication supabase_realtime add table public.crash_logs;

-- Techi production control-system additions.
-- Safe to apply after 001_initial_schema.sql. This migration extends the platform
-- for three roles, approvals, soft deletion, notifications, backup tracking,
-- operational event lifecycle, and richer audit/error metadata.

alter type public.app_role add value if not exists 'event_ops';
alter type public.approval_status add value if not exists 'draft';
alter type public.approval_status add value if not exists 'clarification_requested';

do $$
begin
  create type public.event_lifecycle_status as enum (
    'draft',
    'pending_approval',
    'approved',
    'ready',
    'live',
    'completed',
    'archived'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.approval_risk as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.backup_status as enum ('pending', 'running', 'success', 'failed', 'not_configured');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_severity as enum ('info', 'success', 'warning', 'critical');
exception when duplicate_object then null;
end $$;

alter table public.clubs
  add column if not exists short_name text,
  add column if not exists description text,
  add column if not exists accent text,
  add column if not exists social text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_approval_id uuid;

alter table public.billboards
  add column if not exists title text,
  add column if not exists display_order integer not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_approval_id uuid;

alter table public.events
  add column if not exists lifecycle_status public.event_lifecycle_status not null default 'draft',
  add column if not exists category text,
  add column if not exists venue text,
  add column if not exists registration_url text,
  add column if not exists readiness_notes text,
  add column if not exists operational_status text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_approval_id uuid;

alter table public.team_members
  add column if not exists group_name text,
  add column if not exists initials text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_approval_id uuid;

alter table public.crash_logs
  add column if not exists environment text,
  add column if not exists route text,
  add column if not exists http_status integer,
  add column if not exists stack_trace text,
  add column if not exists frequency integer not null default 1,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists request_id text,
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

alter table public.audit_logs
  add column if not exists actor_role public.app_role,
  add column if not exists previous_value jsonb not null default '{}'::jsonb,
  add column if not exists new_value jsonb not null default '{}'::jsonb,
  add column if not exists approval_status public.approval_status,
  add column if not exists ip_address text,
  add column if not exists user_agent text,
  add column if not exists request_id text,
  add column if not exists result text not null default 'success',
  add column if not exists failure_reason text;

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  requester_name text not null,
  requester_role public.app_role not null,
  resource_type text not null,
  resource_id uuid,
  action text not null,
  risk public.approval_risk not null default 'medium',
  status public.approval_status not null default 'pending',
  reason text,
  previous_value jsonb not null default '{}'::jsonb,
  proposed_value jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_review check (reviewed_by is null or reviewed_by is distinct from requested_by)
);

create index if not exists approval_requests_status_idx on public.approval_requests (status, created_at desc);
create index if not exists approval_requests_resource_idx on public.approval_requests (resource_type, resource_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  role_target public.app_role,
  title text not null,
  body text not null,
  severity public.notification_severity not null default 'info',
  related_resource_type text,
  related_resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);
create index if not exists notifications_role_idx on public.notifications (role_target, read_at, created_at desc);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null,
  status public.backup_status not null default 'pending',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  size_bytes bigint,
  storage_location text,
  failure_reason text,
  manifest jsonb not null default '{}'::jsonb,
  triggered_by uuid references auth.users(id) on delete set null
);

create index if not exists backup_runs_started_at_idx on public.backup_runs (started_at desc);

drop trigger if exists approval_requests_touch_updated_at on public.approval_requests;
create trigger approval_requests_touch_updated_at
before update on public.approval_requests
for each row execute function public.touch_updated_at();

create or replace function public.has_role(check_role public.app_role)
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
      and role = check_role
      and status = 'active'
  )
$$;

create or replace function public.is_event_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('event_ops')
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit logs are append-only';
end;
$$;

drop trigger if exists audit_logs_prevent_update on public.audit_logs;
create trigger audit_logs_prevent_update
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

alter table public.approval_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.backup_runs enable row level security;

drop policy if exists "Super admins review all approval requests" on public.approval_requests;
create policy "Super admins review all approval requests"
on public.approval_requests for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Admins read own approval requests" on public.approval_requests;
create policy "Admins read own approval requests"
on public.approval_requests for select
to authenticated
using (requested_by = auth.uid() or public.is_super_admin());

drop policy if exists "Admins create own approval requests" on public.approval_requests;
create policy "Admins create own approval requests"
on public.approval_requests for insert
to authenticated
with check (requested_by = auth.uid() and status = 'pending');

drop policy if exists "Users read addressed notifications" on public.notifications;
create policy "Users read addressed notifications"
on public.notifications for select
to authenticated
using (
  recipient_id = auth.uid()
  or role_target in (select role from public.users where id = auth.uid() and status = 'active')
  or public.is_super_admin()
);

drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read"
on public.notifications for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists "Super admins manage notifications" on public.notifications;
create policy "Super admins manage notifications"
on public.notifications for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Super admins read backup runs" on public.backup_runs;
create policy "Super admins read backup runs"
on public.backup_runs for select
to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins create backup runs" on public.backup_runs;
create policy "Super admins create backup runs"
on public.backup_runs for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "Event ops read all events" on public.events;
create policy "Event ops read all events"
on public.events for select
to authenticated
using (public.is_event_ops());

drop policy if exists "Event ops update operational event fields" on public.events;
create policy "Event ops update operational event fields"
on public.events for update
to authenticated
using (public.is_event_ops() and deleted_at is null)
with check (public.is_event_ops() and deleted_at is null);

alter publication supabase_realtime add table public.approval_requests;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.backup_runs;

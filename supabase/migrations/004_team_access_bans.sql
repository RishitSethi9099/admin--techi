-- Team Access hardening: fixed login IDs and ban controls.

alter table public.users
  add column if not exists login_id text unique,
  add column if not exists id_banned boolean not null default false,
  add column if not exists ip_banned boolean not null default false,
  add column if not exists banned_ip text,
  add column if not exists ban_reason text,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by uuid references auth.users(id) on delete set null;

create index if not exists users_login_id_idx on public.users (login_id);
create index if not exists users_ban_state_idx on public.users (id_banned, ip_banned);

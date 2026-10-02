-- Major-event screen rotation (website video screens V01-V10).
-- One settings row: the club order across the screens, and whether it is rolling.
-- Which club is on which screen at any moment is worked out from this row by
-- lib/screen-rotation.ts (admin panel and /api/screens), so no scheduled job is needed.

create table if not exists public.major_screen_rotation (
  id boolean primary key default true,
  slot_order uuid[] not null default '{}',
  rolling boolean not null default false,
  direction text not null default 'up',
  interval_minutes integer not null default 60,
  started_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint major_screen_rotation_single_row check (id),
  constraint major_screen_rotation_direction check (direction in ('up', 'down')),
  constraint major_screen_rotation_interval check (interval_minutes between 5 and 1440),
  constraint major_screen_rotation_started check (not rolling or started_at is not null)
);

alter table public.major_screen_rotation enable row level security;

drop policy if exists "Super admins manage screen rotation" on public.major_screen_rotation;
create policy "Super admins manage screen rotation"
on public.major_screen_rotation for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop trigger if exists major_screen_rotation_touch_updated_at on public.major_screen_rotation;
create trigger major_screen_rotation_touch_updated_at
before update on public.major_screen_rotation
for each row execute function public.touch_updated_at();

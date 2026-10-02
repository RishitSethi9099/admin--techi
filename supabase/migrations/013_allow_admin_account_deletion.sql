-- Let Super Admins delete admin accounts (Team Access → Delete).
-- Deleting an account makes Postgres clear that person's id from old rows
-- (audit_logs.actor_id, billboards.approved_by, ...: "on delete set null").
-- Two guards blocked that automatic clean-up; each now allows exactly that one
-- change and nothing else. Audit entries keep their text and actor_name.

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  -- only the automatic "actor account was deleted" update: actor_id -> null, every other column unchanged
  if tg_op = 'UPDATE'
    and old.actor_id is not null
    and new.actor_id is null
    and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id')
  then
    return new;
  end if;
  raise exception 'Audit logs are append-only';
end;
$$;

create or replace function public.prevent_club_admin_approval_changes()
returns trigger
language plpgsql
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  -- automatic clean-up when the approving admin's account is deleted (never a signed-in user)
  if tg_op = 'UPDATE'
    and current_user not in ('authenticated', 'anon')
    and old.approved_by is not null
    and new.approved_by is null
    and new.status is not distinct from old.status
    and new.approved_at is not distinct from old.approved_at
    and new.rejection_reason is not distinct from old.rejection_reason
  then
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

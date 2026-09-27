-- Populate richer audit metadata columns added in migration 002.

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
  select name, email, role
  into actor
  from public.users
  where id = auth.uid();

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    diff,
    previous_value,
    new_value,
    approval_status,
    ip_address,
    user_agent,
    request_id,
    result,
    failure_reason
  )
  values (
    auth.uid(),
    coalesce(actor.name, actor.email, 'system'),
    actor.role,
    audit_action,
    audit_entity_type,
    audit_entity_id,
    coalesce(audit_diff, '{}'::jsonb),
    coalesce(audit_diff -> 'previous_value', '{}'::jsonb),
    coalesce(audit_diff -> 'new_value', '{}'::jsonb),
    nullif(audit_diff ->> 'approval_status', '')::public.approval_status,
    nullif(audit_diff ->> 'ip_address', ''),
    nullif(audit_diff ->> 'user_agent', ''),
    nullif(audit_diff ->> 'request_id', ''),
    coalesce(nullif(audit_diff ->> 'result', ''), 'success'),
    nullif(audit_diff ->> 'failure_reason', '')
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.write_audit_log(text, text, uuid, jsonb) from public;
grant execute on function public.write_audit_log(text, text, uuid, jsonb) to authenticated, service_role;

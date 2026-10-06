"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function writeAuditLog(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  result?: "success" | "failure";
  failureReason?: string | null;
}) {
  // The log is written with the service key (so nobody can edit it), which means the database
  // can't see who is signed in. Record the signed-in admin here instead; scheduled jobs and
  // webhooks have nobody signed in and show as "system".
  const actor = await getCurrentProfile().catch(() => null);
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actor?.id ?? null,
    actor_name: actor?.name || actor?.email || "system",
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    actor_role: actor?.role ?? null,
    diff: {
      ...(input.diff ?? {}),
      previous_value: input.previousValue ?? {},
      new_value: input.newValue ?? {},
      result: input.result ?? "success",
      failure_reason: input.failureReason ?? null
    },
    previous_value: input.previousValue ?? {},
    new_value: input.newValue ?? {},
    result: input.result ?? "success",
    failure_reason: input.failureReason ?? null
  });
  if (error) console.error("[audit] could not write audit log", error.message);
}

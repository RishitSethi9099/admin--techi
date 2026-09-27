"use server";

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
  const supabase = createServiceRoleClient();
  await supabase.rpc("write_audit_log", {
    audit_action: input.action,
    audit_entity_type: input.entityType,
    audit_entity_id: input.entityId ?? null,
    audit_diff: {
      ...(input.diff ?? {}),
      previous_value: input.previousValue ?? {},
      new_value: input.newValue ?? {},
      result: input.result ?? "success",
      failure_reason: input.failureReason ?? null
    }
  });
}

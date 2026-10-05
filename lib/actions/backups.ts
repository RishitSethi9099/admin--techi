"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { runBackup, type BackupOutcome } from "@/lib/backup";

/** "Back up now" on the Backups page (Super Admin only). */
export async function runManualBackup(): Promise<BackupOutcome> {
  const profile = await requireSuperAdmin();
  await requirePermission("backups:trigger");
  if (!hasSupabaseEnv()) return { ok: false, changed: false, message: "Supabase is not connected." };
  const result = await runBackup({ type: "manual", triggeredBy: profile.id });
  await writeAuditLog({
    action: "backup.manual",
    entityType: "backup_run",
    result: result.ok ? "success" : "failure",
    failureReason: result.ok ? null : result.message,
    diff: { changed: result.changed, commit: result.commitUrl ?? null }
  }).catch(() => undefined);
  revalidatePath("/backups");
  return result;
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function recordBackupNotConfigured() {
  const profile = await requireSuperAdmin();
  await requirePermission("backups:trigger");

  if (!hasSupabaseEnv()) {
    revalidatePath("/backups");
    return;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("backup_runs")
    .insert({
      backup_type: "manual",
      status: "not_configured",
      completed_at: new Date().toISOString(),
      failure_reason: "Backup executor is not connected yet. Configure the GitHub backup repo and private storage bucket before enabling runs.",
      manifest: { github_repo: "RishitSethi9099/backup-repo-", media_storage: "not_configured" },
      triggered_by: profile.id
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "backup.not_configured", entityType: "backup_run", entityId: data.id });
  revalidatePath("/backups");
}

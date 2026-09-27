import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { recordBackupNotConfigured } from "@/lib/actions/backups";
import { requirePermission } from "@/lib/auth";
import { getBackupRuns } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function BackupsPage() {
  await requirePermission("backups:read");
  const backups = await getBackupRuns();
  return (
    <>
      <ConnectionBanner />
      <PageTitle
        title="Backups"
        subtitle="Backup status, history, manifests, and safe execution tracking"
        action={
          <form action={recordBackupNotConfigured}>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Check backup configuration</button>
          </form>
        }
      />
      {!backups.length ? <EmptyState title="No backup runs recorded" description="Backup execution is not configured yet. This section is ready to track GitHub and storage backup runs once connected." /> : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {backups.map((backup) => (
              <div key={backup.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_130px_180px_150px] lg:items-center">
                <div>
                  <div className="font-semibold">{backup.backup_type}</div>
                  <div className="text-sm text-muted">{backup.storage_location ?? backup.failure_reason ?? "No storage location"}</div>
                </div>
                <StatusBadge status={backup.status} />
                <div className="text-sm text-muted">{formatDateTime(backup.started_at)}</div>
                <div className="text-sm text-muted">{backup.size_bytes ? `${Math.round(backup.size_bytes / 1024)} KB` : "Size unavailable"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

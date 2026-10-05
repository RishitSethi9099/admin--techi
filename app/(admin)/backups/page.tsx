import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { BackupNowButton } from "@/components/admin/backup-now-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { backupConfig } from "@/lib/backup";
import { getBackupRuns } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

function rowsSaved(manifest: Record<string, unknown>) {
  const rows = manifest?.rows as Record<string, unknown> | undefined;
  if (!rows) return null;
  return Object.values(rows).reduce<number>((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
}

export default async function BackupsPage() {
  const profile = await requirePermission("backups:read");
  const backups = await getBackupRuns();
  const config = backupConfig();
  const lastGood = backups.find((b) => b.status === "success");
  const missing = [
    !process.env.GITHUB_BACKUP_TOKEN && "GITHUB_BACKUP_TOKEN",
    !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    !process.env.BACKUP_CRON_SECRET && "BACKUP_CRON_SECRET (needed for the 30-minute schedule)"
  ].filter(Boolean) as string[];

  return (
    <>
      <ConnectionBanner />
      <PageTitle
        title="Backups"
        subtitle="The database is copied to GitHub every 30 minutes, and whenever you press Back up now"
        action={profile.role === "super_admin" ? <BackupNowButton disabled={!config.ready} /> : undefined}
      />

      <Card className="mb-4 grid gap-3 p-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Saved to</div>
            <a href={`https://github.com/${config.repo}`} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">{config.repo}</a>
            <span className="text-muted"> · backup/ folder</span>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Last successful backup</div>
            <div className="font-semibold">{lastGood ? formatDateTime(lastGood.completed_at ?? lastGood.started_at) : "None yet"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Schedule</div>
            <div className="font-semibold">Every 30 minutes</div>
          </div>
        </div>
        <div className="text-muted">
          <b className="text-foreground">Saved:</b> clubs, admin accounts, club events, event schedules, billboards, approvals, screen rotation, team, notifications, audit log, error log, and a list of every poster/video file.{" "}
          <b className="text-foreground">Not saved:</b> the poster/video files themselves (they stay in Supabase storage), passwords, and secret keys.
        </div>
        {missing.length ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            Not set up yet. Add these in Vercel → Settings → Environment Variables, then redeploy: <b>{missing.join(", ")}</b>.
          </div>
        ) : null}
      </Card>

      {!backups.length ? <EmptyState title="No backups yet" description="The first one appears here after the schedule runs or you press Back up now." /> : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {backups.map((backup) => {
              const changed = (backup.manifest as { changed?: boolean })?.changed;
              const rows = rowsSaved(backup.manifest);
              return (
                <div key={backup.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_130px_180px_150px] lg:items-center">
                  <div className="min-w-0">
                    <div className="font-semibold capitalize">{backup.backup_type} backup</div>
                    <div className="text-sm text-muted">
                      {backup.status === "failed" || backup.status === "not_configured"
                        ? backup.failure_reason
                        : backup.status === "running"
                          ? "Running…"
                          : changed === false
                            ? "No changes since the last backup"
                            : `${rows ?? "?"} rows saved`}
                      {backup.storage_location ? (
                        <> · <a href={backup.storage_location} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">View on GitHub</a></>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={backup.status} />
                  <div className="text-sm text-muted">{formatDateTime(backup.started_at)}</div>
                  <div className="text-sm text-muted">{backup.size_bytes ? `${Math.max(1, Math.round(backup.size_bytes / 1024))} KB` : "—"}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

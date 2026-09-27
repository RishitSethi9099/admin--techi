import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { getCrashLogs } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function ErrorsPage() {
  await requirePermission("errors:read");
  const errors = await getCrashLogs();
  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Errors / Incidents" subtitle="Application, API, auth, database, integration, and webhook failures" />
      {!errors.length ? <EmptyState title="No error records" description="No real error events have been captured. Connect Supabase/webhooks to populate this section." /> : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {errors.map((error) => (
              <div key={error.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_130px_170px_100px] lg:items-center">
                <div>
                  <div className="font-semibold">{error.message}</div>
                  <div className="text-sm text-muted">{error.source} · {error.route ?? error.page_url ?? "unknown route"}</div>
                </div>
                <StatusBadge status={error.severity} />
                <div className="text-sm text-muted">{formatDateTime(error.last_seen_at ?? error.created_at)}</div>
                <div className="text-sm text-muted">x{error.frequency ?? 1}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

import { ConnectionBanner } from "@/components/admin/connection-banner";
import { MetricCard } from "@/components/admin/metric-card";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { backendConnectionStatus, getCrashLogs } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function SystemHealthPage() {
  await requirePermission("health:read");
  const logs = await getCrashLogs();
  const connected = backendConnectionStatus() === "connected";
  const open = logs.filter((log) => !log.resolved);

  return (
    <>
      <ConnectionBanner />
      <PageTitle title="System Health" subtitle="Real monitored status only; unavailable metrics are marked not monitored" />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Application" value="Operational" note="Admin app rendered successfully" />
        <MetricCard label="Database" value={connected ? "Connected" : "Not monitored"} />
        <MetricCard label="Authentication" value={connected ? "Supabase configured" : "Not monitored"} />
        <MetricCard label="Open incidents" value={open.length} />
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Recent incidents</div>
        {!logs.length ? (
          <div className="p-4"><EmptyState title="No incident records" description="No real monitoring events have been captured yet." /></div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_130px_180px] md:items-center">
                <div>
                  <div className="font-medium">{log.message}</div>
                  <div className="text-muted">{log.source} · {log.route ?? log.page_url ?? "unknown route"}</div>
                </div>
                <StatusBadge status={log.severity} />
                <div className="text-muted">{formatDateTime(log.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

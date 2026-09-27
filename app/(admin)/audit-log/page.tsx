import { ScrollText } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";
import { getAuditLogs } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function AuditLogPage() {
  await requireSuperAdmin();
  const logs = await getAuditLogs();

  return (
    <>
      <PageTitle title="Audit Log" subtitle="Every important mutation written by server actions" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {logs.length ? logs.map((log) => (
            <div key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[40px_1fr_140px_180px] lg:items-center">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <ScrollText className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">{log.actor_name}</div>
                <div className="text-sm text-muted">{log.entity_type} · {log.entity_id ?? "no entity id"}</div>
              </div>
              <Badge tone="purple">{log.action}</Badge>
              <div className="text-sm text-muted">{formatDateTime(log.created_at)}</div>
            </div>
          )) : <div className="px-5 py-10 text-center text-sm text-muted">No audit entries yet.</div>}
        </div>
      </Card>
    </>
  );
}

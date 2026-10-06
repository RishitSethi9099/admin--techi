import { ScrollText } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";
import { getAdmins, getApprovalRequests, getAuditLogs } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  "approval_request.create": "Submitted for approval",
  "approval_request.approved": "Approved",
  "approval_request.rejected": "Rejected",
  "approval_request.clarification_requested": "Asked for clarification",
  "backup.manual": "Ran a manual backup"
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default async function AuditLogPage() {
  await requireSuperAdmin();
  const [logs, approvals, admins] = await Promise.all([getAuditLogs(), getApprovalRequests(), getAdmins()]);
  const nameOf = (id: string | null | undefined) => {
    const admin = admins.find((a) => a.id === id);
    return admin ? admin.name || admin.email : null;
  };

  // Older entries were saved as "system". For approval requests the request itself remembers
  // who submitted it and who reviewed it, so show that person instead.
  const actorOf = (log: (typeof logs)[number]) => {
    if (log.actor_name && log.actor_name !== "system") return { name: log.actor_name, recovered: false };
    if (log.entity_type === "approval_request" && log.entity_id) {
      const request = approvals.find((r) => r.id === log.entity_id);
      if (request) {
        const name = log.action === "approval_request.create" ? request.requester_name || nameOf(request.requested_by) : nameOf(request.reviewed_by);
        if (name) return { name, recovered: true };
      }
    }
    return { name: "system", recovered: false };
  };

  return (
    <>
      <PageTitle title="Audit Log" subtitle="Who did what, and when" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {logs.length ? logs.map((log) => {
            const actor = actorOf(log);
            const request = log.entity_type === "approval_request" ? approvals.find((r) => r.id === log.entity_id) : null;
            return (
              <div key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,240px)_170px] lg:items-center">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <ScrollText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">
                    {actor.name}
                    {actor.recovered ? <span className="ml-2 text-xs font-normal text-muted">(from the approval record)</span> : null}
                  </div>
                  <div className="truncate text-sm text-muted" title={log.entity_id ?? undefined}>
                    {request
                      ? `${request.resource_type === "billboard" ? "Billboard submission" : request.resource_type} by ${request.requester_name}`
                      : `${log.entity_type.replace(/_/g, " ")}${log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}`}
                  </div>
                </div>
                <span className="w-fit max-w-full break-words rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary" title={log.action}>
                  {actionLabel(log.action)}
                </span>
                <div className="text-sm text-muted">{formatDateTime(log.created_at)}</div>
              </div>
            );
          }) : <div className="px-5 py-10 text-center text-sm text-muted">No audit entries yet.</div>}
        </div>
      </Card>
    </>
  );
}

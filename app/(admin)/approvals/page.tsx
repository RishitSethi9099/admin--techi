import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { createApprovalRequest, reviewApprovalRequest } from "@/lib/actions/approvals";
import { requireProfile } from "@/lib/auth";
import { getApprovalRequests } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function ApprovalsPage() {
  const profile = await requireProfile();
  const requests = await getApprovalRequests();
  const visible = profile.role === "super_admin" ? requests : requests.filter((request) => request.requested_by === profile.id);

  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Approvals" subtitle="Controlled workflow for sensitive changes and delete requests" />
      {profile.role !== "super_admin" ? (
        <Card className="mb-5 p-4">
          <form action={createApprovalRequest} className="grid gap-3 lg:grid-cols-[150px_150px_130px_1fr_auto]">
            <input name="resource_type" placeholder="event / club" required className="h-10 rounded-lg border border-border px-3 text-sm" />
            <input name="action" placeholder="change / delete" required className="h-10 rounded-lg border border-border px-3 text-sm" />
            <select name="risk" className="h-10 rounded-lg border border-border px-3 text-sm">
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
              <option value="critical">Critical risk</option>
              <option value="low">Low risk</option>
            </select>
            <input name="reason" placeholder="Reason for request" required className="h-10 rounded-lg border border-border px-3 text-sm" />
            <button className="rounded-lg bg-primary px-4 text-sm font-semibold text-white">Submit request</button>
            <textarea name="proposed_value" required placeholder='Proposed JSON, e.g. {"venue":"Auditorium"}' className="min-h-24 rounded-lg border border-border px-3 py-2 text-sm lg:col-span-5" />
          </form>
        </Card>
      ) : null}
      {!visible.length ? (
        <EmptyState title="No approval requests" description="Approval requests will appear here when admins submit protected changes." />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {visible.map((request) => (
              <div key={request.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[1fr_130px_140px_180px_260px] xl:items-center">
                <div>
                  <div className="font-semibold">{request.action} {request.resource_type}</div>
                  <div className="text-sm text-muted">{request.requester_name} · {request.requester_role.replace("_", " ")}</div>
                  <div className="mt-1 text-xs text-muted">{request.reason ?? "No reason provided"}</div>
                </div>
                <StatusBadge status={request.risk} />
                <StatusBadge status={request.status} />
                <div className="text-sm text-muted">{formatDateTime(request.created_at)}</div>
                {profile.role === "super_admin" && request.status === "pending" ? (
                  <form action={reviewApprovalRequest} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={request.id} />
                    <button name="status" value="approved" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white">Approve</button>
                    <button name="status" value="rejected" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Reject</button>
                    <button name="status" value="clarification_requested" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Clarify</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

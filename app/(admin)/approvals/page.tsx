import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { createApprovalRequest, reviewApprovalRequest } from "@/lib/actions/approvals";
import { ApprovalRevertButton } from "@/components/admin/approval-revert-button";
import { requireProfile } from "@/lib/auth";
import { getAdmins, getApprovalRequests, getClubs } from "@/lib/data";
import type { ApprovalRequest, Club } from "@/lib/supabase/types";
import { formatDateTime } from "@/lib/utils";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What the club actually sent: the poster/video, club, event and their note. */
function Submission({ request, clubs }: { request: ApprovalRequest; clubs: Club[] }) {
  const v = request.proposed_value ?? {};
  const media = text(v.media_url);
  const type = text(v.type);
  const isVideo = type === "video" || (media ? /\.(mp4|webm|mov)(\?|$)/i.test(media) : false);
  const club = clubs.find((c) => c.id === v.club_id);
  const event = text(v.event_name) ?? text(v.title);
  const tier = text(v.event_tier);
  const about = text(v.about_club);

  if (request.resource_type !== "billboard") {
    const entries = Object.entries(v).filter(([, value]) => value !== null && value !== "");
    if (!entries.length) return null;
    return (
      <dl className="mt-3 grid gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[160px_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-medium text-muted">{key.replaceAll("_", " ")}</dt>
            <dd className="break-words">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="mt-3 grid gap-4 rounded-xl border border-border bg-slate-50 p-3 sm:grid-cols-[minmax(0,280px)_1fr]">
      <div className="overflow-hidden rounded-lg bg-slate-900">
        {!media ? (
          <div className="grid h-40 place-items-center text-sm text-slate-300">No file attached</div>
        ) : isVideo ? (
          <video src={media} controls muted loop playsInline preload="metadata" className="max-h-64 w-full bg-black" />
        ) : (
          <a href={media} target="_blank" rel="noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media} alt={`${event ?? "Poster"} submitted by ${club?.name ?? "club"}`} className="max-h-64 w-full object-contain" />
          </a>
        )}
      </div>
      <div className="grid content-start gap-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {tier ? (
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${tier === "major" ? "bg-primary text-white" : "bg-slate-200 text-slate-700"}`}>{tier}</span>
          ) : null}
          <span className="font-semibold">{event ?? "Promotion"}</span>
          <span className="text-muted">· {isVideo ? "video" : "poster"}</span>
        </div>
        <div><span className="text-muted">Club:</span> {club?.name ?? "Unknown club"}</div>
        {about ? <p className="whitespace-pre-line text-foreground">{about}</p> : <p className="text-muted">No description given.</p>}
        {media ? (
          <a href={media} target="_blank" rel="noreferrer" className="w-fit font-semibold text-primary underline underline-offset-2">
            Open {isVideo ? "video" : "poster"} in a new tab
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const profile = await requireProfile();
  const [requests, clubs, admins] = await Promise.all([
    getApprovalRequests(),
    getClubs(),
    profile.role === "super_admin" ? getAdmins() : Promise.resolve([])
  ]);
  const reviewerName = (id: string | null) => {
    const admin = admins.find((a) => a.id === id);
    return admin ? admin.name || admin.email : id ? "a Super Admin" : null;
  };
  const STATUS_WORD: Record<string, string> = { approved: "Approved", rejected: "Rejected", clarification_requested: "Clarification asked" };
  const visible = profile.role === "super_admin" ? requests : requests.filter((request) => request.requested_by === profile.id);

  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Approvals" subtitle="Controlled workflow for sensitive changes and delete requests" />
      {searchParams?.error ? (
        <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <b>That didn&apos;t go through.</b> {searchParams.error}
        </div>
      ) : null}
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
              <div key={request.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[1fr_130px_140px_180px_260px] xl:items-start">
                <div>
                  <div className="font-semibold">
                    {request.resource_type === "billboard" && request.action === "promotion_submission" ? "Billboard submission" : `${request.action.replaceAll("_", " ")} · ${request.resource_type}`}
                  </div>
                  <div className="text-sm text-muted">{request.requester_name} · {request.requester_role.replace("_", " ")}</div>
                  <div className="mt-1 text-xs text-muted">{request.reason ?? "No reason provided"}</div>
                  {request.reviewed_at && STATUS_WORD[request.status] ? (
                    <div className="mt-2 text-sm">
                      <b>{STATUS_WORD[request.status]}</b>
                      {reviewerName(request.reviewed_by) ? <> by <b>{reviewerName(request.reviewed_by)}</b></> : null}
                      <span className="text-muted"> · {formatDateTime(request.reviewed_at)}</span>
                      {request.review_note ? <div className="text-muted">Note: {request.review_note}</div> : null}
                    </div>
                  ) : null}
                  <Submission request={request} clubs={clubs} />
                </div>
                <StatusBadge status={request.risk} />
                <StatusBadge status={request.status} />
                <div className="text-sm text-muted">{formatDateTime(request.created_at)}</div>
                {profile.role === "super_admin" ? (
                  <div className="grid gap-2">
                    {/* still open: decide (also after asking for clarification) */}
                    {request.status === "pending" || request.status === "clarification_requested" ? (
                      <form action={reviewApprovalRequest} className="flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={request.id} />
                        <button name="status" value="approved" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white">Approve</button>
                        <button name="status" value="rejected" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Reject</button>
                        {request.status === "pending" ? (
                          <button name="status" value="clarification_requested" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Clarify</button>
                        ) : null}
                      </form>
                    ) : null}
                    {/* a decision clicked by mistake can be undone */}
                    {request.status !== "pending" ? <ApprovalRevertButton id={request.id} status={request.status} /> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

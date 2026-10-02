import { ConnectionBanner } from "@/components/admin/connection-banner";
import { MetricCard } from "@/components/admin/metric-card";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getAdmins, getApprovalRequests, getAuditLogs, getBillboards, getClubs, getCrashLogs, getEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const [clubs, events, billboards, approvals, admins, errors, auditLogs] = await Promise.all([
    getClubs(),
    getEvents(),
    getBillboards(),
    getApprovalRequests(),
    getAdmins(),
    getCrashLogs(),
    getAuditLogs()
  ]);

  if (profile.role === "club_admin") {
    const clubEvents = events.filter((event) => event.club_id === profile.club_id);
    const clubBillboards = billboards.filter((billboard) => billboard.club_id === profile.club_id);
    const ownApprovals = approvals.filter((approval) => approval.requested_by === profile.id);
    return (
      <>
        <ConnectionBanner />
        <PageTitle title="Club Dashboard" subtitle="Your club submissions, events, promotions, and approval status" />
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="My events" value={clubEvents.length} />
          <MetricCard label="Promotions" value={clubBillboards.length} />
          <MetricCard label="Pending approvals" value={ownApprovals.filter((item) => item.status === "pending").length} />
          <MetricCard label="Scope" value="Club only" note="Server-side enforced" />
        </div>
        <Section title="My approval requests" empty="No approval requests submitted yet." items={ownApprovals.map((item) => ({
          id: item.id,
          title: `${item.action} ${item.resource_type}`,
          meta: item.reason ?? "No reason provided",
          status: item.status,
          date: item.created_at
        }))} />
      </>
    );
  }

  if (profile.role === "event_ops") {
    const upcoming = events.filter((event) => new Date(event.start_datetime).getTime() >= Date.now());
    return (
      <>
        <ConnectionBanner />
        <PageTitle title="Event Operations Dashboard" subtitle="Schedules, readiness, venues, and operational attention" />
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Upcoming events" value={upcoming.length} />
          <MetricCard label="Ready" value={events.filter((event) => event.lifecycle_status === "ready").length} />
          <MetricCard label="Live" value={events.filter((event) => event.lifecycle_status === "live").length} />
          <MetricCard label="Completed" value={events.filter((event) => event.lifecycle_status === "completed").length} />
        </div>
        <Section title="Events requiring attention" empty="No event operations records are available yet." items={upcoming.map((event) => ({
          id: event.id,
          title: event.title,
          meta: `${event.venue ?? "Venue not set"} · ${formatDateTime(event.start_datetime)}`,
          status: event.lifecycle_status ?? event.status,
          date: event.start_datetime
        }))} />
      </>
    );
  }

  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const criticalErrors = errors.filter((error) => !error.resolved && ["critical", "fatal"].includes(error.severity));
  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Super Admin Dashboard" subtitle="Platform control, approvals, health, security, and auditability" />
      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Total clubs" value={clubs.length} />
        <MetricCard label="Active events" value={events.filter((event) => !event.deleted_at).length} />
        <MetricCard label="Pending approvals" value={pendingApprovals.length} />
        <MetricCard label="Promotions" value={billboards.length} />
        <MetricCard label="Active admins" value={admins.filter((admin) => admin.status === "active").length} />
        <MetricCard label="Open errors" value={errors.filter((error) => !error.resolved).length} />
        <MetricCard label="Critical issues" value={criticalErrors.length} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Section title="Pending approvals" empty="No pending approval requests." items={pendingApprovals.map((item) => ({
          id: item.id,
          title: `${item.action} ${item.resource_type}`,
          meta: `${item.requester_name} · ${item.requester_role.replace("_", " ")}`,
          status: item.risk,
          date: item.created_at
        }))} />
        <Section title="Critical errors" empty="No unresolved critical errors." items={criticalErrors.map((error) => ({
          id: error.id,
          title: error.message,
          meta: `${error.source} · ${error.route ?? error.page_url ?? "unknown route"}`,
          status: error.severity,
          date: error.created_at
        }))} />
      </div>
      <Section title="Recent administrative activity" empty="No audit records are available yet." items={auditLogs.slice(0, 8).map((log) => ({
        id: log.id,
        title: log.action,
        meta: `${log.actor_name} · ${log.entity_type}`,
        status: log.result ?? "success",
        date: log.created_at
      }))} />
    </>
  );
}

function Section({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string; status: string; date: string }>;
}) {
  if (!items.length) return <div className="mt-5"><EmptyState title={title} description={empty} /></div>;
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_150px_170px] md:items-center">
            <div>
              <div className="font-medium text-foreground">{item.title}</div>
              <div className="text-muted">{item.meta}</div>
            </div>
            <StatusBadge status={item.status} />
            <div className="text-muted">{formatDateTime(item.date)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

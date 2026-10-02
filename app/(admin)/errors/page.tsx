import Link from "next/link";
import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { getAssignedClubIds, getClubs, getCrashLogs } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import type { CrashLog } from "@/lib/supabase/types";
import { ErrorResolveButton } from "@/components/admin/error-resolve-button";

const RESOURCE_LABELS: Record<string, string> = {
  billboard: "Billboard",
  billboards: "Billboard",
  event: "Event video / schedule",
  events: "Event",
  schedule: "Schedule",
  venue: "Venue",
  screen_feed: "Website screens feed"
};

function describe(error: CrashLog) {
  const meta = error.metadata ?? {};
  const resource = typeof meta.resource_type === "string" ? RESOURCE_LABELS[meta.resource_type] ?? meta.resource_type : null;
  return [error.source, resource, error.route ?? error.page_url].filter(Boolean).join(" · ") || "unknown source";
}

export default async function ErrorsPage({ searchParams }: { searchParams?: { club?: string; scope?: string; status?: string } }) {
  const profile = await requirePermission("errors:read");
  const isSuper = profile.role === "super_admin";
  const clubFilter = isSuper && searchParams?.club ? searchParams.club : null;
  const scope = isSuper && (searchParams?.scope === "platform" || searchParams?.scope === "club") ? searchParams.scope : "all";
  const status = searchParams?.status === "fixed" || searchParams?.status === "all" ? searchParams.status : "open";
  const href = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = { club: clubFilter, scope: scope === "all" ? null : scope, status: status === "open" ? null : status, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `/errors?${query}` : "/errors";
  };

  const [errors, clubs, assignedClubIds] = await Promise.all([
    getCrashLogs({ clubId: clubFilter, scope, status }),
    getClubs(),
    profile.role === "event_ops" ? getAssignedClubIds(profile.id) : Promise.resolve([] as string[])
  ]);
  const myClubs =
    profile.role === "club_admin"
      ? clubs.filter((club) => club.id === profile.club_id)
      : profile.role === "event_ops"
        ? clubs.filter((club) => assignedClubIds.includes(club.id))
        : [];

  const subtitle = isSuper
    ? "Every problem reported by the website, Sentry and uptime checks. Each club also sees its own problems here. Nothing is emailed."
    : `Problems the website hit with ${myClubs.length === 1 ? `${myClubs[0].short_name ?? myClubs[0].name}'s` : "your clubs'"} billboards, videos, posters and events. Only your club's team and the Super Admin see these. When it's sorted, press Mark fixed.`;

  const chip = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:bg-slate-50"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Errors / Incidents" subtitle={subtitle} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip(href({ status: null }), "Open", status === "open")}
        {chip(href({ status: "fixed" }), "Fixed", status === "fixed")}
        {chip(href({ status: "all" }), "All", status === "all")}
      </div>

      {isSuper ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chip(href({ scope: null, club: null }), "Every club + platform", scope === "all" && !clubFilter)}
          {chip(href({ scope: "club", club: null }), "Club problems", scope === "club" && !clubFilter)}
          {chip(href({ scope: "platform", club: null }), "Platform / no club", scope === "platform")}
          <form action="/errors" className="ml-auto flex items-center gap-2">
            {status !== "open" ? <input type="hidden" name="status" value={status} /> : null}
            <select name="club" defaultValue={clubFilter ?? ""} className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
              <option value="">Filter by club…</option>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.short_name ?? club.name}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-white">Show</button>
          </form>
        </div>
      ) : myClubs.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {myClubs.map((club) => (
            <span key={club.id} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">{club.short_name ?? club.name}</span>
          ))}
        </div>
      ) : null}

      {!errors.length ? (
        <EmptyState
          title={status === "fixed" ? "Nothing marked fixed yet" : isSuper ? "No open errors" : "No open problems"}
          description={
            status === "fixed"
              ? "Errors you mark as fixed are kept here."
              : isSuper
                ? "Nothing open for this filter. Website errors appear here within seconds of happening."
                : "The website hasn't reported any open problems with your club's billboards or events. If something breaks, it shows up here and a red count appears next to Errors."
          }
        />
      ) : (
        <>
          <p className="mb-2 px-1 text-sm text-muted">{errors.length} {status === "open" ? "open" : status === "fixed" ? "fixed" : "total"}{errors.length === 100 ? " (latest 100)" : ""}</p>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {errors.map((error) => (
                <div key={error.id} className={`grid gap-3 px-4 py-4 lg:grid-cols-[1fr_140px_110px_190px_130px] lg:items-center ${error.resolved ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{error.message}</div>
                    <div className="truncate text-sm text-muted">{describe(error)}</div>
                  </div>
                  <div className="text-sm">
                    {error.clubs ? (
                      <span className="rounded-full bg-primary-soft px-2.5 py-1 font-medium text-primary">{error.clubs.short_name ?? error.clubs.name}</span>
                    ) : (
                      <span className="text-muted">No club</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={error.resolved ? "resolved" : error.severity} />
                  </div>
                  <div className="text-sm text-muted">
                    <div>Last: {formatDateTime(error.last_seen_at ?? error.created_at)}</div>
                    <div>{(error.frequency ?? 1) > 1 ? `Seen ${error.frequency}× since ${formatDateTime(error.first_seen_at ?? error.created_at)}` : "Seen once"}</div>
                  </div>
                  {isSuper || error.club_id ? <ErrorResolveButton id={error.id} resolved={error.resolved} /> : <span />}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

import { CalendarDays, Pencil } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getAssignedClubIds, getClubs, getEvents } from "@/lib/data";
import { DeleteEventButton, EventForm } from "@/components/admin/event-form";
import { formatEventRange } from "@/lib/event-time";

export default async function EventsPage() {
  const profile = await requireProfile();
  const [events, clubs, assignedClubIds] = await Promise.all([getEvents(), getClubs(), profile.role === "event_ops" ? getAssignedClubIds(profile.id) : Promise.resolve([])]);
  const visibleClubs =
    profile.role === "super_admin"
      ? clubs
      : profile.role === "event_ops"
        ? clubs.filter((club) => assignedClubIds.includes(club.id))
        : clubs.filter((club) => club.id === profile.club_id);
  const assignedClub = visibleClubs[0] ?? null;
  const visibleEvents =
    profile.role === "super_admin"
      ? events
      : profile.role === "event_ops"
        ? events.filter((event) => assignedClubIds.includes(event.club_id))
        : events.filter((event) => event.club_id === profile.club_id);
  const canChooseClub = profile.role === "super_admin" || profile.role === "event_ops";

  return (
    <>
      <PageTitle title="Events" subtitle="Create, edit, publish, and remove the public TECHIDEATE schedule timeline." />
      <Card className="mb-5 p-5">
        {profile.role === "club_admin" && assignedClub ? (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Your club</div>
            <div className="text-lg font-semibold text-foreground">{assignedClub.name}</div>
          </div>
        ) : null}
        {profile.role === "event_ops" && visibleClubs.length ? (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Assigned clubs</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {visibleClubs.map((club) => (
                <span key={club.id} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-foreground">
                  {club.short_name ?? club.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {!assignedClub && profile.role !== "super_admin" ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No club is assigned to this admin yet. Ask the Super Admin to assign a club in Team Access.
          </div>
        ) : (
          <EventForm visibleClubs={visibleClubs} canChooseClub={canChooseClub} assignedClub={assignedClub} />
        )}
      </Card>

      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold">{profile.role === "club_admin" ? "Your club's events" : "Events"}</h2>
        <span className="text-sm text-muted">{visibleEvents.length} total · {visibleEvents.filter((event) => event.status === "published").length} published</span>
      </div>
      <Card className="overflow-hidden">
        {!visibleEvents.length ? (
          <div className="p-6 text-sm text-muted">No events have been created yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {visibleEvents.map((event) => (
              <details key={event.id} id={`event-${event.id}`} className="group scroll-mt-24 px-5 py-4 transition-colors target:bg-green-50 target:ring-2 target:ring-inset target:ring-green-300">
                <summary className="grid cursor-pointer list-none gap-3 xl:grid-cols-[40px_1fr_260px_110px_150px] xl:items-center">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">{event.title}</div>
                    <div className="text-sm text-muted">{event.clubs?.name ?? "Unknown club"}</div>
                    <div className="mt-1 text-xs text-muted">Venue: {event.venue ?? "Not set"} · Registration: {event.registration_url ? "Added" : "Not set"}</div>
                  </div>
                  <div className="text-sm text-muted">{formatEventRange(event.start_datetime, event.end_datetime)}</div>
                  <Badge tone={event.status === "published" ? "green" : "amber"}>{event.status}</Badge>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Pencil className="h-4 w-4" /> Edit</span>
                </summary>
                <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4">
                  <EventForm event={event} visibleClubs={visibleClubs} canChooseClub={canChooseClub} assignedClub={assignedClub} />
                  <DeleteEventButton id={event.id} clubId={event.club_id} title={event.title} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

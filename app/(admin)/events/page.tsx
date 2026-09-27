import { CalendarDays, CheckCircle2, Plus } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { approveContent, saveEvent } from "@/lib/actions/content";
import { getClubs, getEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function EventsPage() {
  const profile = await requireProfile();
  const [events, clubs] = await Promise.all([getEvents(), getClubs()]);
  const visibleClubs = profile.role === "super_admin" ? clubs : clubs.filter((club) => club.id === profile.club_id);
  const assignedClub = visibleClubs[0] ?? null;
  const visibleEvents = profile.role === "super_admin" ? events : events.filter((event) => event.club_id === profile.club_id);

  return (
    <>
      <PageTitle title="Events, Schedule & Venue" subtitle="Submit event title, details, poster, time, venue, and registration link." />
      <Card className="mb-5 p-5">
        {profile.role !== "super_admin" && assignedClub ? (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Your club</div>
            <div className="text-lg font-semibold text-foreground">{assignedClub.name}</div>
          </div>
        ) : null}
        {!assignedClub && profile.role !== "super_admin" ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No club is assigned to this admin yet. Ask the Super Admin to assign a club in Team Access.
          </div>
        ) : (
          <form action={saveEvent} className="grid gap-3">
            {profile.role === "super_admin" ? (
              <select name="club_id" required className="h-11 rounded-xl border border-border px-3">
                <option value="">Select club</option>
                {visibleClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            ) : (
              <input type="hidden" name="club_id" value={assignedClub?.id ?? ""} />
            )}
            <input name="title" required placeholder="Event title" className="h-11 rounded-xl border border-border px-3" />
            <textarea name="description" required placeholder="About the event" className="min-h-28 rounded-xl border border-border px-3 py-2" />
            <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
              <span className="mb-2 block font-medium text-foreground">Upload event poster</span>
              <input name="poster_file" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
            </label>
            <input name="poster_url" type="url" placeholder="Optional poster URL fallback" className="h-11 rounded-xl border border-border px-3" />
            <div className="grid gap-3 lg:grid-cols-3">
              <input name="event_datetime" required type="datetime-local" className="h-11 rounded-xl border border-border px-3" />
              <input name="venue" required placeholder="Venue" className="h-11 rounded-xl border border-border px-3" />
              <input name="registration_url" type="url" placeholder="Registration link" className="h-11 rounded-xl border border-border px-3" />
            </div>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
              <Plus className="h-4 w-4" /> Submit
            </button>
          </form>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {visibleEvents.map((event) => (
            <div key={event.id} className="grid gap-3 px-5 py-4 xl:grid-cols-[40px_1fr_230px_110px_190px] xl:items-center">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">{event.title}</div>
                <div className="text-sm text-muted">
                  {event.clubs?.name ?? "Unknown club"}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Venue: {event.venue ?? "Not set"} · Registration: {event.registration_url ? "Added" : "Not set"}
                </div>
              </div>
              <div className="text-sm text-muted">{formatDateTime(event.event_datetime)}</div>
              <Badge tone={event.status === "approved" ? "green" : event.status === "rejected" ? "red" : "amber"}>{event.status}</Badge>
              {profile.role === "super_admin" && event.status === "pending" ? (
                <form action={approveContent} className="flex gap-2">
                  <input type="hidden" name="id" value={event.id} />
                  <input type="hidden" name="entity" value="events" />
                  <button name="status" value="approved" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button name="status" value="rejected" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">Reject</button>
                </form>
              ) : <span />}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

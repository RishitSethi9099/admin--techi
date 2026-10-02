import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { deleteEvent, saveEvent } from "@/lib/actions/content";
import { getAssignedClubIds, getClubs, getEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import type { Club, Event } from "@/lib/supabase/types";

function dateTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function EventFields({ event, visibleClubs, canChooseClub, assignedClub }: { event?: Event; visibleClubs: Club[]; canChooseClub: boolean; assignedClub: Club | null }) {
  return (
    <div className="grid gap-3">
      {event?.id ? <input type="hidden" name="id" value={event.id} /> : null}
      {canChooseClub ? (
        <select name="club_id" required defaultValue={event?.club_id ?? ""} className="h-11 rounded-xl border border-border px-3">
          <option value="">Select club</option>
          {visibleClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select>
      ) : (
        <input type="hidden" name="club_id" value={event?.club_id ?? assignedClub?.id ?? ""} />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <input name="title" required maxLength={120} defaultValue={event?.title ?? ""} placeholder="Event title" className="h-11 rounded-xl border border-border px-3" />
        <input name="venue" required maxLength={160} defaultValue={event?.venue ?? ""} placeholder="Venue" className="h-11 rounded-xl border border-border px-3" />
      </div>
      <textarea name="description" required maxLength={1200} defaultValue={event?.description ?? ""} placeholder="About the event" className="min-h-28 rounded-xl border border-border px-3 py-2" />
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1 text-sm text-muted">
          <span className="font-medium text-foreground">Start date/time</span>
          <input name="start_datetime" required type="datetime-local" defaultValue={dateTimeInputValue(event?.start_datetime)} className="h-11 rounded-xl border border-border px-3" />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          <span className="font-medium text-foreground">End date/time</span>
          <input name="end_datetime" required type="datetime-local" defaultValue={dateTimeInputValue(event?.end_datetime)} className="h-11 rounded-xl border border-border px-3" />
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <input name="registration_url" type="url" defaultValue={event?.registration_url ?? ""} placeholder="https:// registration link" className="h-11 rounded-xl border border-border px-3" />
        <select name="status" defaultValue={event?.status ?? "draft"} className="h-11 rounded-xl border border-border px-3">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
        <span className="mb-2 block font-medium text-foreground">Upload event poster</span>
        <input name="poster_file" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
      </label>
      {event?.poster_url ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-3">
          <img src={event.poster_url} alt={`${event.title} poster preview`} className="h-24 w-20 rounded-lg object-cover" />
          <div className="min-w-0 text-sm text-muted">
            <div className="font-medium text-foreground">Current poster</div>
            <div className="truncate">{event.poster_url}</div>
          </div>
        </div>
      ) : null}
      <input name="poster_url" type="url" defaultValue={event?.poster_url ?? ""} placeholder="Optional poster URL fallback" className="h-11 rounded-xl border border-border px-3" />
    </div>
  );
}

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
          <form action={saveEvent} className="grid gap-4">
            <EventFields visibleClubs={visibleClubs} canChooseClub={canChooseClub} assignedClub={assignedClub} />
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
              <Plus className="h-4 w-4" /> Create event
            </button>
          </form>
        )}
      </Card>

      <Card className="overflow-hidden">
        {!visibleEvents.length ? (
          <div className="p-6 text-sm text-muted">No events have been created yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {visibleEvents.map((event) => (
              <details key={event.id} className="group px-5 py-4">
                <summary className="grid cursor-pointer list-none gap-3 xl:grid-cols-[40px_1fr_260px_110px_150px] xl:items-center">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">{event.title}</div>
                    <div className="text-sm text-muted">{event.clubs?.name ?? "Unknown club"}</div>
                    <div className="mt-1 text-xs text-muted">Venue: {event.venue ?? "Not set"} · Registration: {event.registration_url ? "Added" : "Not set"}</div>
                  </div>
                  <div className="text-sm text-muted">{formatDateTime(event.start_datetime)} - {formatDateTime(event.end_datetime)}</div>
                  <Badge tone={event.status === "published" ? "green" : "amber"}>{event.status}</Badge>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Pencil className="h-4 w-4" /> Edit</span>
                </summary>
                <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4">
                  <form action={saveEvent} className="grid gap-4">
                    <EventFields event={event} visibleClubs={visibleClubs} canChooseClub={canChooseClub} assignedClub={assignedClub} />
                    <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">Save changes</button>
                  </form>
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="club_id" value={event.club_id} />
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white">
                      <Trash2 className="h-4 w-4" /> Delete event
                    </button>
                  </form>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

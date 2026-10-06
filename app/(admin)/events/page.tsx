import Link from "next/link";
import { CalendarDays, Pencil, Star } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getClubCollabs, getMyClubIds, getClubs, getEventSlots, getEvents } from "@/lib/data";
import { DeleteEventButton, EventForm, type EventSlotInfo } from "@/components/admin/event-form";
import { formatEventRange } from "@/lib/event-time";
import type { Club, Event, EventSlot } from "@/lib/supabase/types";

const TIER_TEXT = {
  major: { label: "Major event", where: "Shows in the Major Events section of the website, with your billboard video." },
  minor: { label: "Minor event", where: "Shows on the Minor Events timeline and the schedule page." }
};

function slotInfo(slot: EventSlot): EventSlotInfo {
  return { id: slot.id, club_id: slot.club_id, event_name: slot.event_name, event_tier: slot.event_tier === "major" ? "major" : "minor" };
}

function ScheduleStatus({ event }: { event?: Event }) {
  if (!event) return <Badge tone="grey">No schedule yet</Badge>;
  return <Badge tone={event.status === "published" ? "green" : "amber"}>{event.status === "published" ? "On the website" : "Draft"}</Badge>;
}

function SlotSection({ slot, event, clubs }: { slot: EventSlot; event?: Event; clubs: Club[] }) {
  const tier = slot.event_tier === "major" ? "major" : "minor";
  return (
    <Card className={`overflow-hidden ${tier === "major" ? "border-primary/40" : ""}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${tier === "major" ? "bg-primary-soft" : "bg-slate-50"}`}>
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${tier === "major" ? "bg-primary text-white" : "bg-slate-200 text-slate-700"}`}>
            {tier === "major" ? <Star className="h-3 w-3" /> : null}
            {TIER_TEXT[tier].label}
          </div>
          <div className="mt-2 text-lg font-semibold">{slot.event_name}</div>
          <div className="text-sm text-muted">{TIER_TEXT[tier].where}</div>
        </div>
        <div className="grid justify-items-end gap-1 text-right">
          <ScheduleStatus event={event} />
          {event ? <span className="text-sm text-muted">{formatEventRange(event.start_datetime, event.end_datetime)}</span> : null}
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <EventForm key={slot.id} event={event} slot={slotInfo(slot)} visibleClubs={clubs} canChooseClub={false} assignedClub={null} />
        {event ? <DeleteEventButton id={event.id} clubId={event.club_id} title={event.title} /> : null}
      </div>
    </Card>
  );
}

function ClubEvents({ club, slots, events, clubs, showName, collabNote }: { club: Club; slots: EventSlot[]; events: Event[]; clubs: Club[]; showName: boolean; collabNote?: string | null }) {
  const linked = (slot: EventSlot) => events.find((event) => event.event_slot_id === slot.id && !event.deleted_at);
  const unlinked = events.filter((event) => event.club_id === club.id && !event.event_slot_id && !event.deleted_at);
  const free = slots.filter((slot) => !linked(slot)).map(slotInfo);
  const majors = slots.filter((slot) => slot.event_tier === "major").length;
  return (
    <section className="mb-8 grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-semibold">
          {showName ? club.name : "Your events"}
          {collabNote ? <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">{collabNote} · shared, either club can edit</span> : null}
        </h2>
        <span className="text-sm text-muted">
          {slots.length ? `${majors} major · ${slots.length - majors} minor · ${slots.filter((slot) => linked(slot)).length} of ${slots.length} scheduled` : ""}
        </span>
      </div>
      {!slots.length ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No events are listed for {club.short_name ?? club.name} yet. Ask the Super Admin to add them.
        </div>
      ) : (
        slots.map((slot) => <SlotSection key={slot.id} slot={slot} event={linked(slot)} clubs={clubs} />)
      )}
      {unlinked.length ? (
        <Card className="overflow-hidden border-amber-200">
          <div className="bg-amber-50 px-5 py-3 text-sm text-amber-900">
            <b>Older entries not linked to an event.</b> Open one and choose which event it is, so the website knows if it's major or minor.
          </div>
          <div className="divide-y divide-border">
            {unlinked.map((event) => (
              <details key={event.id} className="px-5 py-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">{event.title}</span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Pencil className="h-4 w-4" /> Open</span>
                </summary>
                <div className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-4">
                  <EventForm event={event} visibleClubs={[club]} canChooseClub={false} assignedClub={club} linkOptions={free} />
                  <DeleteEventButton id={event.id} clubId={event.club_id} title={event.title} />
                </div>
              </details>
            ))}
          </div>
        </Card>
      ) : null}
    </section>
  );
}

export default async function EventsPage({ searchParams }: { searchParams?: { club?: string } }) {
  const profile = await requireProfile();
  const isSuper = profile.role === "super_admin";
  const [events, clubs, slots, assignedClubIds, collabs] = await Promise.all([
    getEvents(),
    getClubs(),
    getEventSlots(),
    isSuper ? Promise.resolve([] as string[]) : getMyClubIds(profile),
    getClubCollabs()
  ]);
  // collab entries ("ACM x SIGAI") show inside each partner club rather than as a club of their own
  const collabIds = new Set(collabs.map((c) => c.collab_club_id));
  const collabsOf = (clubId: string) => collabs.filter((c) => c.member_club_id === clubId).map((c) => c.collab_club_id);
  const shortName = (id: string) => {
    const club = clubs.find((c) => c.id === id);
    return club?.short_name ?? club?.name ?? "club";
  };
  const collabLabel = (collabId: string, viewerClubId: string) =>
    collabIds.has(collabId)
      ? `Collab with ${Array.from(new Set(collabs.filter((c) => c.collab_club_id === collabId && c.member_club_id !== viewerClubId).map((c) => shortName(c.member_club_id)))).join(" + ")}`
      : null;
  const order = (list: EventSlot[]) => [...list].sort((a, b) => (a.event_tier === b.event_tier ? a.event_number - b.event_number : a.event_tier === "major" ? -1 : 1));
  const slotsFor = (clubId: string) => order(slots.filter((slot) => slot.club_id === clubId));
  const linkedTo = (slot: EventSlot) => events.find((event) => event.event_slot_id === slot.id && !event.deleted_at);

  const pickedClub = isSuper && searchParams?.club ? clubs.find((club) => club.id === searchParams.club) ?? null : null;
  const scopeClubs = isSuper
    ? pickedClub ? [pickedClub, ...clubs.filter((club) => collabsOf(pickedClub.id).includes(club.id))] : []
    : profile.role === "event_ops"
      ? clubs.filter((club) => assignedClubIds.includes(club.id))
      : clubs.filter((club) => assignedClubIds.includes(club.id));
  const special = events.filter((event) => !event.event_slot_id && !event.deleted_at);
  const clubsWithSlots = clubs
    .filter((club) => !collabIds.has(club.id) && slots.some((slot) => slot.club_id === club.id || collabsOf(club.id).includes(slot.club_id)))
    .sort((a, b) => (a.short_name ?? a.name).localeCompare(b.short_name ?? b.name));

  return (
    <>
      <PageTitle
        title="Events"
        subtitle={isSuper ? "Pick a club to add or edit the schedule for each of its events. Major events show in the website's Major Events section, minor events on the timeline." : "Add the date, time and venue for each of your events. Each one is already marked major or minor."}
      />

      {!isSuper && !scopeClubs.length ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No club is assigned to this admin yet. Ask the Super Admin to assign a club in Team Access.
        </div>
      ) : null}

      {isSuper ? (
        <Card className="mb-6 p-5">
          <form action="/events" className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[260px] flex-1 gap-1 text-sm">
              <span className="font-medium">Club</span>
              <select name="club" defaultValue={pickedClub?.id ?? ""} className="h-11 rounded-xl border border-border bg-white px-3">
                <option value="">All clubs (overview)</option>
                {clubsWithSlots.map((club) => <option key={club.id} value={club.id}>{club.short_name ?? club.name}</option>)}
              </select>
            </label>
            <button className="h-11 rounded-xl bg-primary px-5 font-semibold text-white">Show</button>
            {pickedClub ? <Link href="/events" className="self-center text-sm font-semibold text-primary underline underline-offset-2">Back to all clubs</Link> : null}
          </form>

          {!pickedClub ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1fr_2.4fr_70px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <span>Club</span><span>Events and their schedule</span><span />
              </div>
              <div className="divide-y divide-border">
                {clubsWithSlots.map((club) => (
                  <div key={club.id} className="grid grid-cols-[1fr_2.4fr_70px] items-center gap-3 px-4 py-3">
                    <div className="font-medium">{club.short_name ?? club.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {[club.id, ...collabsOf(club.id)].flatMap((id) => slotsFor(id)).map((slot) => {
                        const event = linkedTo(slot);
                        const note = collabLabel(slot.club_id, club.id);
                        return (
                          <span key={slot.id} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1 text-sm">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${slot.event_tier === "major" ? "bg-primary text-white" : "bg-slate-200 text-slate-700"}`}>{slot.event_tier}</span>
                            {slot.event_name}
                            {note ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{note}</span> : null}
                            <ScheduleStatus event={event} />
                          </span>
                        );
                      })}
                    </div>
                    <Link href={`/events?club=${club.id}`} className="text-right text-sm font-semibold text-primary">Open</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {scopeClubs.map((club) => (
        <ClubEvents key={club.id} collabNote={collabLabel(club.id, isSuper ? pickedClub?.id ?? "" : profile.club_id ?? "")} club={club} slots={slotsFor(club.id)} events={events.filter((event) => event.club_id === club.id)} clubs={clubs} showName={isSuper || scopeClubs.length > 1} />
      ))}

      {isSuper && !pickedClub ? (
        <section className="grid gap-4">
          <div className="px-1">
            <h2 className="text-lg font-semibold">Special events</h2>
            <p className="text-sm text-muted">Events that aren't one of a club's listed events, like the inauguration or a guest talk. You choose if each is major or minor.</p>
          </div>
          <Card className="p-5">
            <EventForm special visibleClubs={clubs} canChooseClub assignedClub={null} />
          </Card>
          {special.length ? (
            <Card className="overflow-hidden">
              <div className="divide-y divide-border">
                {special.map((event) => (
                  <details key={event.id} id={`event-${event.id}`} className="px-5 py-4">
                    <summary className="grid cursor-pointer list-none gap-3 xl:grid-cols-[40px_1fr_260px_120px_90px] xl:items-center">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><CalendarDays className="h-4 w-4" /></div>
                      <div>
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted">{event.clubs?.name ?? "Unknown club"} · {event.event_tier === "major" ? "Major" : "Minor"} event</div>
                      </div>
                      <div className="text-sm text-muted">{formatEventRange(event.start_datetime, event.end_datetime)}</div>
                      <ScheduleStatus event={event} />
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Pencil className="h-4 w-4" /> Edit</span>
                    </summary>
                    <div className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-4">
                      <EventForm
                        event={event}
                        special
                        visibleClubs={clubs}
                        canChooseClub
                        assignedClub={null}
                        linkOptions={slotsFor(event.club_id).filter((slot) => !linkedTo(slot)).map(slotInfo)}
                      />
                      <DeleteEventButton id={event.id} clubId={event.club_id} title={event.title} />
                    </div>
                  </details>
                ))}
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

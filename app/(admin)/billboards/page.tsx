import Link from "next/link";
import { CheckCircle2, ImageIcon, Video } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { approveContent } from "@/lib/actions/content";
import { getApprovalRequests, getClubCollabs, getEvents, getMyClubIds, getBillboards, getClubs, getEventSlots, getScreenRotation } from "@/lib/data";
import { DeletePulledPosterButton, PullPosterButton } from "@/components/admin/pull-poster";
import { BillboardForm } from "@/components/admin/billboard-form";
import { BillboardLiveButton } from "@/components/admin/billboard-live-button";
import { ScreenRotationPanel, type RotationSlot } from "@/components/admin/screen-rotation-panel";
import type { ApprovalRequest, Billboard, EventSlot } from "@/lib/supabase/types";

type SlotState = "live" | "down" | "pending" | "rejected" | "none";

const STATE_LABEL: Record<SlotState, string> = {
  live: "Live",
  down: "Taken down",
  pending: "Awaiting approval",
  rejected: "Rejected",
  none: "Not uploaded"
};
const STATE_TONE: Record<SlotState, "green" | "amber" | "red" | "grey" | "purple"> = {
  live: "green",
  down: "purple",
  pending: "amber",
  rejected: "red",
  none: "grey"
};

function slotState(slot: EventSlot, billboards: Billboard[], approvals: ApprovalRequest[]): SlotState {
  const uploads = billboards.filter((billboard) => billboard.event_slot_id === slot.id && billboard.media_url);
  if (uploads.some((billboard) => billboard.status === "approved" && billboard.active)) return "live";
  const waiting =
    uploads.some((billboard) => billboard.status === "pending") ||
    approvals.some((request) => request.resource_type === "billboard" && request.status === "pending" && request.proposed_value?.event_slot_id === slot.id);
  if (waiting) return "pending";
  if (uploads.some((billboard) => billboard.status === "approved")) return "down";
  if (uploads.some((billboard) => billboard.status === "rejected")) return "rejected";
  return "none";
}

function tierOf(billboard: Billboard) {
  return billboard.event_tier ?? billboard.event_slots?.event_tier ?? (billboard.type === "video" ? "major" : "minor");
}

export default async function BillboardsPage({ searchParams }: { searchParams?: { club?: string; tier?: string } }) {
  const profile = await requireProfile();
  const isSuper = profile.role === "super_admin";
  const [billboards, clubs, eventSlots, approvals, assignedClubIds, rotation, collabs, events] = await Promise.all([
    getBillboards(),
    getClubs(),
    getEventSlots(),
    getApprovalRequests(),
    isSuper ? Promise.resolve([] as string[]) : getMyClubIds(profile),
    isSuper ? getScreenRotation() : Promise.resolve(null),
    getClubCollabs(),
    getEvents()
  ]);
  // posters clubs added to their event schedule: the Super Admin can pull them onto the billboards
  const schedulePoster = new Map<string, string>();
  for (const event of events) {
    if (event.event_slot_id && event.poster_url && !event.deleted_at && !schedulePoster.has(event.event_slot_id)) schedulePoster.set(event.event_slot_id, event.poster_url);
  }
  const pulledFromSchedule = (billboard: Billboard) => Boolean(billboard.media_url && billboard.media_url.includes("/event-posters/"));
  const canPull = (slot: EventSlot, state: SlotState) =>
    isSuper && slot.event_tier === "minor" && slot.required_media_type === "poster" && (state === "none" || state === "rejected") && schedulePoster.has(slot.id);
  // collab entries ("Pitchers X EIS") are shown inside each partner club, not as a club of their own
  const collabIds = new Set(collabs.map((c) => c.collab_club_id));
  const shortName = (id: string) => {
    const club = clubs.find((c) => c.id === id);
    return club?.short_name ?? club?.name ?? "club";
  };
  const collabsOf = (clubId: string) => collabs.filter((c) => c.member_club_id === clubId).map((c) => c.collab_club_id);
  const belongsTo = (slotClubId: string, clubId: string) => slotClubId === clubId || collabsOf(clubId).includes(slotClubId);
  const collabLabel = (slotClubId: string, viewerClubId?: string | null) => {
    if (!collabIds.has(slotClubId)) return null;
    const others = Array.from(new Set(collabs.filter((c) => c.collab_club_id === slotClubId && c.member_club_id !== viewerClubId).map((c) => shortName(c.member_club_id))));
    return `Collab with ${others.join(" + ")}`;
  };
  const rotationSlots: RotationSlot[] = eventSlots
    .filter((slot) => slot.event_tier === "major")
    .map((slot) => {
      const state = slotState(slot, billboards, approvals);
      const video: RotationSlot["video"] = state === "live" ? "approved" : state === "pending" ? "pending" : "none";
      return { id: slot.id, clubName: slot.clubs?.short_name || slot.clubs?.name || "Club", eventName: slot.event_name, video };
    });
  const visibleClubs =
    isSuper
      ? clubs
      : profile.role === "event_ops"
        ? clubs.filter((club) => assignedClubIds.includes(club.id))
        : clubs.filter((club) => assignedClubIds.includes(club.id));
  const assignedClub = (profile.role === "club_admin" ? visibleClubs.find((club) => club.id === profile.club_id) : visibleClubs[0]) ?? null;

  // Super Admin: one club at a time (picked from the dropdown), optionally only major or minor
  const tier = isSuper && (searchParams?.tier === "major" || searchParams?.tier === "minor") ? searchParams.tier : "all";
  const pickedClub = isSuper && searchParams?.club ? clubs.find((club) => club.id === searchParams.club) ?? null : null;
  const tierMatch = (value: string | null | undefined) => tier === "all" || value === tier;
  const href = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = { club: pickedClub?.id ?? null, tier: tier === "all" ? null : tier, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `/billboards?${query}` : "/billboards";
  };

  const visibleBillboards = isSuper
    ? pickedClub
      ? billboards.filter((billboard) => belongsTo(billboard.club_id, pickedClub.id) && tierMatch(tierOf(billboard)))
      : billboards.filter((billboard) => billboard.status === "pending" && tierMatch(tierOf(billboard)))
    : profile.role === "event_ops"
      ? billboards.filter((billboard) => assignedClubIds.includes(billboard.club_id))
      : billboards.filter((billboard) => assignedClubIds.includes(billboard.club_id));
  const visibleSlots = isSuper
    ? pickedClub
      ? eventSlots.filter((slot) => belongsTo(slot.club_id, pickedClub.id) && tierMatch(slot.event_tier))
      : []
    : profile.role === "event_ops"
      ? eventSlots.filter((slot) => assignedClubIds.includes(slot.club_id))
      : eventSlots.filter((slot) => assignedClubIds.includes(slot.club_id));

  // overview rows for the Super Admin when no club is picked
  const overview = isSuper && !pickedClub
    ? clubs
      .filter((club) => !collabIds.has(club.id))
      .map((club) => ({
        club,
        slots: eventSlots
          .filter((slot) => belongsTo(slot.club_id, club.id) && tierMatch(slot.event_tier))
          .map((slot) => ({ slot, state: slotState(slot, billboards, approvals) }))
      }))
      .filter((row) => row.slots.length)
    : [];
  // count each event once, even when a collab shows under two clubs
  const totals = (isSuper && !pickedClub ? eventSlots.filter((slot) => tierMatch(slot.event_tier)) : [])
    .map((slot) => ({ state: slotState(slot, billboards, approvals) }))
    .reduce<Record<SlotState, number>>(
    (acc, { state }) => ({ ...acc, [state]: acc[state] + 1 }),
    { live: 0, down: 0, pending: 0, rejected: 0, none: 0 }
  );
  const pendingRequests = approvals.filter((request) => request.resource_type === "billboard" && request.status === "pending").length;

  const billboardSubmissions = new Map<string, { status: typeof approvals[number]["status"]; message: string }>();
  for (const request of approvals) {
    if (request.resource_type !== "billboard" || request.requested_by !== profile.id) continue;
    const eventSlotId = typeof request.proposed_value?.event_slot_id === "string" ? request.proposed_value.event_slot_id : null;
    if (!eventSlotId || billboardSubmissions.has(eventSlotId)) continue;
    const takenDown = request.status === "approved" && billboards.some((b) => b.event_slot_id === eventSlotId && b.status === "approved") && !billboards.some((b) => b.event_slot_id === eventSlotId && b.status === "approved" && b.active);
    billboardSubmissions.set(eventSlotId, {
      status: request.status,
      message:
        takenDown
          ? "Taken down from the website by the Super Admin."
          : request.status === "approved"
            ? "Approved and published."
            : request.status === "rejected"
              ? "Rejected. Edit and resubmit this slot."
              : "Submitted. Wait for Super Admin approval."
    });
  }
  for (const billboard of visibleBillboards) {
    if (!billboard.event_slot_id || billboardSubmissions.has(billboard.event_slot_id)) continue;
    billboardSubmissions.set(billboard.event_slot_id, {
      status: billboard.status,
      message:
        billboard.status === "approved" && !billboard.active
          ? "Taken down from the website by the Super Admin."
          : billboard.status === "approved"
            ? "Approved and published."
            : billboard.status === "rejected"
              ? "Rejected. Edit and resubmit this slot."
              : "Submitted. Wait for Super Admin approval."
    });
  }

  const chip = (to: string, label: string, active: boolean) => (
    <Link key={to + label} href={to} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:bg-slate-50"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageTitle
        title="Billboards"
        subtitle={isSuper ? "Pick a club to see its major and minor event uploads, approve them, or take them down from the website." : "Submit your club promotion for the website billboard."}
      />
      {rotation ? (
        <Card className="mb-5 p-5">
          <ScreenRotationPanel slots={rotationSlots} initialSettings={rotation.settings} missingTable={rotation.missingTable} />
        </Card>
      ) : null}

      {isSuper ? (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <form action="/billboards" className="flex flex-1 flex-wrap items-end gap-3">
              <label className="grid min-w-[260px] flex-1 gap-1 text-sm">
                <span className="font-medium">Club</span>
                <select name="club" defaultValue={pickedClub?.id ?? ""} className="h-11 rounded-xl border border-border bg-white px-3">
                  <option value="">All clubs (overview)</option>
                  {clubs
                    .filter((club) => !collabIds.has(club.id) && eventSlots.some((slot) => belongsTo(slot.club_id, club.id)))
                    .sort((a, b) => (a.short_name ?? a.name).localeCompare(b.short_name ?? b.name))
                    .map((club) => <option key={club.id} value={club.id}>{club.short_name ?? club.name}</option>)}
                </select>
              </label>
              {tier !== "all" ? <input type="hidden" name="tier" value={tier} /> : null}
              <button className="h-11 rounded-xl bg-primary px-5 font-semibold text-white">Show</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {chip(href({ tier: null }), "Major + minor", tier === "all")}
              {chip(href({ tier: "major" }), "Major events", tier === "major")}
              {chip(href({ tier: "minor" }), "Minor events", tier === "minor")}
            </div>
          </div>

          {pickedClub ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">Club</div>
                <div className="text-lg font-semibold">{pickedClub.name}</div>
              </div>
              <Link href={href({ club: null })} className="text-sm font-semibold text-primary underline underline-offset-2">Back to all clubs</Link>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {(["live", "pending", "down", "rejected", "none"] as SlotState[]).map((state) => (
                  <span key={state} className="rounded-full border border-border bg-white px-3 py-1">
                    <b>{totals[state]}</b> {STATE_LABEL[state].toLowerCase()}
                  </span>
                ))}
                {pendingRequests ? (
                  <Link href="/approvals" className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                    {pendingRequests} club submission{pendingRequests === 1 ? "" : "s"} waiting in Approvals
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[1.1fr_2fr_80px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>Club</span><span>Events</span><span />
                </div>
                <div className="divide-y divide-border">
                  {overview.map(({ club, slots }) => (
                    <div key={club.id} className="grid grid-cols-[1.1fr_2fr_80px] items-center gap-3 px-4 py-3">
                      <div className="font-medium">{club.short_name ?? club.name}</div>
                      <div className="flex flex-wrap gap-2">
                        {slots.map(({ slot, state }) => (
                          <span key={slot.id} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1 text-sm">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${slot.event_tier === "major" ? "bg-primary text-white" : "bg-slate-200 text-slate-700"}`}>{slot.event_tier}</span>
                            {slot.event_name}
                            {collabLabel(slot.club_id, club.id) ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{collabLabel(slot.club_id, club.id)}</span> : null}
                            <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                            {canPull(slot, state) ? <PullPosterButton compact slotId={slot.id} posterUrl={schedulePoster.get(slot.id)!} /> : null}
                          </span>
                        ))}
                      </div>
                      <Link href={href({ club: club.id })} className="text-right text-sm font-semibold text-primary">Open</Link>
                    </div>
                  ))}
                  {!overview.length ? <div className="px-4 py-6 text-sm text-muted">No clubs have {tier === "all" ? "" : `${tier} `}event slots.</div> : null}
                </div>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {!isSuper || pickedClub ? (
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
          {!assignedClub && !isSuper ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              No club is assigned to this admin yet. Ask the Super Admin to assign a club in Team Access.
            </div>
          ) : !visibleSlots.length ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {isSuper ? `${pickedClub?.name} has no ${tier === "all" ? "" : `${tier} `}event slots.` : "No event upload slots are assigned yet. Run the event slot migration from the Excel list."}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleSlots.map((slot) => {
                const state = slotState(slot, billboards, approvals);
                const pulled = billboards.find((b) => b.event_slot_id === slot.id && b.status === "approved" && b.active && pulledFromSchedule(b));
                return (
                <div key={slot.id} className="grid content-start gap-2">
                {canPull(slot, state) ? <PullPosterButton slotId={slot.id} posterUrl={schedulePoster.get(slot.id)!} /> : null}
                {pulled ? (
                  <div className="grid gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    {isSuper ? (
                      <span><b>Pulled from this club&apos;s event schedule.</b> The club admin can replace or delete it.</span>
                    ) : (
                      <span>
                        <b>The Super Admin pulled this poster from your event schedule</b> and put it on the website. To use a different poster, press <b>Edit submission</b> and upload it. To remove it, delete it.
                      </span>
                    )}
                    <DeletePulledPosterButton billboardId={pulled.id} eventName={slot.event_name} />
                  </div>
                ) : null}
                <BillboardForm collabNote={collabLabel(slot.club_id, isSuper ? pickedClub?.id : profile.club_id)} role={profile.role} visibleClubs={visibleClubs.filter((club) => club.id === slot.club_id)} assignedClub={visibleClubs.find((club) => club.id === slot.club_id) ?? assignedClub} slot={slot} submission={billboardSubmissions.get(slot.id) ?? null} />
                </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {isSuper ? (
        <h2 className="mb-2 px-1 text-lg font-semibold">
          {pickedClub ? `${pickedClub.short_name ?? pickedClub.name} uploads` : "Uploads waiting for your approval"}
          <span className="ml-2 text-sm font-normal text-muted">{visibleBillboards.length}</span>
        </h2>
      ) : null}
      {isSuper && !visibleBillboards.length ? (
        <p className="px-1 text-sm text-muted">{pickedClub ? "This club hasn't uploaded anything yet." : "Nothing is waiting. Pick a club to see everything it uploaded."}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleBillboards.map((billboard) => {
          const live = billboard.status === "approved" && billboard.active;
          const name = billboard.event_name ?? billboard.title ?? "Untitled promotion";
          return (
            <Card key={billboard.id} className="overflow-hidden">
              <div className="grid h-28 place-items-center bg-primary-soft text-primary">
                {billboard.type === "video" ? <Video className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{name}</div>
                    <div className="text-sm text-muted">{billboard.clubs?.name ?? "Unknown club"} · {tierOf(billboard)} {billboard.type}</div>
                  </div>
                  <Badge tone={billboard.status === "approved" ? (live ? "green" : "purple") : billboard.status === "rejected" ? "red" : "amber"}>
                    {billboard.status === "approved" ? (live ? "live" : "taken down") : billboard.status}
                  </Badge>
                </div>
                {billboard.media_url ? (
                  <a href={billboard.media_url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-primary underline underline-offset-2">
                    Open the {billboard.type}
                  </a>
                ) : null}
                {billboard.about_club ? <p className="text-sm text-muted">{billboard.about_club}</p> : null}
                {isSuper && billboard.status === "pending" ? (
                  <form action={approveContent} className="flex gap-2">
                    <input type="hidden" name="id" value={billboard.id} />
                    <input type="hidden" name="entity" value="billboards" />
                    <button name="status" value="approved" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                    <button name="status" value="rejected" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">Reject</button>
                  </form>
                ) : null}
                {isSuper && billboard.status === "approved" ? <BillboardLiveButton id={billboard.id} live={billboard.active} name={name} /> : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

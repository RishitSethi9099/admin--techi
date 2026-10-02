import { CheckCircle2, ImageIcon, Video } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { approveContent } from "@/lib/actions/content";
import { getApprovalRequests, getAssignedClubIds, getBillboards, getClubs, getEventSlots, getScreenRotation } from "@/lib/data";
import { BillboardForm } from "@/components/admin/billboard-form";
import { ScreenRotationPanel, type RotationSlot } from "@/components/admin/screen-rotation-panel";

export default async function BillboardsPage() {
  const profile = await requireProfile();
  const [billboards, clubs, eventSlots, approvals, assignedClubIds, rotation] = await Promise.all([
    getBillboards(),
    getClubs(),
    getEventSlots(),
    getApprovalRequests(),
    profile.role === "event_ops" ? getAssignedClubIds(profile.id) : Promise.resolve([]),
    profile.role === "super_admin" ? getScreenRotation() : Promise.resolve(null)
  ]);
  const rotationSlots: RotationSlot[] = eventSlots
    .filter((slot) => slot.event_tier === "major")
    .map((slot) => {
      const uploads = billboards.filter((billboard) => billboard.event_slot_id === slot.id && billboard.media_url);
      const video: RotationSlot["video"] = uploads.some((billboard) => billboard.status === "approved" && billboard.active)
        ? "approved"
        : uploads.some((billboard) => billboard.status === "pending")
          ? "pending"
          : "none";
      return { id: slot.id, clubName: slot.clubs?.short_name || slot.clubs?.name || "Club", eventName: slot.event_name, video };
    });
  const visibleClubs =
    profile.role === "super_admin"
      ? clubs
      : profile.role === "event_ops"
        ? clubs.filter((club) => assignedClubIds.includes(club.id))
        : clubs.filter((club) => club.id === profile.club_id);
  const assignedClub = visibleClubs[0] ?? null;
  const visibleBillboards =
    profile.role === "super_admin"
      ? billboards
      : profile.role === "event_ops"
        ? billboards.filter((billboard) => assignedClubIds.includes(billboard.club_id))
        : billboards.filter((billboard) => billboard.club_id === profile.club_id);
  const visibleSlots =
    profile.role === "super_admin"
      ? eventSlots
      : profile.role === "event_ops"
        ? eventSlots.filter((slot) => assignedClubIds.includes(slot.club_id))
        : eventSlots.filter((slot) => slot.club_id === profile.club_id);

  const billboardSubmissions = new Map<string, { status: typeof approvals[number]["status"]; message: string }>();
  for (const request of approvals) {
    if (request.resource_type !== "billboard" || request.requested_by !== profile.id) continue;
    const eventSlotId = typeof request.proposed_value?.event_slot_id === "string" ? request.proposed_value.event_slot_id : null;
    if (!eventSlotId || billboardSubmissions.has(eventSlotId)) continue;
    billboardSubmissions.set(eventSlotId, {
      status: request.status,
      message:
        request.status === "approved"
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
      message: billboard.status === "approved" ? "Approved and published." : billboard.status === "rejected" ? "Rejected. Edit and resubmit this slot." : "Submitted. Wait for Super Admin approval."
    });
  }

  return (
    <>
      <PageTitle
        title="Billboards"
        subtitle={
          profile.role === "super_admin"
            ? "Create, approve, order, and publish website promotion slots."
            : "Submit your club promotion for the website billboard."
        }
      />
      {rotation ? (
        <Card className="mb-5 p-5">
          <ScreenRotationPanel slots={rotationSlots} initialSettings={rotation.settings} missingTable={rotation.missingTable} />
        </Card>
      ) : null}
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
        ) : !visibleSlots.length ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No event upload slots are assigned yet. Run the event slot migration from the Excel list.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleSlots.map((slot) => (
              <BillboardForm key={slot.id} role={profile.role} visibleClubs={visibleClubs.filter((club) => club.id === slot.club_id)} assignedClub={visibleClubs.find((club) => club.id === slot.club_id) ?? assignedClub} slot={slot} submission={billboardSubmissions.get(slot.id) ?? null} />
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleBillboards.map((billboard) => (
          <Card key={billboard.id} className="overflow-hidden">
            <div className="grid h-28 place-items-center bg-primary-soft text-primary">
              {billboard.type === "video" ? <Video className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{billboard.event_name ?? billboard.title ?? "Untitled promotion"}</div>
                  <div className="text-sm text-muted">{billboard.clubs?.name ?? "Unknown club"} · {billboard.event_tier ?? billboard.type}</div>
                </div>
                <Badge tone={billboard.status === "approved" ? "green" : billboard.status === "rejected" ? "red" : "amber"}>{billboard.status}</Badge>
              </div>
              <div className="text-sm text-muted">
                {billboard.active ? "Active slot" : "Inactive"} · Display order {billboard.display_order ?? 0}
              </div>
              {billboard.about_club ? <p className="text-sm text-muted">{billboard.about_club}</p> : null}
              {profile.role === "super_admin" && billboard.status === "pending" ? (
                <form action={approveContent} className="flex gap-2">
                  <input type="hidden" name="id" value={billboard.id} />
                  <input type="hidden" name="entity" value="billboards" />
                  <button name="status" value="approved" className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button name="status" value="rejected" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">Reject</button>
                </form>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}





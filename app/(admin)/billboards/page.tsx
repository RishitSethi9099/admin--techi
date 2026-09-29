import { CheckCircle2, ImageIcon, Video } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { approveContent } from "@/lib/actions/content";
import { getAssignedClubIds, getBillboards, getClubs } from "@/lib/data";
import { BillboardForm } from "@/components/admin/billboard-form";

export default async function BillboardsPage() {
  const profile = await requireProfile();
  const [billboards, clubs, assignedClubIds] = await Promise.all([getBillboards(), getClubs(), profile.role === "event_ops" ? getAssignedClubIds(profile.id) : Promise.resolve([])]);
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
          <BillboardForm role={profile.role} visibleClubs={visibleClubs} assignedClub={assignedClub} />
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
                  <div className="font-semibold">{billboard.title ?? "Untitled promotion"}</div>
                  <div className="text-sm text-muted">{billboard.clubs?.name ?? "Unknown club"} · {billboard.type}</div>
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

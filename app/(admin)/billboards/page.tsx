import { CheckCircle2, ImageIcon, Plus, Video } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { approveContent, saveBillboard } from "@/lib/actions/content";
import { getBillboards, getClubs } from "@/lib/data";

export default async function BillboardsPage() {
  const profile = await requireProfile();
  const [billboards, clubs] = await Promise.all([getBillboards(), getClubs()]);
  const visibleClubs = profile.role === "super_admin" ? clubs : clubs.filter((club) => club.id === profile.club_id);
  const assignedClub = visibleClubs[0] ?? null;
  const visibleBillboards = profile.role === "super_admin" ? billboards : billboards.filter((billboard) => billboard.club_id === profile.club_id);

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
          <form action={saveBillboard} className="grid gap-3">
            {profile.role === "super_admin" ? (
              <select name="club_id" required className="h-11 rounded-xl border border-border px-3">
                <option value="">Select club</option>
                {visibleClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            ) : (
              <input type="hidden" name="club_id" value={assignedClub?.id ?? ""} />
            )}
            <input name="title" required placeholder="Promo title" className="h-11 rounded-xl border border-border px-3" />
            <select name="type" className="h-11 rounded-xl border border-border px-3">
              <option value="poster">Poster</option>
              <option value="video">Video</option>
            </select>
            <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
              <span className="mb-2 block font-medium text-foreground">Upload poster or video</span>
              <input name="media_file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" className="block w-full text-sm" />
            </label>
            <input name="media_url" type="url" placeholder="Optional media URL fallback" className="h-11 rounded-xl border border-border px-3" />
            <textarea name="about_club" required placeholder="About the club" className="min-h-28 rounded-xl border border-border px-3 py-2" />
            {profile.role === "super_admin" ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input name="display_order" type="number" defaultValue={0} min={0} placeholder="Display order" className="h-11 rounded-xl border border-border px-3" />
                <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm">
                  <input type="checkbox" name="active" /> Active
                </label>
              </div>
            ) : (
              <>
                <input type="hidden" name="display_order" value="0" />
                <input type="hidden" name="active" value="" />
              </>
            )}
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
              <Plus className="h-4 w-4" /> Submit
            </button>
          </form>
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

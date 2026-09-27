import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { getClubs } from "@/lib/data";

export default async function ClubsPage() {
  await requirePermission("clubs:read");
  const clubs = await getClubs();
  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Clubs" subtitle="Club profile data that feeds the public website" />
      {!clubs.length ? <EmptyState title="No clubs available" description="Add clubs in Supabase or through the Super Admin flow after the backend is connected." /> : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {clubs.map((club) => (
              <div key={club.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1fr_160px_120px] md:items-center">
                <div>
                  <div className="font-semibold">{club.name}</div>
                  <div className="text-sm text-muted">{club.description ?? club.slug}</div>
                </div>
                <div className="text-sm text-muted">{club.short_name ?? "Short name unset"}</div>
                <div className="text-sm text-muted">{club.social ?? "Social unset"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

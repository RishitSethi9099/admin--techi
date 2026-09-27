import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth";

export default async function RegistrationsPage() {
  await requirePermission("events:operate");
  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Registrations" subtitle="Registration integration status and operational visibility" />
      <EmptyState title="Registrations are not connected" description="No registration backend is configured yet. This page is intentionally empty rather than showing fake registration counts." />
    </>
  );
}

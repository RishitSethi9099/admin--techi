import { ConnectionBanner } from "@/components/admin/connection-banner";
import { PageTitle } from "@/components/admin/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/lib/auth";

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  return (
    <>
      <ConnectionBanner />
      <PageTitle title="Settings" subtitle="Platform configuration and integration readiness" />
      <EmptyState title="Settings are not editable yet" description="Configuration will be added after Supabase, backup storage, webhooks, and deployment environments are connected." />
    </>
  );
}

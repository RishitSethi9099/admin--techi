import { headers } from "next/headers";
import { Header } from "@/components/admin/header";
import { Sidebar } from "@/components/admin/sidebar";
import { requireProfile } from "@/lib/auth";
import { canAccessPath, hasPermission } from "@/lib/permissions";
import { getOpenErrorCount } from "@/lib/data";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const activePath = headers().get("x-pathname") ?? "/";
  if (!canAccessPath(profile.role, activePath)) redirect("/");
  const openErrors = hasPermission(profile.role, "errors:read") ? await getOpenErrorCount() : null;

  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar role={profile.role} openErrors={openErrors} />
      <div className="min-w-0 flex-1">
        <Header profile={profile} openErrors={openErrors} />
        <main className="px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

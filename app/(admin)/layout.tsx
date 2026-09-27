import { headers } from "next/headers";
import { Header } from "@/components/admin/header";
import { Sidebar } from "@/components/admin/sidebar";
import { requireProfile } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const activePath = headers().get("x-pathname") ?? "/";
  if (!canAccessPath(profile.role, activePath)) redirect("/");

  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar role={profile.role} />
      <div className="min-w-0 flex-1">
        <Header profile={profile} />
        <main className="px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

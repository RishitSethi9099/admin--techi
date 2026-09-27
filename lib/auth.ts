import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/supabase/types";
import { hasPermission, type Permission } from "@/lib/permissions";

const demoProfile: Profile = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Local Demo Admin",
  email: "superadmin@techi.local",
  role: (process.env.DEMO_ROLE as AppRole) ?? "super_admin",
  club_id: null,
  status: "active",
  last_login_at: new Date().toISOString()
};

export const getSessionUser = cache(async () => {
  if (!hasSupabaseEnv()) return { id: demoProfile.id };

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
});

export const getCurrentProfile = cache(async () => {
  if (!hasSupabaseEnv()) return demoProfile;

  const user = await getSessionUser();
  if (!user) return null;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("id,name,email,role,club_id,status,id_banned,ip_banned,banned_ip,ban_reason,last_login_at")
    .eq("id", user.id)
    .single<Profile>();

  return data;
});

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.id_banned || profile.ip_banned) redirect("/login?status=blocked");
  if (profile.status !== "active") redirect("/login?status=suspended");
  return profile;
}

export async function requireSuperAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "super_admin") redirect("/");
  return profile;
}

export async function requireRole(roles: AppRole[]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}

export async function requirePermission(permission: Permission) {
  const profile = await requireProfile();
  if (!hasPermission(profile.role, permission)) redirect("/");
  return profile;
}

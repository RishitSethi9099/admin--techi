"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createServiceRoleClient, createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  login_id: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8),
  role: z.enum(["super_admin", "club_admin", "event_ops"]),
  club_id: z.string().uuid().nullable().optional(),
  club_ids: z.array(z.string().uuid()).default([]),
  club_name: z.string().nullable().optional()
});

function teamAccessError(message: string): never {
  redirect(`/team-access?error=${encodeURIComponent(message)}`);
}

async function writeAuditLogSafely(input: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}

export async function inviteAdmin(formData: FormData) {
  await requireSuperAdmin();
  if (!hasSupabaseEnv()) {
    revalidatePath("/team-access");
    redirect("/team-access?created=1");
  }
  const parsed = inviteSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    login_id: formData.get("login_id"),
    password: formData.get("password"),
    role: formData.get("role"),
    club_id: formData.get("club_id") || null,
    club_ids: formData.getAll("club_ids").filter(Boolean),
    club_name: (formData.get("club_name") as string) || null
  });
  const service = createServiceRoleClient();
  let assignedClubId = parsed.club_id ?? null;
  const assignedClubIds = Array.from(new Set(parsed.club_ids));
  if (parsed.role === "event_ops" && assignedClubIds.length > 10) {
    teamAccessError("Event Ops admins can be assigned to at most 10 clubs.");
  }
  if (parsed.role !== "super_admin" && !assignedClubId && parsed.club_name) {
    const typedClub = parsed.club_name.trim();
    const { data: club, error: clubError } = await service
      .from("clubs")
      .select("id")
      .or(`name.ilike.${typedClub},short_name.ilike.${typedClub},slug.ilike.${typedClub}`)
      .limit(1)
      .maybeSingle();
    if (clubError) teamAccessError(clubError.message);
    if (!club) {
      teamAccessError(`Club not found: ${parsed.club_name}. Create this club first, then assign the admin.`);
    }
    assignedClubId = club.id;
  }
  if (parsed.role === "club_admin" && !assignedClubId) {
    teamAccessError("Assign a club for this admin.");
  }
  if (parsed.role === "event_ops" && !assignedClubIds.length) {
    teamAccessError("Assign at least one club for this Event Ops admin.");
  }
  const { data, error } = await service.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: {
      name: parsed.name,
      login_id: parsed.login_id,
      password_managed_by_super_admin: true
    }
  });
  if (error) teamAccessError(error.message);
  if (!data.user) teamAccessError("Supabase created no auth user. Try again.");
  const { error: profileError } = await service.from("users").upsert({
    id: data.user.id,
    name: parsed.name,
    email: parsed.email,
    login_id: parsed.login_id,
    role: parsed.role,
    club_id: parsed.role === "club_admin" ? assignedClubId : null,
    status: "active"
  });
  if (profileError) teamAccessError(profileError.message);
  if (parsed.role === "event_ops") {
    const { error: accessError } = await service
      .from("admin_club_access")
      .insert(assignedClubIds.map((clubId) => ({
        user_id: data.user.id,
        club_id: clubId
      })));
    if (accessError) teamAccessError(accessError.message);
  }
  await writeAuditLogSafely({ action: "admin.create_fixed_access", entityType: "user", entityId: data.user.id, diff: { ...parsed, password: "[redacted]" } });
  revalidatePath("/team-access");
  redirect(`/team-access?created=1&email=${encodeURIComponent(parsed.email)}`);
}

const updateAdminSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "invited", "suspended"]).optional(),
  club_id: z.string().uuid().nullable().optional(),
  id_banned: z.coerce.boolean().optional(),
  ip_banned: z.coerce.boolean().optional(),
  banned_ip: z.string().nullable().optional(),
  ban_reason: z.string().nullable().optional()
});

export async function updateAdmin(formData: FormData) {
  await requireSuperAdmin();
  if (!hasSupabaseEnv()) {
    revalidatePath("/team-access");
    redirect("/team-access?updated=1");
  }
  const parsed = updateAdminSchema.parse({
    id: formData.get("id"),
    status: formData.get("status") || undefined,
    club_id: formData.get("club_id") || null,
    id_banned: formData.get("id_banned") === "on",
    ip_banned: formData.get("ip_banned") === "on",
    banned_ip: (formData.get("banned_ip") as string) || null,
    ban_reason: (formData.get("ban_reason") as string) || null
  });
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").update(parsed).eq("id", parsed.id);
  if (error) teamAccessError(error.message);
  await writeAuditLogSafely({ action: "update", entityType: "user", entityId: parsed.id, diff: parsed });
  revalidatePath("/team-access");
  redirect("/team-access?updated=1");
}

"use server";

import { revalidatePath } from "next/cache";
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
  club_name: z.string().nullable().optional()
});

export async function inviteAdmin(formData: FormData) {
  await requireSuperAdmin();
  if (!hasSupabaseEnv()) {
    revalidatePath("/team-access");
    return;
  }
  const parsed = inviteSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    login_id: formData.get("login_id"),
    password: formData.get("password"),
    role: formData.get("role"),
    club_id: formData.get("club_id") || null,
    club_name: (formData.get("club_name") as string) || null
  });
  const service = createServiceRoleClient();
  let assignedClubId = parsed.club_id ?? null;
  if (parsed.role !== "super_admin" && !assignedClubId && parsed.club_name) {
    const { data: club, error: clubError } = await service
      .from("clubs")
      .select("id")
      .ilike("name", parsed.club_name.trim())
      .maybeSingle();
    if (clubError) throw new Error(clubError.message);
    if (!club) throw new Error(`Club not found: ${parsed.club_name}`);
    assignedClubId = club.id;
  }
  if (parsed.role !== "super_admin" && !assignedClubId) {
    throw new Error("Assign a club for this admin.");
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
  if (error) throw new Error(error.message);
  await service.from("users").upsert({
    id: data.user.id,
    name: parsed.name,
    email: parsed.email,
    login_id: parsed.login_id,
    role: parsed.role,
    club_id: parsed.role === "super_admin" ? null : assignedClubId,
    status: "active"
  });
  await writeAuditLog({ action: "admin.create_fixed_access", entityType: "user", entityId: data.user.id, diff: { ...parsed, password: "[redacted]" } });
  revalidatePath("/team-access");
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
    return;
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
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "update", entityType: "user", entityId: parsed.id, diff: parsed });
  revalidatePath("/team-access");
}

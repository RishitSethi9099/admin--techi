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

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

function teamAccessError(message: string): never {
  redirect(`/team-access?error=${encodeURIComponent(message)}`);
}

function isAlreadyRegisteredError(message: string) {
  return /already\s+(been\s+)?registered|already\s+exists|already\s+registered/i.test(message);
}

function databaseSetupMessage(message: string) {
  if (message.includes("super_admin_has_no_required_club")) {
    return "Database constraint is still on the old Team Access schema. Run migration 006_event_ops_club_access.sql in Supabase, then try again.";
  }
  if (message.includes("admin_club_access") && message.includes("does not exist")) {
    return "Database table admin_club_access is missing. Run migration 006_event_ops_club_access.sql in Supabase, then try again.";
  }
  return message;
}

async function writeAuditLogSafely(input: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}

async function deleteAuthUserSafely(service: ServiceRoleClient, userId: string) {
  try {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) console.error("Auth cleanup failed", error.message);
  } catch (error) {
    console.error("Auth cleanup failed", error);
  }
}

async function findAuthUserByEmail(service: ServiceRoleClient, email: string) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) teamAccessError(error.message);
    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
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
  let authUserId = data.user?.id ?? null;
  let shouldDeleteAuthUserOnFailure = Boolean(authUserId);

  if (error) {
    if (!isAlreadyRegisteredError(error.message)) {
      teamAccessError(error.message);
    }

    const existingAuthUser = await findAuthUserByEmail(service, parsed.email);
    if (!existingAuthUser) teamAccessError(error.message);

    const { data: existingProfile, error: existingProfileError } = await service
      .from("users")
      .select("id")
      .eq("id", existingAuthUser.id)
      .maybeSingle();
    if (existingProfileError) teamAccessError(databaseSetupMessage(existingProfileError.message));
    if (existingProfile) teamAccessError("This email is already linked to an admin account.");

    authUserId = existingAuthUser.id;
    shouldDeleteAuthUserOnFailure = false;
  }

  if (!authUserId) teamAccessError("Supabase created no auth user. Try again.");
  const primaryClubId = parsed.role === "club_admin" ? assignedClubId : parsed.role === "event_ops" ? assignedClubIds[0] : null;
  const { error: profileError } = await service.from("users").upsert({
    id: authUserId,
    name: parsed.name,
    email: parsed.email,
    login_id: parsed.login_id,
    role: parsed.role,
    club_id: primaryClubId,
    status: "active"
  });
  if (profileError) {
    if (shouldDeleteAuthUserOnFailure) await deleteAuthUserSafely(service, authUserId);
    teamAccessError(databaseSetupMessage(profileError.message));
  }
  if (parsed.role === "event_ops") {
    const { error: deleteAccessError } = await service.from("admin_club_access").delete().eq("user_id", authUserId);
    if (deleteAccessError) {
      if (shouldDeleteAuthUserOnFailure) await deleteAuthUserSafely(service, authUserId);
      teamAccessError(databaseSetupMessage(deleteAccessError.message));
    }

    const { error: accessError } = await service
      .from("admin_club_access")
      .insert(assignedClubIds.map((clubId) => ({
        user_id: authUserId,
        club_id: clubId
      })));
    if (accessError) {
      if (shouldDeleteAuthUserOnFailure) await deleteAuthUserSafely(service, authUserId);
      teamAccessError(databaseSetupMessage(accessError.message));
    }
  }
  await writeAuditLogSafely({ action: "admin.create_fixed_access", entityType: "user", entityId: authUserId, diff: { ...parsed, password: "[redacted]" } });
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

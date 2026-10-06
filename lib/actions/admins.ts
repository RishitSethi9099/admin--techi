"use server";

import { randomInt } from "node:crypto";
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
  // a login ID can't have spaces: "Tvishi Upadhyay" -> "tvishi.upadhyay"
  const rawLoginId = String(formData.get("login_id") ?? "").trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
  const check = inviteSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    login_id: rawLoginId,
    password: formData.get("password"),
    role: formData.get("role"),
    club_id: formData.get("club_id") || null,
    club_ids: formData.getAll("club_ids").filter(Boolean),
    club_name: (formData.get("club_name") as string) || null
  });
  if (!check.success) {
    // show what's wrong on the page instead of crashing it
    const field = String(check.error.issues[0]?.path[0] ?? "");
    const messages: Record<string, string> = {
      name: "Enter the admin's name (at least 2 letters).",
      email: "Enter a valid email address.",
      login_id: "Login ID needs at least 3 characters: letters, numbers, dots, dashes or underscores.",
      password: "Password must be at least 8 characters.",
      role: "Pick a role.",
      club_id: "Pick a club for this admin.",
      club_ids: "Pick the clubs for this Ops / POC admin."
    };
    teamAccessError(messages[field] ?? "Some details are missing or not valid. Check the form and try again.");
  }
  const parsed = check.data;
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


/* ---------------- bulk club admins (spreadsheet upload) ---------------- */

export type BulkClubAdminRow = { club_id?: string; club: string; name: string; email: string; whatsapp?: string };
export type BulkClubAdminResult = {
  row: number;
  club: string;
  name: string;
  email: string;
  whatsapp: string;
  status: "created" | "skipped" | "failed";
  message: string;
  login_id?: string;
  password?: string;
};

const bulkRowSchema = z.object({
  club_id: z.string().optional(),
  club: z.string().trim().max(200),
  name: z.string().trim().min(2, "Name is missing.").max(120),
  email: z.string().trim().toLowerCase().email("Email is not valid."),
  whatsapp: z.string().trim().max(30).optional()
});

// No look-alike characters (0/O, 1/l/I), grouped so it can be read out or typed easily.
function generatePassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const chars = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "club";
}

/**
 * Creates club admin accounts from uploaded spreadsheet rows (send at most 10 per call).
 * Returns each generated password once; passwords are not stored anywhere readable.
 */
export async function bulkCreateClubAdmins(input: { rows: BulkClubAdminRow[]; startRow: number }): Promise<BulkClubAdminResult[]> {
  await requireSuperAdmin();
  const rows = input.rows.slice(0, 10);
  const base = (row: BulkClubAdminRow, i: number) => ({
    row: input.startRow + i,
    club: row.club ?? "",
    name: row.name ?? "",
    email: (row.email ?? "").trim().toLowerCase(),
    whatsapp: row.whatsapp ?? ""
  });
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return rows.map((row, i) => ({ ...base(row, i), status: "failed", message: "Supabase is not connected." }));
  }

  const service = createServiceRoleClient();
  const { data: clubs, error: clubsError } = await service.from("clubs").select("id,name,short_name,slug");
  if (clubsError) return rows.map((row, i) => ({ ...base(row, i), status: "failed", message: clubsError.message }));
  const findClub = (row: BulkClubAdminRow) => {
    if (row.club_id) {
      const byId = clubs.find((club) => club.id === row.club_id);
      if (byId) return byId;
    }
    const key = row.club.trim().toLowerCase();
    return clubs.find((club) => [club.name, club.short_name, club.slug].some((v) => (v ?? "").trim().toLowerCase() === key)) ?? null;
  };

  const results: BulkClubAdminResult[] = [];
  for (const [i, raw] of rows.entries()) {
    const info = base(raw, i);
    const parsed = bulkRowSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ ...info, status: "failed", message: parsed.error.issues[0]?.message ?? "Row is not valid." });
      continue;
    }
    const row = parsed.data;
    const club = findClub(raw);
    if (!club) {
      results.push({ ...info, status: "failed", message: `Club not found: ${row.club}` });
      continue;
    }
    info.club = club.short_name || club.name;

    const { data: existing } = await service.from("users").select("id").eq("email", row.email).limit(1).maybeSingle();
    if (existing) {
      results.push({ ...info, status: "skipped", message: "This email already has an admin account." });
      continue;
    }

    // unique login ID: <club>-admin, <club>-admin-2, ...
    const stem = `${slugify(club.short_name || club.slug || club.name)}-admin`;
    const { data: taken } = await service.from("users").select("login_id").ilike("login_id", `${stem}%`);
    const used = new Set((taken ?? []).map((item) => (item.login_id ?? "").toLowerCase()));
    let loginId = stem;
    for (let n = 2; used.has(loginId); n++) loginId = `${stem}-${n}`;

    const password = generatePassword();
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: { name: row.name, login_id: loginId, password_managed_by_super_admin: true }
    });
    if (createError || !created.user) {
      const message = createError && isAlreadyRegisteredError(createError.message)
        ? "This email is already registered in Supabase Auth. Use the single-account form to link it."
        : createError?.message ?? "Supabase created no user.";
      results.push({ ...info, status: "failed", message });
      continue;
    }

    const { error: profileError } = await service.from("users").upsert({
      id: created.user.id,
      name: row.name,
      email: row.email,
      login_id: loginId,
      role: "club_admin",
      club_id: club.id,
      status: "active"
    });
    if (profileError) {
      await deleteAuthUserSafely(service, created.user.id);
      results.push({ ...info, status: "failed", message: databaseSetupMessage(profileError.message) });
      continue;
    }

    await writeAuditLogSafely({
      action: "admin.bulk_create_club_admin",
      entityType: "user",
      entityId: created.user.id,
      diff: { name: row.name, email: row.email, login_id: loginId, club_id: club.id, password: "[redacted]" }
    });
    results.push({ ...info, status: "created", message: "Account created.", login_id: loginId, password });
  }

  revalidatePath("/team-access");
  return results;
}


/* ---------------- delete admin accounts ---------------- */

export type DeleteAdminsResult = { ok: boolean; message: string; deleted: string[] };

/**
 * Permanently deletes admin accounts (login + profile). Old records stay; they
 * just lose the link to the person (needs migration 013). Never deletes the
 * signed-in Super Admin or the last active Super Admin.
 */
export async function deleteAdmins(input: { ids: string[] }): Promise<DeleteAdminsResult> {
  const profile = await requireSuperAdmin();
  const ids = Array.from(new Set(z.array(z.string().uuid()).max(200).parse(input.ids)));
  if (!ids.length) return { ok: false, message: "Select at least one account.", deleted: [] };
  if (ids.includes(profile.id)) return { ok: false, message: "You can't delete your own account. Ask another Super Admin.", deleted: [] };
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, message: "Supabase is not connected.", deleted: [] };

  const service = createServiceRoleClient();
  const { data: targets, error: targetError } = await service.from("users").select("id,name,email,role,status").in("id", ids);
  if (targetError) return { ok: false, message: targetError.message, deleted: [] };
  const { count: activeSupers } = await service.from("users").select("id", { count: "exact", head: true }).eq("role", "super_admin").eq("status", "active");
  const supersDeleted = (targets ?? []).filter((t) => t.role === "super_admin" && t.status === "active").length;
  if (supersDeleted && (activeSupers ?? 0) - supersDeleted < 1) {
    return { ok: false, message: "At least one active Super Admin must remain.", deleted: [] };
  }

  const deleted: string[] = [];
  const failures: string[] = [];
  for (const target of targets ?? []) {
    const { error } = await service.auth.admin.deleteUser(target.id);
    let failure = error && !/not\s*found/i.test(error.message) ? error.message : null;
    if (!failure) {
      // login already gone (or never existed): make sure the profile row is gone too
      const { error: profileError } = await service.from("users").delete().eq("id", target.id);
      if (profileError) failure = profileError.message;
    }
    if (failure) {
      const hint = /append-only|approve or reject|database error/i.test(failure) ? " Run Supabase migration 013_allow_admin_account_deletion.sql, then try again." : "";
      failures.push(`${target.name}: ${failure}.${hint}`);
      continue;
    }
    deleted.push(target.id);
    await writeAuditLogSafely({ action: "admin.delete", entityType: "user", entityId: target.id, diff: { name: target.name, email: target.email, role: target.role } });
  }

  revalidatePath("/team-access");
  const done = `${deleted.length} account${deleted.length === 1 ? "" : "s"} deleted.`;
  return failures.length
    ? { ok: deleted.length > 0, message: `${deleted.length ? done + " " : ""}Not deleted: ${failures.join(" ")}`, deleted }
    : { ok: true, message: done, deleted };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getAssignedClubIds } from "@/lib/data";

const billboardSchema = z.object({
  club_id: z.string().uuid(),
  event_slot_id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).optional(),
  about_club: z.string().min(3),
  type: z.enum(["video", "poster"]),
  media_url: z.string().url().or(z.literal("")).nullable(),
  display_order: z.coerce.number().int().default(0),
  active: z.coerce.boolean().default(false)
});

const BILLBOARD_VIDEO_MAX_BYTES = 3 * 1024 * 1024;
const BILLBOARD_POSTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

type BillboardEventSlot = {
  id: string;
  club_id: string;
  event_name: string;
  event_tier: "major" | "minor";
  required_media_type: "video" | "poster";
};

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

function validateBillboardFile(file: File | null, type: "video" | "poster") {
  if (!file || file.size === 0) return;

  if (type === "video") {
    if (file.type !== "video/mp4") throw new Error("Billboard video must be MP4.");
    if (file.size > BILLBOARD_VIDEO_MAX_BYTES) throw new Error("Billboard video must be under 3 MB.");
    return;
  }

  if (!BILLBOARD_POSTER_TYPES.includes(file.type)) {
    throw new Error("Billboard poster must be PNG, JPG, or WebP.");
  }
}

async function uploadMediaFile({
  supabase,
  bucket,
  clubId,
  file
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  bucket: "billboard-media" | "event-posters";
  clubId: string;
  file: File | null;
}) {
  if (!file || file.size === 0) return null;

  const path = `${clubId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function saveBillboard(_previousState: { ok: boolean; message: string } | null, formData: FormData) {
  const profile = await requireProfile();
  if (!hasSupabaseEnv()) {
    revalidatePath("/billboards");
    return { ok: true, message: "Submitted. Wait for Super Admin approval." };
  }
  const parsed = billboardSchema.parse({
    club_id: formData.get("club_id"),
    event_slot_id: formData.get("event_slot_id") || null,
    title: formData.get("title"),
    about_club: formData.get("about_club"),
    type: formData.get("type"),
    media_url: formData.get("media_url") || "",
    display_order: formData.get("display_order") || 0,
    active: formData.get("active") === "on"
  });
  if (profile.role === "club_admin" && parsed.club_id !== profile.club_id) return { ok: false, message: "Wrong club scope." };
  if (profile.role === "event_ops") {
    const assignedClubIds = await getAssignedClubIds(profile.id);
    if (!assignedClubIds.includes(parsed.club_id)) return { ok: false, message: "Wrong event ops club scope." };
  }
  const supabase = createSupabaseServerClient();
  let slot: BillboardEventSlot | null = null;
  if (parsed.event_slot_id) {
    const { data: slotData, error: slotError } = await supabase
      .from("event_slots")
      .select("id,club_id,event_name,event_tier,required_media_type")
      .eq("id", parsed.event_slot_id)
      .eq("active", true)
      .maybeSingle();
    if (slotError) return { ok: false, message: slotError.message };
    if (!slotData) return { ok: false, message: "Event upload slot was not found." };
    slot = slotData as BillboardEventSlot;
    if (slot.club_id !== parsed.club_id) return { ok: false, message: "This event slot does not belong to the selected club." };
    if (slot.required_media_type !== parsed.type) return { ok: false, message: `${slot.event_name} requires a ${slot.required_media_type} upload.` };
  }
  const mediaFile = formData.get("media_file");
  const billboardFile = mediaFile instanceof File ? mediaFile : null;
  try {
    validateBillboardFile(billboardFile, parsed.type);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid upload file." };
  }
  const uploadedUrl = await uploadMediaFile({
    supabase,
    bucket: "billboard-media",
    clubId: parsed.club_id,
    file: billboardFile
  });
  const payload = {
    ...parsed,
    title: parsed.title || slot?.event_name || "Event promotion",
    event_name: slot?.event_name ?? parsed.title ?? null,
    event_tier: slot?.event_tier ?? null,
    media_url: uploadedUrl ?? parsed.media_url
  };
  if (!payload.media_url) return { ok: false, message: "Upload a poster/video file or paste a media URL." };

  if (profile.role !== "super_admin") {
    const { data, error } = await supabase
      .from("approval_requests")
      .insert({
        requested_by: profile.id,
        requester_name: profile.name,
        requester_role: profile.role,
        resource_type: "billboard",
        resource_id: null,
        action: "promotion_submission",
        risk: "medium",
        status: "pending",
        reason: "Promotion submission requires Super Admin approval before publication.",
        previous_value: {},
        proposed_value: payload
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };
    await writeAuditLog({ action: "approval_request.create", entityType: "approval_request", entityId: data.id, diff: payload });
    revalidatePath("/billboards");
    revalidatePath("/approvals");
    return { ok: true, message: "Submitted. Wait for Super Admin approval." };
  }
  const { data, error } = await supabase.from("billboards").insert(payload).select("id").single();
  if (error) return { ok: false, message: error.message };
  await writeAuditLog({ action: "create", entityType: "billboard", entityId: data.id, diff: payload });
  revalidatePath("/billboards");
  return { ok: true, message: "Billboard published." };
}

const approvalSchema = z.object({
  id: z.string().uuid(),
  entity: z.enum(["billboards", "events"]),
  status: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().optional()
});

export async function approveContent(formData: FormData) {
  await requireSuperAdmin();
  if (!hasSupabaseEnv()) {
    revalidatePath("/billboards");
    revalidatePath("/events");
    return;
  }
  const parsed = approvalSchema.parse(Object.fromEntries(formData));
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from(parsed.entity)
    .update({
      status: parsed.status,
      rejection_reason: parsed.status === "rejected" ? parsed.rejection_reason : null,
      approved_at: new Date().toISOString()
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: parsed.status === "approved" ? "approve" : "reject", entityType: parsed.entity, entityId: parsed.id, diff: parsed });
  revalidatePath(parsed.entity === "billboards" ? "/billboards" : "/events");
}

const memberSchema = z.object({
  name: z.string().min(2),
  photo_url: z.string().url().or(z.literal("")).nullable(),
  position: z.string().min(2),
  display_order: z.coerce.number().int().default(0)
});

export async function saveTeamMember(formData: FormData) {
  await requireSuperAdmin();
  if (!hasSupabaseEnv()) {
    revalidatePath("/team-members");
    return;
  }
  const parsed = memberSchema.parse(Object.fromEntries(formData));
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("team_members").insert(parsed).select("id").single();
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "create", entityType: "team_member", entityId: data.id, diff: parsed });
  revalidatePath("/team-members");
}

const eventSchema = z.object({
  club_id: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(3),
  event_datetime: z.string().min(1),
  venue: z.string().min(2),
  registration_url: z.string().url().or(z.literal("")).nullable(),
  poster_url: z.string().url().or(z.literal("")).nullable()
});

export async function saveEvent(formData: FormData) {
  const profile = await requireProfile();
  if (!hasSupabaseEnv()) {
    revalidatePath("/events");
    return;
  }
  const parsed = eventSchema.parse(Object.fromEntries(formData));
  if (profile.role === "club_admin" && parsed.club_id !== profile.club_id) throw new Error("Wrong club scope.");
  if (profile.role === "event_ops") {
    const assignedClubIds = await getAssignedClubIds(profile.id);
    if (!assignedClubIds.includes(parsed.club_id)) throw new Error("Wrong event ops club scope.");
  }
  const supabase = createSupabaseServerClient();
  const posterFile = formData.get("poster_file");
  const uploadedPosterUrl = await uploadMediaFile({
    supabase,
    bucket: "event-posters",
    clubId: parsed.club_id,
    file: posterFile instanceof File ? posterFile : null
  });
  const payload = {
    ...parsed,
    poster_url: uploadedPosterUrl ?? parsed.poster_url
  };
  if (profile.role !== "super_admin") {
    const { data, error } = await supabase
      .from("approval_requests")
      .insert({
        requested_by: profile.id,
        requester_name: profile.name,
        requester_role: profile.role,
        resource_type: "event",
        resource_id: null,
        action: "event_submission",
        risk: profile.role === "event_ops" ? "high" : "medium",
        status: "pending",
        reason: "Event changes require Super Admin approval before publication.",
        previous_value: {},
        proposed_value: payload
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeAuditLog({ action: "approval_request.create", entityType: "approval_request", entityId: data.id, diff: payload });
    revalidatePath("/events");
    revalidatePath("/approvals");
    return;
  }
  const { data, error } = await supabase.from("events").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "create", entityType: "event", entityId: data.id, diff: payload });
  revalidatePath("/events");
}


"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getAssignedClubIds } from "@/lib/data";
import { istToIso } from "@/lib/event-time";

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

const BILLBOARD_VIDEO_MAX_BYTES = 7 * 1024 * 1024;
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
    if (file.size > BILLBOARD_VIDEO_MAX_BYTES) throw new Error("Billboard video must be under 7 MB.");
    return;
  }

  if (!BILLBOARD_POSTER_TYPES.includes(file.type)) {
    throw new Error("Billboard poster must be PNG, JPG, or WebP.");
  }
}

function httpUrlOrEmpty(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function validateEventPoster(file: File | null) {
  if (!file || file.size === 0) return;
  if (!BILLBOARD_POSTER_TYPES.includes(file.type)) throw new Error("Event poster must be PNG, JPG, or WebP.");
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
  id: z.string().uuid().optional(),
  club_id: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(1200),
  start_datetime: z.string().min(1),
  end_datetime: z.string().min(1),
  venue: z.string().trim().min(2).max(160),
  registration_url: z.preprocess(httpUrlOrEmpty, z.string().url().or(z.literal(""))),
  poster_url: z.preprocess(httpUrlOrEmpty, z.string().url().or(z.literal(""))),
  status: z.enum(["draft", "published"]).default("draft")
}).superRefine((value, ctx) => {
  const start = Date.parse(value.start_datetime);
  const end = Date.parse(value.end_datetime);
  if (Number.isNaN(start)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["start_datetime"], message: "Pick an event date and start time." });
  if (Number.isNaN(end)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_datetime"], message: "Pick an end date and end time." });
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_datetime"], message: "End must be after start. Tick \"Runs overnight\" if the event ends on a later day." });
  }
});

async function assertEventClubScope(profile: Awaited<ReturnType<typeof requireProfile>>, clubId: string) {
  if (profile.role === "club_admin" && clubId !== profile.club_id) throw new Error("Wrong club scope.");
  if (profile.role === "event_ops") {
    const assignedClubIds = await getAssignedClubIds(profile.id);
    if (!assignedClubIds.includes(clubId)) throw new Error("Wrong event ops club scope.");
  }
}

export type EventActionResult = { ok: boolean; message: string; id?: string };

function friendlyEventError(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = String(issue?.path?.[0] ?? "");
    const labels: Record<string, string> = {
      club_id: "Select a club.",
      title: "Event title must be 3–120 characters.",
      description: "About the event must be 3–1200 characters.",
      venue: "Venue must be 2–160 characters.",
      registration_url: "Registration link must start with http:// or https://.",
      poster_url: "Poster URL must start with http:// or https://."
    };
    return labels[field] ?? issue?.message ?? "Some fields are not valid.";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/body exceeded|payload too large|413/i.test(message)) return "The file was too big to send. Refresh the page and try again.";
  if (/scope/i.test(message)) return "You can only manage events for your own club.";
  return message || "Something went wrong. Please try again.";
}

export async function saveEvent(formData: FormData): Promise<EventActionResult> {
  try {
    return await saveEventOrThrow(formData);
  } catch (error) {
    return { ok: false, message: friendlyEventError(error) };
  }
}

async function saveEventOrThrow(formData: FormData): Promise<EventActionResult> {
  const profile = await requireProfile();
  if (!hasSupabaseEnv()) {
    revalidatePath("/events");
    return { ok: true, message: "Saved (demo mode, no database connected)." };
  }
  const field = (name: string) => String(formData.get(name) ?? "");
  const eventDate = field("event_date");
  const overnight = formData.get("overnight") === "on";
  const endDate = overnight ? field("end_date") : eventDate;
  const start_datetime = istToIso(eventDate, field("start_hour"), field("start_minute"), field("start_meridiem"));
  const end_datetime = istToIso(endDate, field("end_hour"), field("end_minute"), field("end_meridiem"));
  const parsed = eventSchema.parse({
    id: formData.get("id") || undefined,
    club_id: formData.get("club_id"),
    title: formData.get("title"),
    description: formData.get("description"),
    start_datetime: start_datetime,
    end_datetime: end_datetime,
    venue: formData.get("venue"),
    registration_url: formData.get("registration_url"),
    poster_url: formData.get("poster_url"),
    status: formData.get("status") === "published" ? "published" : "draft"
  });
  await assertEventClubScope(profile, parsed.club_id);
  const supabase = createSupabaseServerClient();

  // Which of the club's events this schedule belongs to (decides major / minor).
  const slotId = field("event_slot_id").trim() || null;
  let tier: "major" | "minor" = "minor";
  let slotName: string | null = null;
  if (slotId) {
    if (!z.string().uuid().safeParse(slotId).success) throw new Error("Pick which event this is.");
    const { data: slot, error: slotError } = await supabase
      .from("event_slots")
      .select("id,club_id,event_name,event_tier,active")
      .eq("id", slotId)
      .maybeSingle();
    if (slotError) throw new Error(slotError.message);
    if (!slot || !slot.active) throw new Error("That event is no longer in the club's event list. Ask the Super Admin.");
    if (slot.club_id !== parsed.club_id) throw new Error("That event belongs to a different club.");
    tier = slot.event_tier === "major" ? "major" : "minor";
    slotName = slot.event_name; // the listed event name always wins
  } else if (!parsed.id && profile.role !== "super_admin") {
    throw new Error("Pick which of your club's events this schedule is for.");
  } else if (profile.role === "super_admin") {
    tier = field("event_tier") === "major" ? "major" : "minor";
  }

  const posterFile = formData.get("poster_file");
  const poster = posterFile instanceof File ? posterFile : null;
  validateEventPoster(poster);
  const uploadedPosterUrl = await uploadMediaFile({
    supabase,
    bucket: "event-posters",
    clubId: parsed.club_id,
    file: poster
  });
  if (slotName) parsed.title = slotName;
  const payload = {
    ...parsed,
    id: undefined,
    event_datetime: parsed.start_datetime,
    poster_url: (uploadedPosterUrl ?? parsed.poster_url) || null,
    registration_url: parsed.registration_url || null,
    // only set when known, so editing an old unlinked event doesn't need migration 014
    ...(slotId || profile.role === "super_admin" ? { event_slot_id: slotId, event_tier: tier } : {})
  };
  const query = parsed.id
    ? supabase.from("events").update(payload).eq("id", parsed.id).select("id").single()
    : supabase.from("events").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) {
    if (error.code === "23505" || /events_one_per_slot/.test(error.message)) throw new Error("This event already has a schedule. Edit that one instead of adding a second.");
    if (error.code === "42703" || /event_slot_id/.test(error.message)) throw new Error("Run Supabase migration 014_events_linked_to_slots.sql first.");
    throw new Error(error.message);
  }
  await writeAuditLog({ action: parsed.id ? "update" : "create", entityType: "event", entityId: data.id, diff: payload });
  revalidatePath("/events");
  const visibility = parsed.status === "published" ? "It is published and will show on the website." : "It is saved as a draft and is not on the website yet.";
  return {
    ok: true,
    id: data.id,
    message: parsed.id ? `Changes to “${parsed.title}” saved. ${visibility}` : `“${parsed.title}” was created. ${visibility}`
  };
}

const deleteEventSchema = z.object({ id: z.string().uuid(), club_id: z.string().uuid() });

export async function deleteEvent(formData: FormData): Promise<EventActionResult> {
  try {
    return await deleteEventOrThrow(formData);
  } catch (error) {
    return { ok: false, message: friendlyEventError(error) };
  }
}

async function deleteEventOrThrow(formData: FormData): Promise<EventActionResult> {
  const profile = await requireProfile();
  if (!hasSupabaseEnv()) {
    revalidatePath("/events");
    return { ok: true, message: "Event deleted." };
  }
  const parsed = deleteEventSchema.parse(Object.fromEntries(formData));
  await assertEventClubScope(profile, parsed.club_id);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("events").delete().eq("id", parsed.id);
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "delete", entityType: "event", entityId: parsed.id, diff: parsed });
  revalidatePath("/events");
  return { ok: true, message: "Event deleted." };
}




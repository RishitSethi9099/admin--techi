"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createServiceRoleClient, createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getMyClubIds } from "@/lib/data";

export type BillboardActionResult = { ok: boolean; message: string };

const schema = z.object({ id: z.string().uuid(), live: z.boolean() });

/** Super Admin: take an approved video/poster off the website (or put it back). The upload is kept. */
export async function setBillboardLive(input: z.input<typeof schema>): Promise<BillboardActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "super_admin") return { ok: false, message: "Only the Super Admin can take uploads down." };
    const { id, live } = schema.parse(input);
    if (!hasSupabaseEnv()) return { ok: false, message: "No database is connected." };
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("billboards").update({ active: live }).eq("id", id).select("id,event_name,title").single();
    if (error) return { ok: false, message: error.message };
    await writeAuditLog({ action: live ? "billboard.restore" : "billboard.take_down", entityType: "billboard", entityId: id, diff: { active: live } });
    revalidatePath("/billboards");
    const name = data?.event_name || data?.title || "Upload";
    return { ok: true, message: live ? `${name} is back on the website.` : `${name} was taken down from the website.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the upload." };
  }
}

/** True when a billboard is a poster the Super Admin pulled from the club's event schedule. */
export async function isPulledFromSchedule(mediaUrl: string | null | undefined) {
  return Boolean(mediaUrl && mediaUrl.includes("/event-posters/"));
}

/**
 * Super Admin: a club put a poster on its event schedule but never uploaded a billboard for that
 * minor event. Publish that schedule poster to the website screens. The club admin sees it was
 * pulled by the Super Admin and can replace it (Edit submission) or delete it.
 */
export async function pullPosterFromSchedule(slotId: string): Promise<BillboardActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "super_admin") return { ok: false, message: "Only the Super Admin can pull posters." };
    if (!z.string().uuid().safeParse(slotId).success) return { ok: false, message: "Unknown event." };
    if (!hasSupabaseEnv()) return { ok: false, message: "No database is connected." };
    const supabase = createSupabaseServerClient();

    const { data: slot, error: slotError } = await supabase
      .from("event_slots")
      .select("id,club_id,event_name,event_tier,required_media_type")
      .eq("id", slotId)
      .maybeSingle();
    if (slotError || !slot) return { ok: false, message: slotError?.message ?? "Event not found." };
    if (slot.event_tier !== "minor" || slot.required_media_type !== "poster") {
      return { ok: false, message: "Only minor event posters can be pulled. Major events need a video." };
    }

    const { data: live } = await supabase
      .from("billboards")
      .select("id")
      .eq("event_slot_id", slotId)
      .eq("status", "approved")
      .eq("active", true)
      .limit(1);
    if (live && live.length) return { ok: false, message: `${slot.event_name} already has a poster on the website.` };

    const { data: events, error: eventError } = await supabase
      .from("events")
      .select("id,poster_url,description,deleted_at")
      .eq("event_slot_id", slotId)
      .not("poster_url", "is", null);
    if (eventError) return { ok: false, message: eventError.message };
    const event = (events ?? []).find((e) => !e.deleted_at && e.poster_url);
    if (!event) return { ok: false, message: `${slot.event_name} has no poster in its event schedule yet.` };

    const { data: created, error } = await supabase
      .from("billboards")
      .insert({
        club_id: slot.club_id,
        event_slot_id: slot.id,
        title: slot.event_name,
        event_name: slot.event_name,
        event_tier: "minor",
        type: "poster",
        media_url: event.poster_url,
        about_club: (event.description as string | null)?.trim() || slot.event_name,
        status: "approved",
        active: true,
        approved_by: profile.id,
        approved_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };

    await writeAuditLog({
      action: "billboard.pulled_from_schedule",
      entityType: "billboard",
      entityId: created.id,
      diff: { event_slot_id: slot.id, event_name: slot.event_name, media_url: event.poster_url }
    });
    revalidatePath("/billboards");
    return { ok: true, message: `${slot.event_name}: schedule poster is now on the website.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not pull the poster." };
  }
}

/** Club admin (or the Super Admin): delete a poster the Super Admin pulled from the event schedule. */
export async function deletePulledPoster(billboardId: string): Promise<BillboardActionResult> {
  try {
    const profile = await requireProfile();
    if (!z.string().uuid().safeParse(billboardId).success) return { ok: false, message: "Unknown poster." };
    if (!hasSupabaseEnv()) return { ok: false, message: "No database is connected." };
    const service = createServiceRoleClient();
    const { data: billboard, error: readError } = await service
      .from("billboards")
      .select("id,club_id,media_url,event_name,title")
      .eq("id", billboardId)
      .maybeSingle();
    if (readError || !billboard) return { ok: false, message: readError?.message ?? "Poster not found." };
    if (profile.role !== "super_admin" && !(await getMyClubIds(profile)).includes(billboard.club_id as string)) {
      return { ok: false, message: "You can only delete your own club's posters." };
    }
    if (!(await isPulledFromSchedule(billboard.media_url as string | null))) {
      return { ok: false, message: "Only posters pulled from the event schedule can be deleted here." };
    }
    // the file itself stays: it is still the poster on the club's event schedule
    const { error } = await service.from("billboards").delete().eq("id", billboardId);
    if (error) return { ok: false, message: error.message };
    await writeAuditLog({ action: "billboard.pulled_poster_deleted", entityType: "billboard", entityId: billboardId, diff: { event_name: billboard.event_name } });
    revalidatePath("/billboards");
    return { ok: true, message: `${billboard.event_name || billboard.title || "Poster"} was removed from the website.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not delete the poster." };
  }
}

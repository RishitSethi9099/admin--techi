"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { currentOrder, loadRotation, rotationFromRow, type RotationSettings } from "@/lib/screen-rotation";

export type RotationActionResult = { ok: boolean; message: string; settings?: RotationSettings };

const inputSchema = z.object({
  // save: keep this order on the screens; roll: start rotating from this order; stop: freeze what's showing now
  action: z.enum(["save", "roll", "stop"]),
  order: z.array(z.string().uuid()).max(50),
  direction: z.enum(["up", "down"]),
  intervalMinutes: z.number().int().min(5).max(1440)
});

export async function updateScreenRotation(input: z.input<typeof inputSchema>): Promise<RotationActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "super_admin") return { ok: false, message: "Only the Super Admin can change the screen order." };
    const parsed = inputSchema.parse(input);
    if (!hasSupabaseEnv()) return { ok: false, message: "No database is connected." };

    const supabase = createSupabaseServerClient();
    const { data: slots, error: slotError } = await supabase
      .from("event_slots")
      .select("id")
      .eq("active", true)
      .eq("event_tier", "major");
    if (slotError) throw new Error(slotError.message);
    const majorIds = (slots ?? []).map((slot) => slot.id as string);

    const current = await loadRotation(supabase as never);
    if (current.missingTable) return { ok: false, message: "Run Supabase migration 011_major_screen_rotation.sql first." };
    if (current.error) throw new Error(current.error);

    const now = new Date();
    let order = parsed.order.filter((id) => majorIds.includes(id));
    if (parsed.action === "stop") order = currentOrder(current.settings, majorIds, now.getTime());
    const rolling = parsed.action === "roll" || (parsed.action === "save" && current.settings.rolling);

    const row = {
      id: true,
      slot_order: order,
      rolling,
      direction: parsed.direction,
      interval_minutes: parsed.intervalMinutes,
      // any change while rolling restarts the clock from the order the admin is looking at
      started_at: rolling ? now.toISOString() : null,
      updated_by: profile.id
    };
    const { data, error } = await supabase
      .from("major_screen_rotation")
      .upsert(row, { onConflict: "id" })
      .select("slot_order,rolling,direction,interval_minutes,started_at")
      .single();
    if (error) throw new Error(error.message);

    await writeAuditLog({ action: `screen_rotation_${parsed.action}`, entityType: "major_screen_rotation", entityId: null, diff: row });
    revalidatePath("/billboards");

    const every = parsed.intervalMinutes === 60 ? "every hour" : `every ${parsed.intervalMinutes} minutes`;
    const message =
      parsed.action === "roll"
        ? `Rotation started. The order changes ${every}.`
        : parsed.action === "stop"
          ? "Rotation stopped. The current order stays on the screens."
          : rolling
            ? `Order saved. Rotation continues from this order, changing ${every}.`
            : "Order saved. The screens keep this order.";
    return { ok: true, message, settings: rotationFromRow(data) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the screen order." };
  }
}

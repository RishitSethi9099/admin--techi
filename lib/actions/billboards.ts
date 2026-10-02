"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

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

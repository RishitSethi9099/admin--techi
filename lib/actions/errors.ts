"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type ErrorActionResult = { ok: boolean; message: string };

const schema = z.object({ id: z.string().uuid(), resolved: z.boolean() });

/** Mark an error fixed or reopen it. The database checks the error belongs to one of your clubs. */
export async function setErrorResolved(input: z.input<typeof schema>): Promise<ErrorActionResult> {
  try {
    await requirePermission("errors:read");
    const { id, resolved } = schema.parse(input);
    if (!hasSupabaseEnv()) return { ok: false, message: "No database is connected." };
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("set_crash_log_resolved", { log_id: id, is_resolved: resolved });
    if (error) {
      if (/set_crash_log_resolved/.test(error.message)) return { ok: false, message: "Run Supabase migration 012_crash_log_club_scope.sql first." };
      if (/not allowed/i.test(error.message)) return { ok: false, message: "You can only change errors for your own club." };
      return { ok: false, message: error.message };
    }
    revalidatePath("/", "layout"); // updates the sidebar count too
    return { ok: true, message: resolved ? "Marked as fixed." : "Reopened." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update the error." };
  }
}

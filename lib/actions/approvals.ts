"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireProfile, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createServiceRoleClient, createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

const requestSchema = z.object({
  resource_type: z.string().min(2),
  resource_id: z.string().uuid().nullable().optional(),
  action: z.string().min(2),
  risk: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  reason: z.string().min(4),
  previous_value: z.string().optional(),
  proposed_value: z.string().min(2)
});

function parseJsonField(value: string | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

export async function createApprovalRequest(formData: FormData) {
  const profile = await requireProfile();
  await requirePermission("approvals:request");
  const parsed = requestSchema.parse({
    resource_type: formData.get("resource_type"),
    resource_id: formData.get("resource_id") || null,
    action: formData.get("action"),
    risk: formData.get("risk") || "medium",
    reason: formData.get("reason"),
    previous_value: formData.get("previous_value") || undefined,
    proposed_value: formData.get("proposed_value")
  });

  if (!hasSupabaseEnv()) {
    revalidatePath("/approvals");
    return;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .insert({
      requested_by: profile.id,
      requester_name: profile.name,
      requester_role: profile.role,
      resource_type: parsed.resource_type,
      resource_id: parsed.resource_id,
      action: parsed.action,
      risk: parsed.risk,
      reason: parsed.reason,
      previous_value: parseJsonField(parsed.previous_value),
      proposed_value: parseJsonField(parsed.proposed_value),
      status: "pending"
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({ action: "approval_request.create", entityType: "approval_request", entityId: data.id, diff: parsed });
  revalidatePath("/approvals");
}

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "clarification_requested"]),
  review_note: z.string().optional()
});

/** Turn database errors into something a person can act on. */
function friendlyReviewError(message: string) {
  if (/billboards_one_active_approved_per_club/.test(message)) {
    return "This club already has a live billboard, and the database still allows only one per club. Run migration 017_one_live_billboard_per_event.sql in Supabase, then approve again.";
  }
  if (/billboards_one_live_per_event/.test(message)) {
    return "This event already has a live billboard. Take the old one down in Billboards first, then approve this one.";
  }
  return message;
}

/** Errors inside the admin panel itself also go to the Errors page. */
async function logAdminError(message: string, context: Record<string, unknown>) {
  try {
    await createServiceRoleClient().from("crash_logs").insert({
      source: "admin",
      severity: "critical",
      error_type: "admin_action_failed",
      message: `Approvals: ${message}`.slice(0, 500),
      page_url: "/approvals",
      metadata: context
    });
  } catch {
    /* never let error logging break the page */
  }
}

export async function reviewApprovalRequest(formData: FormData) {
  // Show a message on the Approvals page instead of crashing it.
  let failure: string | null = null;
  try {
    await reviewApprovalRequestOrThrow(formData);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
    failure = friendlyReviewError(error instanceof Error ? error.message : String(error));
    await logAdminError(failure, { request_id: formData.get("id"), status: formData.get("status") });
  }
  if (failure) redirect(`/approvals?error=${encodeURIComponent(failure)}`);
}

async function reviewApprovalRequestOrThrow(formData: FormData) {
  const profile = await requireSuperAdmin();
  const parsed = reviewSchema.parse(Object.fromEntries(formData));
  if (!hasSupabaseEnv()) {
    revalidatePath("/approvals");
    return;
  }

  const supabase = createSupabaseServerClient();
  const { data: request, error: readError } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", parsed.id)
    .single();
  if (readError) throw new Error(readError.message);
  if (request.requested_by === profile.id) throw new Error("Super admins cannot approve their own requests.");

  let publishedResourceId = request.resource_id as string | null;
  if (parsed.status === "approved" && !request.resource_id) {
    if (request.resource_type === "billboard") {
      // a club re-submitting for the same event replaces its old live upload
      const slotId = (request.proposed_value as Record<string, unknown>)?.event_slot_id;
      if (typeof slotId === "string" && slotId) {
        const { error: replaceError } = await supabase
          .from("billboards")
          .update({ active: false })
          .eq("event_slot_id", slotId)
          .eq("status", "approved")
          .eq("active", true);
        if (replaceError) throw new Error(replaceError.message);
      }
      const { data: billboard, error: publishError } = await supabase
        .from("billboards")
        .insert({
          ...(request.proposed_value as Record<string, unknown>),
          status: "approved",
          active: true,
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .select("id")
        .single();
      if (publishError) throw new Error(publishError.message);
      publishedResourceId = billboard.id;
    }

    if (request.resource_type === "event") {
      const { data: event, error: publishError } = await supabase
        .from("events")
        .insert({
          ...(request.proposed_value as Record<string, unknown>),
          status: "published",
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .select("id")
        .single();
      if (publishError) throw new Error(publishError.message);
      publishedResourceId = event.id;
    }
  }

  const { error } = await supabase
    .from("approval_requests")
    .update({
      status: parsed.status,
      resource_id: publishedResourceId,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.review_note || null
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    action: `approval_request.${parsed.status}`,
    entityType: "approval_request",
    entityId: parsed.id,
    previousValue: { status: request.status },
    newValue: parsed
  });
  revalidatePath("/approvals");
}

export type RevertResult = { ok: boolean; message: string };

/**
 * Undo a decision made by mistake: the request goes back to "pending" so it can be decided again.
 * If approving it had published a billboard or event, that published copy is removed from the
 * website (the uploaded file itself stays in storage, and approving again publishes it again).
 */
export async function revertApprovalRequest(id: string): Promise<RevertResult> {
  await requireSuperAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Unknown request." };
  if (!hasSupabaseEnv()) return { ok: true, message: "Moved back to pending." };

  const supabase = createSupabaseServerClient();
  const { data: request, error: readError } = await supabase.from("approval_requests").select("*").eq("id", id).single();
  if (readError || !request) return { ok: false, message: readError?.message ?? "Request not found." };
  if (request.status === "pending") return { ok: true, message: "It's already pending." };

  let resourceId = request.resource_id as string | null;
  let removed = false;
  const table = request.resource_type === "billboard" ? "billboards" : request.resource_type === "event" ? "events" : null;
  if (request.status === "approved" && resourceId && table) {
    // only remove what this approval created (created at the moment it was approved), never an older record
    const { data: row } = await supabase.from(table).select("id, created_at").eq("id", resourceId).maybeSingle();
    const createdByApproval =
      row && request.reviewed_at && Math.abs(Date.parse(row.created_at as string) - Date.parse(request.reviewed_at as string)) < 2 * 60 * 1000;
    if (createdByApproval) {
      const { error: deleteError } = await supabase.from(table).delete().eq("id", resourceId);
      if (deleteError) {
        // could not delete (e.g. something links to it): at least take it off the website
        const takeDown = table === "billboards" ? { active: false } : { status: "draft" };
        const { error: hideError } = await supabase.from(table).update(takeDown).eq("id", resourceId);
        if (hideError) return { ok: false, message: `Could not take the published copy down: ${hideError.message}` };
      } else {
        resourceId = null;
      }
      removed = true;
    }
  }

  const { error } = await supabase
    .from("approval_requests")
    .update({ status: "pending", resource_id: resourceId, reviewed_by: null, reviewed_at: null, review_note: null })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  await writeAuditLog({
    action: "approval_request.reverted",
    entityType: "approval_request",
    entityId: id,
    previousValue: { status: request.status, reviewed_by: request.reviewed_by, resource_id: request.resource_id },
    newValue: { status: "pending", removed_published_copy: removed }
  });
  revalidatePath("/approvals");
  revalidatePath("/billboards");
  revalidatePath("/events");
  return { ok: true, message: removed ? "Moved back to pending and taken off the website." : "Moved back to pending." };
}

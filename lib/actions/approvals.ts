"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireProfile, requireSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/actions/audit";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

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

export async function reviewApprovalRequest(formData: FormData) {
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
          status: "approved",
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

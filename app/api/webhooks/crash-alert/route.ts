import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRASH_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-techi-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, demo: true, payload });
  }

  const source = payload.source ?? (payload.monitorName ? "uptime" : "sentry");
  const message = payload.message ?? payload.error?.message ?? payload.incident?.name ?? "Unhandled service alert";
  const errorType = payload.error_type ?? payload.error?.type ?? payload.incident?.id ?? message;
  const severity = payload.severity ?? payload.level ?? (payload.status === "down" ? "critical" : "warning");
  const pageUrl = payload.page_url ?? payload.url ?? payload.event?.request?.url ?? null;
  const route = payload.route ?? payload.path ?? payload.event?.request?.url ?? null;
  const requestId = request.headers.get("x-request-id") ?? payload.request_id ?? payload.event?.event_id ?? null;
  const resourceType = payload.resource_type ?? payload.entity_type ?? payload.type ?? null;
  const resourceId = payload.resource_id ?? payload.entity_id ?? payload.billboard_id ?? payload.event_id ?? null;
  const clubId = payload.club_id ?? null;

  const supabase = createServiceRoleClient();
  const { data: log, error } = await supabase
    .from("crash_logs")
    .insert({
      severity,
      message,
      page_url: pageUrl,
      source,
      error_type: errorType,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      route,
      http_status: payload.http_status ?? payload.status_code ?? payload.event?.contexts?.response?.status_code ?? null,
      stack_trace: payload.stack_trace ?? payload.exception?.values?.[0]?.stacktrace ?? null,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      request_id: requestId,
      response_time_ms: payload.response_time_ms ?? payload.responseTime ?? null,
      metadata: {
        ...payload,
        resource_type: resourceType,
        resource_id: resourceId,
        club_id: clubId
      }
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("crash_alert_deliveries")
    .select("last_sent_at")
    .eq("error_type", errorType)
    .maybeSingle();

  const shouldSend = !existing || existing.last_sent_at < tenMinutesAgo;
  if (shouldSend) {
    await supabase.from("crash_alert_deliveries").upsert({ error_type: errorType, last_sent_at: new Date().toISOString() });
    const recipients = await resolveEmailRecipients({
      supabase,
      severity,
      resourceType,
      resourceId,
      clubId
    });
    await sendEmail({ severity, message, pageUrl, recipients });
    await pingDiscord({ severity, message, pageUrl });
  }

  return NextResponse.json({ ok: true, id: log?.id, notified: shouldSend });
}

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

async function resolveEmailRecipients(input: {
  supabase: SupabaseServiceClient;
  severity: string;
  resourceType: unknown;
  resourceId: unknown;
  clubId: unknown;
}) {
  const explicitClubId = typeof input.clubId === "string" && input.clubId.length ? input.clubId : null;
  const resourceType = typeof input.resourceType === "string" ? input.resourceType.toLowerCase() : "";
  const resourceId = typeof input.resourceId === "string" && input.resourceId.length ? input.resourceId : null;
  const isClubResource = ["billboard", "billboards", "event", "events", "schedule", "venue"].includes(resourceType);

  let clubId = explicitClubId;
  if (!clubId && resourceId && ["billboard", "billboards"].includes(resourceType)) {
    const { data } = await input.supabase.from("billboards").select("club_id").eq("id", resourceId).maybeSingle();
    clubId = data?.club_id ?? null;
  }
  if (!clubId && resourceId && ["event", "events", "schedule", "venue"].includes(resourceType)) {
    const { data } = await input.supabase.from("events").select("club_id").eq("id", resourceId).maybeSingle();
    clubId = data?.club_id ?? null;
  }

  const roles: AppRole[] = clubId && isClubResource ? ["club_admin"] : ["super_admin"];
  const query = input.supabase
    .from("users")
    .select("email")
    .eq("status", "active")
    .eq("id_banned", false)
    .eq("ip_banned", false)
    .in("role", roles);

  if (clubId && isClubResource) query.eq("club_id", clubId);

  const { data } = await query;
  const databaseRecipients = (data ?? []).map((row) => row.email).filter(Boolean);
  let eventOpsRecipients: string[] = [];
  if (clubId && isClubResource) {
    const { data: assignedOps } = await input.supabase
      .from("admin_club_access")
      .select("users(email,status,id_banned,ip_banned)")
      .eq("club_id", clubId);
    eventOpsRecipients = (assignedOps ?? [])
      .map((row) => {
        const user = Array.isArray(row.users) ? row.users[0] : row.users;
        return user && user.status === "active" && !user.id_banned && !user.ip_banned ? user.email : null;
      })
      .filter(Boolean) as string[];
  }
  const fallbackRecipients = !clubId && process.env.SUPER_ADMIN_ALERT_EMAIL ? [process.env.SUPER_ADMIN_ALERT_EMAIL] : [];

  return Array.from(new Set([...databaseRecipients, ...eventOpsRecipients, ...fallbackRecipients]));
}

async function sendEmail(input: { severity: string; message: string; pageUrl: string | null; recipients: string[] }) {
  if (!process.env.RESEND_API_KEY || !input.recipients.length) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to: input.recipients,
    subject: `[Techi] ${input.severity} alert`,
    html: `<h2>Techi alert</h2><p><strong>${input.severity}</strong></p><p>${input.message}</p><p>${input.pageUrl ?? ""}</p>`
  });
}

async function pingDiscord(input: { severity: string; message: string; pageUrl: string | null }) {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: `Techi ${input.severity}: ${input.message}${input.pageUrl ? ` (${input.pageUrl})` : ""}` })
  });
}

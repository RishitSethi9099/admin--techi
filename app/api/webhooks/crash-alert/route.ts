import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";

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
      metadata: payload
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
    await sendEmail({ severity, message, pageUrl });
    await pingDiscord({ severity, message, pageUrl });
  }

  return NextResponse.json({ ok: true, id: log?.id, notified: shouldSend });
}

async function sendEmail(input: { severity: string; message: string; pageUrl: string | null }) {
  if (!process.env.RESEND_API_KEY || !process.env.SUPER_ADMIN_ALERT_EMAIL || !process.env.RESEND_FROM_EMAIL) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: process.env.SUPER_ADMIN_ALERT_EMAIL,
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

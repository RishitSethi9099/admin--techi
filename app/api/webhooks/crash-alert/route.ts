import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Error reports arrive from the public website (browsers, so CORS is needed),
// Sentry and uptime monitors. Repeats of the same open problem are grouped into
// one row (frequency + last_seen_at) instead of a new row per visitor.
// Errors are shown only in the admin portal (Errors page + sidebar count),
// scoped to each club. No emails or chat messages are sent.

const CLUB_RESOURCES = ["billboard", "billboards", "event", "events", "schedule", "venue", "poster", "video"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-techi-webhook-secret, x-webhook-secret",
    "Access-Control-Max-Age": "86400"
  };
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

function text(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const secret = process.env.CRASH_WEBHOOK_SECRET;
  const sentSecret = request.headers.get("x-techi-webhook-secret") ?? request.headers.get("x-webhook-secret");
  if (secret && sentSecret !== secret) {
    return reply({ error: "Unauthorized" }, 401);
  }

  let payload: Record<string, any>;
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object") throw new Error("not an object");
  } catch {
    return reply({ error: "Body must be JSON" }, 400);
  }
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply({ ok: true, demo: true });
  }

  const origin = request.headers.get("origin");
  const source = text(payload.source ?? (payload.monitorName ? "uptime" : origin ? "website" : "sentry"), 40)!;
  const message = text(payload.message ?? payload.error?.message ?? payload.incident?.name ?? "Unhandled service alert", 1000)!;
  const errorType = text(payload.error_type ?? payload.error?.type ?? payload.incident?.id ?? message, 120)!;
  const severity = text(payload.severity ?? payload.level ?? (payload.status === "down" ? "critical" : "warning"), 20)!;
  const pageUrl = text(payload.page_url ?? payload.url ?? payload.event?.request?.url ?? null, 500);
  const route = text(payload.route ?? payload.path ?? payload.event?.request?.url ?? null, 500);
  const requestId = text(request.headers.get("x-request-id") ?? payload.request_id ?? payload.event?.event_id ?? null, 120);
  const resourceType = text(payload.resource_type ?? payload.entity_type ?? payload.type ?? null, 40)?.toLowerCase() ?? null;
  const resourceId = text(payload.resource_id ?? payload.entity_id ?? payload.billboard_id ?? payload.event_id ?? null, 200);

  const supabase = createServiceRoleClient();
  const clubId = await resolveClubId({ supabase, clubId: payload.club_id ?? payload.clubId, resourceType, resourceId });
  const fingerprint = createHash("sha1").update([source, errorType, clubId ?? "", resourceId ?? "", message].join("|")).digest("hex");
  const now = new Date();

  const metadata = {
    ...payload,
    origin,
    user_agent: text(request.headers.get("user-agent"), 300),
    resource_type: resourceType,
    resource_id: resourceId,
    club_id: clubId
  };

  // Same open problem seen recently? Count it instead of adding a row.
  const { data: existing } = await supabase
    .from("crash_logs")
    .select("id,frequency")
    .eq("fingerprint", fingerprint)
    .eq("resolved", false)
    .gte("last_seen_at", new Date(now.getTime() - GROUP_WINDOW_MS).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let logId: string | null = null;
  if (existing) {
    const { error } = await supabase
      .from("crash_logs")
      .update({ frequency: (existing.frequency ?? 1) + 1, last_seen_at: now.toISOString(), page_url: pageUrl })
      .eq("id", existing.id);
    if (error) return reply({ error: error.message }, 500);
    logId = existing.id;
  } else {
    const row = {
      severity,
      message,
      page_url: pageUrl,
      source,
      error_type: errorType,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      route,
      http_status: payload.http_status ?? payload.status_code ?? payload.event?.contexts?.response?.status_code ?? null,
      stack_trace: text(payload.stack_trace ?? payload.exception?.values?.[0]?.stacktrace ?? null, 8000),
      first_seen_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      request_id: requestId,
      response_time_ms: payload.response_time_ms ?? payload.responseTime ?? null,
      metadata,
      club_id: clubId,
      fingerprint
    };
    let inserted = await supabase.from("crash_logs").insert(row).select("id").single();
    if (inserted.error?.code === "42703") {
      // migration 012 not applied yet: store without the new columns (club stays in metadata)
      const { club_id: _club, fingerprint: _fp, ...legacyRow } = row;
      inserted = await supabase.from("crash_logs").insert(legacyRow).select("id").single();
    }
    if (inserted.error) return reply({ error: inserted.error.message }, 500);
    logId = inserted.data?.id ?? null;
  }

  return reply({ ok: true, id: logId, grouped: Boolean(existing), club_id: clubId });
}

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Works out which club an error belongs to: the club id sent, or the owner of the billboard/event. */
async function resolveClubId(input: { supabase: SupabaseServiceClient; clubId: unknown; resourceType: string | null; resourceId: string | null }) {
  const explicit = uuidOrNull(input.clubId);
  if (explicit) {
    const { data } = await input.supabase.from("clubs").select("id").eq("id", explicit).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const resourceId = uuidOrNull(input.resourceId);
  if (!resourceId || (input.resourceType && !CLUB_RESOURCES.includes(input.resourceType))) return null;
  // The website labels screen videos "event" even though they are billboards, so check both.
  const tables = input.resourceType && ["event", "events", "schedule", "venue"].includes(input.resourceType) ? ["events", "billboards"] : ["billboards", "events"];
  for (const table of tables) {
    const { data } = await input.supabase.from(table).select("club_id").eq("id", resourceId).maybeSingle();
    if (data?.club_id) return data.club_id as string;
  }
  return null;
}

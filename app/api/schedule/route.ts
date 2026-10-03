import { NextResponse } from "next/server";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ScheduleEventRow = {
  id: string;
  club_id: string;
  title: string;
  poster_url: string | null;
  start_datetime: string;
  end_datetime: string;
  venue: string | null;
  description: string | null;
  registration_url: string | null;
  status: "draft" | "published";
  event_tier?: "major" | "minor" | null;
  created_at: string;
  updated_at: string;
  clubs?: { name?: string | null; short_name?: string | null } | null;
};

// Always read live data (new events, approvals, the hourly screen rotation)
// instead of a copy frozen at build time. Browsers/CDN still cache via Cache-Control.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=30, s-maxage=30"
  };
}

function isHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function mapEvent(event: ScheduleEventRow) {
  return {
    id: event.id,
    club_id: event.club_id,
    club_name: event.clubs?.short_name || event.clubs?.name || "Club TBA",
    title: event.title,
    poster_url: event.poster_url,
    start_datetime: event.start_datetime,
    end_datetime: event.end_datetime,
    venue: event.venue,
    description: event.description,
    registration_url: isHttpUrl(event.registration_url),
    status: event.status,
    event_tier: event.event_tier === "major" ? "major" : "minor",
    created_at: event.created_at,
    updated_at: event.updated_at
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ events: [] }, { headers: corsHeaders() });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,club_id,title,poster_url,start_datetime,end_datetime,venue,description,registration_url,status,event_tier,created_at,updated_at,clubs(name,short_name)")
    .eq("status", "published")
    .order("start_datetime", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, events: [] }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json({ events: ((data ?? []) as unknown as ScheduleEventRow[]).map(mapEvent) }, { headers: corsHeaders() });
}

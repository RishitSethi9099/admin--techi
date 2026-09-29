import { NextResponse } from "next/server";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ScreenEventRow = {
  id: string;
  title: string;
  description: string | null;
  event_datetime: string;
  poster_url?: string | null;
  poster_tall_url?: string | null;
  poster_wide_url?: string | null;
  video_url?: string | null;
  registration_url?: string | null;
  venue?: string | null;
  category?: string | null;
  event_tier?: string | null;
  screen_slot?: string | null;
  screen_details?: string | null;
  clubs?: { name?: string | null; short_name?: string | null } | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60, s-maxage=60"
  };
}

function eventDateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return { date: datePart, time: timePart };
}

function clubName(event: ScreenEventRow) {
  return event.clubs?.short_name || event.clubs?.name || "Club TBA";
}

function majorScreen(index: number, event: ScreenEventRow) {
  return event.screen_slot && /^V\d{2}$/i.test(event.screen_slot) ? event.screen_slot.toUpperCase() : `V${String(index + 1).padStart(2, "0")}`;
}

function posterPath(event: ScreenEventRow, key: "poster_tall_url" | "poster_wide_url") {
  return event[key] || event.poster_url || "";
}

function buildScreensJson(events: ScreenEventRow[]) {
  const approvedEvents = events.filter((event) => event.event_datetime);
  const majorEvents = approvedEvents
    .filter((event) => event.event_tier === "major" || event.category?.toLowerCase() === "major")
    .slice(0, 10)
    .map((event, index) => {
      const parts = eventDateParts(event.event_datetime);
      return {
        screen: majorScreen(index, event),
        name: event.title,
        club: clubName(event),
        date: parts.date,
        time: parts.time,
        video: event.video_url || "",
        description: event.description || "Flagship event",
        details: event.screen_details || event.description || "Details will be updated soon.",
        registerUrl: event.registration_url || "/events"
      };
    });

  const clubEvents = approvedEvents
    .filter((event) => event.event_tier !== "major" && event.category?.toLowerCase() !== "major")
    .map((event) => {
      const parts = eventDateParts(event.event_datetime);
      return {
        club: clubName(event),
        event: event.title,
        date: parts.date,
        time: parts.time,
        posterTall: posterPath(event, "poster_tall_url"),
        posterWide: posterPath(event, "poster_wide_url")
      };
    });

  return {
    _generatedBy: "techi-admin",
    _generatedAt: new Date().toISOString(),
    _help: [
      "Generated from approved Supabase events by techi-admin.",
      "Major events fill V01-V10 and should use 10 second 16:9 MP4 videos under 3 MB if possible.",
      "Minor club events rotate on poster screens and should use 1:2 tall plus 2:1 wide poster images."
    ],
    posterSwitchSeconds: 8,
    eventLengthHours: 3,
    videosPlayingAtOnce: {
      desktop: 4,
      phone: 2
    },
    testNow: "",
    majorEvents,
    clubEvents
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(buildScreensJson([]), { headers: corsHeaders() });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("events")
    .select("*,clubs(name,short_name)")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("event_datetime", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, ...buildScreensJson([]) }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(buildScreensJson((data ?? []) as ScreenEventRow[]), { headers: corsHeaders() });
}

import { NextResponse } from "next/server";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { MAJOR_SCREEN_COUNT, currentOrder, loadRotation, nextRotationAt, screenLabel, type RotationSettings } from "@/lib/screen-rotation";

type ScreenEventRow = {
  id: string;
  club_id?: string | null;
  title: string;
  description: string | null;
  start_datetime?: string | null;
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

type ScreenBillboardRow = {
  id: string;
  club_id?: string | null;
  event_slot_id?: string | null;
  title?: string | null;
  about_club?: string | null;
  type: "video" | "poster";
  media_url: string;
  display_order?: number | null;
  event_name?: string | null;
  event_tier?: "major" | "minor" | null;
  clubs?: { name?: string | null; short_name?: string | null } | null;
  event_slots?: {
    event_number?: number | null;
    event_name?: string | null;
    event_tier?: "major" | "minor" | null;
    required_media_type?: "video" | "poster" | null;
  } | null;
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
    "Cache-Control": "public, max-age=60, s-maxage=60"
  };
}

function eventDateParts(value?: string | null) {
  if (!value) return { date: "", time: "" };
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

function clubName(event: ScreenEventRow | ScreenBillboardRow) {
  return event.clubs?.short_name || event.clubs?.name || "Club TBA";
}

function majorScreen(index: number, event: ScreenEventRow) {
  return event.screen_slot && /^V\d{2}$/i.test(event.screen_slot) ? event.screen_slot.toUpperCase() : `V${String(index + 1).padStart(2, "0")}`;
}

function posterPath(event: ScreenEventRow, key: "poster_tall_url" | "poster_wide_url") {
  return event[key] || event.poster_url || "";
}

type ScreenRotation = { settings: RotationSettings; majorSlotIds: string[] } | null;

// id + club_id ride along so the website's error reports (broken video/poster)
// can be routed to the club that owns the item.
function majorBillboardEntry(billboard: ScreenBillboardRow, screen: string) {
  return {
    id: billboard.id,
    club_id: billboard.club_id ?? null,
    screen,
    name: billboard.event_name || billboard.event_slots?.event_name || billboard.title || "Major event",
    club: clubName(billboard),
    date: "",
    time: "",
    video: billboard.media_url,
    description: billboard.about_club || "Flagship event",
    details: billboard.about_club || "Details will be updated soon.",
    registerUrl: "/events"
  };
}

// Super Admin screen order (and hourly roll): club major videos go on the screen
// their event slot holds right now. Screens whose club has no approved video are
// left out, so the website keeps its placeholder video there.
function rotatedMajorEvents(majorBillboards: ScreenBillboardRow[], rotation: NonNullable<ScreenRotation>, now: number) {
  const order = currentOrder(rotation.settings, rotation.majorSlotIds, now).slice(0, MAJOR_SCREEN_COUNT);
  return order.flatMap((slotId, position) => {
    const billboard = majorBillboards.find((item) => item.event_slot_id === slotId);
    return billboard ? [majorBillboardEntry(billboard, screenLabel(position))] : [];
  });
}

function buildScreensJson(events: ScreenEventRow[], billboards: ScreenBillboardRow[] = [], rotation: ScreenRotation = null) {
  const now = Date.now();
  const approvedBillboards = billboards.filter((billboard) => billboard.media_url);
  const majorBillboards = approvedBillboards.filter((billboard) => (billboard.event_tier ?? billboard.event_slots?.event_tier) === "major" || billboard.type === "video");
  const billboardMajorEvents = rotation
    ? rotatedMajorEvents(majorBillboards, rotation, now)
    : majorBillboards
    .slice(0, 10)
    .map((billboard, index) => majorBillboardEntry(billboard, `V${String(index + 1).padStart(2, "0")}`));
  const billboardClubEvents = approvedBillboards
    .filter((billboard) => (billboard.event_tier ?? billboard.event_slots?.event_tier) !== "major" && billboard.type === "poster")
    .map((billboard) => ({
      id: billboard.id,
      club_id: billboard.club_id ?? null,
      club: clubName(billboard),
      event: billboard.event_name || billboard.event_slots?.event_name || billboard.title || "Club event",
      date: "",
      time: "",
      posterTall: billboard.media_url,
      posterWide: billboard.media_url
    }));

  const approvedEvents = events.filter((event) => event.start_datetime);
  const majorEvents = billboardMajorEvents.length
    ? billboardMajorEvents
    : approvedEvents
      .filter((event) => event.event_tier === "major" || event.category?.toLowerCase() === "major")
      .slice(0, 10)
      .map((event, index) => {
        const parts = eventDateParts(event.start_datetime);
        return {
          id: event.id,
          club_id: event.club_id ?? null,
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

  const clubEvents = billboardClubEvents.length
    ? billboardClubEvents
    : approvedEvents
      .filter((event) => event.event_tier !== "major" && event.category?.toLowerCase() !== "major")
      .map((event) => {
        const parts = eventDateParts(event.start_datetime);
        return {
          id: event.id,
          club_id: event.club_id ?? null,
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
      "Generated from approved Supabase billboard uploads and events by techi-admin.",
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
    screenRotation: rotation
      ? { rolling: rotation.settings.rolling, intervalMinutes: rotation.settings.intervalMinutes, nextChangeAt: nextRotationAt(rotation.settings, now)?.toISOString() ?? null }
      : null,
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
  const [eventsResult, billboardsResult, rotationResult, majorSlotsResult] = await Promise.all([
    supabase
      .from("events")
      .select("*,clubs(name,short_name)")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("start_datetime", { ascending: true }),
    supabase
      .from("billboards")
      .select("id,club_id,event_slot_id,title,about_club,type,media_url,display_order,event_name,event_tier,clubs(name,short_name),event_slots(event_number,event_name,event_tier,required_media_type)")
      .eq("status", "approved")
      .eq("active", true)
      .order("display_order", { ascending: true }),
    loadRotation(supabase as never),
    supabase.from("event_slots").select("id").eq("active", true).eq("event_tier", "major")
  ]);
  // Only use the Super Admin order once it has been saved; until then keep the old upload order.
  const rotation: ScreenRotation =
    rotationResult.configured && !majorSlotsResult.error
      ? { settings: rotationResult.settings, majorSlotIds: (majorSlotsResult.data ?? []).map((slot) => slot.id as string) }
      : null;

  const error = eventsResult.error || billboardsResult.error;
  if (error) {
    return NextResponse.json({ error: error.message, ...buildScreensJson([]) }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(buildScreensJson((eventsResult.data ?? []) as ScreenEventRow[], (billboardsResult.data ?? []) as unknown as ScreenBillboardRow[], rotation), { headers: corsHeaders() });
}

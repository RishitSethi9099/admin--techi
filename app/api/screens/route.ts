import { NextResponse } from "next/server";
import { createServiceRoleClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { MAJOR_SCREEN_COUNT, currentOrder, loadRotation, nextRotationAt, screenLabel, type RotationSettings } from "@/lib/screen-rotation";

type ScreenEventRow = {
  id: string;
  club_id?: string | null;
  title: string;
  description: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  event_slot_id?: string | null;
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

function posterPath(event: ScreenEventRow, key: "poster_tall_url" | "poster_wide_url") {
  return event[key] || event.poster_url || "";
}

type ScreenRotation = { settings: RotationSettings; majorSlotIds: string[] } | null;

type MajorItem = { billboard?: ScreenBillboardRow; event?: ScreenEventRow };

const IST_DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const IST_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

function when(event: ScreenEventRow) {
  if (!event.start_datetime) return null;
  const start = new Date(event.start_datetime);
  const end = event.end_datetime ? new Date(event.end_datetime) : null;
  const day = IST_DAY.format(start).replace(",", "");
  const sameDay = end && IST_DAY.format(end) === IST_DAY.format(start);
  const time = end
    ? `${IST_TIME.format(start)} – ${IST_TIME.format(end)}${sameDay ? "" : ` (${IST_DAY.format(end).replace(",", "")})`}`
    : IST_TIME.format(start);
  return { day, time: time.replace(/\s?(am|pm)/gi, (m) => ` ${m.trim().toUpperCase()}`) };
}

// One major-event screen: video from the club's approved billboard, schedule from
// the Events entry linked to the same club event. Either can be missing.
// id + club_id ride along so the website's error reports reach the right club.
function majorEntry(screen: string, { billboard, event }: MajorItem) {
  const parts = eventDateParts(event?.start_datetime);
  const w = event ? when(event) : null;
  const venue = event?.venue?.trim() || "";
  const rawAbout = event?.description?.trim() || billboard?.about_club?.trim() || "";
  const about = rawAbout && !/[.!?]$/.test(rawAbout) ? `${rawAbout}.` : rawAbout;
  const schedule = w ? `${w.day}, ${w.time}${venue ? ` at ${venue}` : ""}` : "";
  return {
    id: billboard?.id ?? event?.id,
    club_id: billboard?.club_id ?? event?.club_id ?? null,
    screen,
    name: event?.title || billboard?.event_name || billboard?.event_slots?.event_name || billboard?.title || "Major event",
    club: clubName((event ?? billboard)!),
    date: parts.date,
    time: parts.time,
    venue,
    tags: w ? `[ ${[w.day, w.time, venue].filter(Boolean).join(" / ").toUpperCase()} ]` : "[ DATE & VENUE COMING SOON ]",
    description: (billboard?.about_club || about || "Flagship event").slice(0, 90),
    details: schedule ? `${about ? `${about} ` : ""}When: ${schedule}.` : `${about ? `${about} ` : ""}Date and venue coming soon.`,
    registerUrl: event?.registration_url || "/events",
    // poster from the Events entry: the website's Major Events slider shows it with the date and venue
    poster: event?.poster_wide_url || event?.poster_url || event?.poster_tall_url || null,
    // no video key without an approved upload, so the website keeps its placeholder video
    ...(billboard ? { video: billboard.media_url } : {})
  };
}

function buildScreensJson(events: ScreenEventRow[], billboards: ScreenBillboardRow[] = [], rotation: ScreenRotation = null) {
  const now = Date.now();
  const approvedBillboards = billboards.filter((billboard) => billboard.media_url);
  const majorBillboards = approvedBillboards.filter((billboard) => (billboard.event_tier ?? billboard.event_slots?.event_tier) === "major" || billboard.type === "video");
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

  // Major events: Super Admin screen order (and hourly roll) when saved; otherwise
  // approved videos in upload order, then scheduled major events without a video yet.
  const scheduledMajors = approvedEvents.filter((event) => event.event_tier === "major" || event.category?.toLowerCase() === "major");
  const eventBySlot = new Map(scheduledMajors.filter((event) => event.event_slot_id).map((event) => [event.event_slot_id!, event]));
  const billboardBySlot = new Map(majorBillboards.filter((billboard) => billboard.event_slot_id).map((billboard) => [billboard.event_slot_id!, billboard]));
  let majorEvents: ReturnType<typeof majorEntry>[];
  if (rotation) {
    majorEvents = currentOrder(rotation.settings, rotation.majorSlotIds, now)
      .slice(0, MAJOR_SCREEN_COUNT)
      .flatMap((slotId, position) => {
        const item = { billboard: billboardBySlot.get(slotId), event: eventBySlot.get(slotId) };
        return item.billboard || item.event ? [majorEntry(screenLabel(position), item)] : [];
      });
  } else {
    const items: MajorItem[] = [
      ...majorBillboards.map((billboard) => ({ billboard, event: billboard.event_slot_id ? eventBySlot.get(billboard.event_slot_id) : undefined })),
      ...scheduledMajors.filter((event) => !event.event_slot_id || !billboardBySlot.has(event.event_slot_id)).map((event) => ({ event }))
    ];
    majorEvents = items.slice(0, MAJOR_SCREEN_COUNT).map((item, index) => majorEntry(screenLabel(index), item));
  }

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
      "Major events fill V01-V10 and should use 10 second 16:9 MP4 videos under 7 MB.",
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

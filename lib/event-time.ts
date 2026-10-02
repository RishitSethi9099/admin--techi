// Event times are entered and shown in India time (IST, UTC+05:30) regardless of
// where the server runs, so a "10:00 AM" event stays 10:00 AM for every viewer.

export const EVENT_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

export type Meridiem = "AM" | "PM";

export type TimeParts = {
  hour: string; // "1".."12"
  minute: string; // "00".."59"
  meridiem: Meridiem;
};

export type EventTimeParts = TimeParts & {
  date: string; // YYYY-MM-DD in IST
};

export const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function toIstParts(value?: string | null): EventTimeParts | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: String(Number(parts.hour)),
    minute: parts.minute,
    meridiem: String(parts.dayPeriod).toUpperCase() === "PM" ? "PM" : "AM"
  };
}

function to24Hour(hour: string, meridiem: string) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 1 || h > 12) return null;
  if (meridiem === "AM") return h === 12 ? 0 : h;
  if (meridiem === "PM") return h === 12 ? 12 : h + 12;
  return null;
}

/** Combines an IST date and a 12-hour time into a UTC ISO string, or "" if invalid. */
export function istToIso(date: string, hour: string, minute: string, meridiem: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const h = to24Hour(hour, meridiem);
  const m = Number(minute);
  if (h === null || !Number.isInteger(m) || m < 0 || m > 59) return "";
  const parsed = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00${IST_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function formatTime(parts: TimeParts) {
  return `${parts.hour}:${parts.minute} ${parts.meridiem}`;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

/** "5 Oct 2026 · 10:00 AM – 1:00 PM", or both dates when the event crosses midnight. */
export function formatEventRange(start?: string | null, end?: string | null) {
  const s = toIstParts(start);
  const e = toIstParts(end);
  if (!s) return "Not set";
  if (!e) return `${formatDay(s.date)} · ${formatTime(s)}`;
  if (s.date === e.date) return `${formatDay(s.date)} · ${formatTime(s)} – ${formatTime(e)}`;
  return `${formatDay(s.date)}, ${formatTime(s)} – ${formatDay(e.date)}, ${formatTime(e)}`;
}

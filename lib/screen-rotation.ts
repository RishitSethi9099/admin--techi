// Rotation of the club major-event videos across the website's video screens.
//
// The Super Admin sets a base order (position 0 = screen V01). When rolling is on,
// the order shifts by one place every `intervalMinutes`, counted from `startedAt`:
//   "up"   - the club on screen 1 drops to the last screen, every other club moves
//            one screen closer to screen 1   (V01 -> V10, V02 -> V01, V03 -> V02 ...)
//   "down" - the club on the last screen jumps to screen 1, every other club moves
//            one screen further from screen 1 (V10 -> V01, V01 -> V02, V02 -> V03 ...)
// After as many steps as there are clubs, everyone has had every screen exactly once.
// Nothing is stored per hour: the current order is worked out from the clock.

export const MAJOR_SCREEN_COUNT = 10;

export type RotationDirection = "up" | "down";

export type RotationSettings = {
  slotOrder: string[];
  rolling: boolean;
  direction: RotationDirection;
  intervalMinutes: number;
  startedAt: string | null;
};

export const DEFAULT_ROTATION: RotationSettings = {
  slotOrder: [],
  rolling: false,
  direction: "up",
  intervalMinutes: 60,
  startedAt: null
};

export function screenLabel(position: number) {
  return `V${String(position + 1).padStart(2, "0")}`;
}

/** Saved order, minus slots that no longer exist, plus new slots at the end. */
export function baseOrder(saved: string[], slotIds: string[]) {
  const known = new Set(slotIds);
  const kept = saved.filter((id, i) => known.has(id) && saved.indexOf(id) === i);
  return [...kept, ...slotIds.filter((id) => !kept.includes(id))];
}

export function rotationSteps(settings: RotationSettings, now: number) {
  if (!settings.rolling || !settings.startedAt) return 0;
  const started = Date.parse(settings.startedAt);
  const interval = Math.max(1, settings.intervalMinutes) * 60_000;
  if (Number.isNaN(started) || now < started) return 0;
  return Math.floor((now - started) / interval);
}

export function rotateOrder<T>(order: T[], steps: number, direction: RotationDirection) {
  const n = order.length;
  if (!n) return [];
  const shift = ((steps % n) + n) % n;
  return order.map((_, i) => order[direction === "up" ? (i + shift) % n : (i - shift + n) % n]);
}

/** Which slot is on each screen right now (index 0 = V01). */
export function currentOrder(settings: RotationSettings, slotIds: string[], now: number) {
  return rotateOrder(baseOrder(settings.slotOrder, slotIds), rotationSteps(settings, now), settings.direction);
}

/** Which slot will be on each screen after the next change. */
export function upcomingOrder(settings: RotationSettings, slotIds: string[], now: number) {
  return rotateOrder(baseOrder(settings.slotOrder, slotIds), rotationSteps(settings, now) + 1, settings.direction);
}

export function nextRotationAt(settings: RotationSettings, now: number) {
  if (!settings.rolling || !settings.startedAt) return null;
  const started = Date.parse(settings.startedAt);
  if (Number.isNaN(started)) return null;
  const interval = Math.max(1, settings.intervalMinutes) * 60_000;
  return new Date(started + (rotationSteps(settings, now) + 1) * interval);
}

type RotationRow = {
  slot_order?: string[] | null;
  rolling?: boolean | null;
  direction?: string | null;
  interval_minutes?: number | null;
  started_at?: string | null;
};

export function rotationFromRow(row: RotationRow | null | undefined): RotationSettings {
  if (!row) return DEFAULT_ROTATION;
  return {
    slotOrder: row.slot_order ?? [],
    rolling: Boolean(row.rolling && row.started_at),
    direction: row.direction === "down" ? "down" : "up",
    intervalMinutes: row.interval_minutes ?? 60,
    startedAt: row.started_at ?? null
  };
}

// Minimal shape of a Supabase client, so this file has no server-only imports.
type RotationQueryClient = {
  from: (table: "major_screen_rotation") => {
    select: (columns: string) => {
      eq: (column: "id", value: boolean) => {
        maybeSingle: () => PromiseLike<{ data: RotationRow | null; error: { message: string; code?: string } | null }>;
      };
    };
  };
};

/** Reads the settings row. `configured` is false until the Super Admin saves once; `missingTable` means migration 011 hasn't run. */
export async function loadRotation(supabase: RotationQueryClient) {
  const { data, error } = await supabase
    .from("major_screen_rotation")
    .select("slot_order,rolling,direction,interval_minutes,started_at")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    const missingTable = error.code === "42P01" || /major_screen_rotation/.test(error.message);
    return { settings: DEFAULT_ROTATION, configured: false, missingTable, error: missingTable ? null : error.message };
  }
  return { settings: rotationFromRow(data), configured: Boolean(data), missingTable: false, error: null };
}

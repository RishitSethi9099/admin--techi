"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Pause, RefreshCw, RotateCw, XCircle } from "lucide-react";
import { updateScreenRotation, type RotationActionResult } from "@/lib/actions/screen-rotation";
import {
  MAJOR_SCREEN_COUNT,
  currentOrder,
  nextRotationAt,
  rotateOrder,
  screenLabel,
  type RotationDirection,
  type RotationSettings
} from "@/lib/screen-rotation";

export type RotationSlot = {
  id: string;
  clubName: string;
  eventName: string;
  video: "approved" | "pending" | "none";
};

const INTERVALS = [
  { value: 30, label: "Every 30 min" },
  { value: 60, label: "Every 1 hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 180, label: "Every 3 hours" }
];

function timeIst(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

function minutesUntil(date: Date, now: number) {
  const mins = Math.max(0, Math.ceil((date.getTime() - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
}

export function ScreenRotationPanel({
  slots,
  initialSettings,
  missingTable
}: {
  slots: RotationSlot[];
  initialSettings: RotationSettings;
  missingTable: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<string[] | null>(null);
  const [direction, setDirection] = useState<RotationDirection>(initialSettings.direction);
  const [intervalMinutes, setIntervalMinutes] = useState(initialSettings.intervalMinutes);
  const [busy, setBusy] = useState<"save" | "roll" | "stop" | null>(null);
  const [result, setResult] = useState<RotationActionResult | null>(null);

  useEffect(() => setSettings(initialSettings), [initialSettings]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const byId = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const slotIds = useMemo(() => slots.map((slot) => slot.id), [slots]);
  const live = useMemo(() => currentOrder(settings, slotIds, now), [settings, slotIds, now]);
  const shown = draft ?? live;
  const afterNext = rotateOrder(shown, 1, direction);
  const next = nextRotationAt(settings, now);
  const settingsChanged = direction !== settings.direction || intervalMinutes !== settings.intervalMinutes;
  const dirty = draft !== null || settingsChanged;
  const intervalLabel = INTERVALS.find((option) => option.value === intervalMinutes)?.label.toLowerCase() ?? `every ${intervalMinutes} min`;

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= shown.length) return;
    const order = [...shown];
    [order[index], order[target]] = [order[target], order[index]];
    setDraft(order);
    setResult(null);
  }

  async function run(action: "save" | "roll" | "stop") {
    if (busy) return;
    if (action === "stop" && !window.confirm("Stop rotating? The clubs stay on the screens they have right now.")) return;
    setBusy(action);
    setResult(null);
    let res: RotationActionResult;
    try {
      res = await updateScreenRotation({ action, order: shown, direction, intervalMinutes });
    } catch {
      res = { ok: false, message: "Could not reach the server. Try again." };
    }
    setBusy(null);
    setResult(res);
    if (res.ok && res.settings) {
      setSettings(res.settings);
      setDraft(null);
      setNow(Date.now());
      router.refresh();
    }
  }

  if (missingTable) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Screen rotation needs one database update. Run <code className="font-mono">supabase/migrations/011_major_screen_rotation.sql</code> in the Supabase SQL editor, then reload this page.
      </div>
    );
  }
  if (!slots.length) {
    return <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">No major event slots exist yet, so there is nothing to put on the video screens.</div>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Major event screens · V01–V{String(MAJOR_SCREEN_COUNT).padStart(2, "0")}</h2>
          <p className="text-sm text-muted">Set which club's video plays on which website screen. Screen 1 is the most visible.</p>
        </div>
        {settings.rolling && next ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
            <RotateCw className="h-4 w-4 animate-[spin_4s_linear_infinite]" />
            Rotating {INTERVALS.find((o) => o.value === settings.intervalMinutes)?.label.toLowerCase() ?? `every ${settings.intervalMinutes} min`} · next change {timeIst(next)} (in {minutesUntil(next, now)})
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
            <Pause className="h-4 w-4" /> Fixed order (not rotating)
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[64px_1fr_96px_88px] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid-cols-[64px_1fr_120px_96px_88px]">
          <span>Screen</span>
          <span>Club · event</span>
          <span className="hidden sm:block">Video</span>
          <span>{settings.rolling || draft ? "Next change" : "If rolled"}</span>
          <span className="text-right">Move</span>
        </div>
        <ol className="divide-y divide-border">
          {shown.map((id, index) => {
            const slot = byId.get(id);
            if (!slot) return null;
            const nextIndex = afterNext.indexOf(id);
            const hasScreen = index < MAJOR_SCREEN_COUNT;
            return (
              <li key={id} className={`grid grid-cols-[64px_1fr_96px_88px] items-center gap-3 px-3 py-2.5 sm:grid-cols-[64px_1fr_120px_96px_88px] ${index === 0 ? "bg-primary-soft/60" : "bg-white"}`}>
                <span className={`inline-flex h-9 w-14 items-center justify-center rounded-lg font-mono text-sm font-bold ${hasScreen ? "bg-primary text-white" : "bg-slate-200 text-slate-500"}`}>
                  {hasScreen ? screenLabel(index) : "—"}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{slot.clubName}</div>
                  <div className="truncate text-sm text-muted">{slot.eventName}</div>
                </div>
                <span className="hidden sm:block">
                  {slot.video === "approved" ? (
                    <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Approved</span>
                  ) : slot.video === "pending" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Awaiting approval</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">Not uploaded</span>
                  )}
                </span>
                <span className="font-mono text-sm text-muted">→ {nextIndex < MAJOR_SCREEN_COUNT ? screenLabel(nextIndex) : "—"}</span>
                <span className="flex justify-end gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || Boolean(busy)} aria-label={`Move ${slot.clubName} up`} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-slate-50 disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === shown.length - 1 || Boolean(busy)} aria-label={`Move ${slot.clubName} down`} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-slate-50 disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {slots.some((slot) => slot.video !== "approved") ? (
        <p className="text-xs text-muted">Screens whose club has no approved video yet keep showing the website's placeholder video until one is approved.</p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-slate-50 p-4 lg:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">How often to rotate</span>
          <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} disabled={Boolean(busy)} className="h-11 rounded-xl border border-border bg-white px-3">
            {INTERVALS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Which way the order moves</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as RotationDirection)} disabled={Boolean(busy)} className="h-11 rounded-xl border border-border bg-white px-3">
            <option value="up">Screen 1 goes to the last screen, everyone else moves up one</option>
            <option value="down">Last screen comes to screen 1, everyone else moves down one</option>
          </select>
        </label>
      </div>

      {result ? (
        <div role={result.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{result.message}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {settings.rolling ? (
          <>
            <button type="button" onClick={() => run("save")} disabled={!dirty || Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-40">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
            </button>
            <button type="button" onClick={() => run("stop")} disabled={Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white disabled:opacity-60">
              {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Stop rolling
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => run("save")} disabled={!dirty || Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-40">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save order
            </button>
            <button type="button" onClick={() => run("roll")} disabled={Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">
              {busy === "roll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Roll {intervalLabel}
            </button>
          </>
        )}
        {draft ? (
          <button type="button" onClick={() => setDraft(null)} disabled={Boolean(busy)} className="text-sm font-medium text-muted underline underline-offset-2">
            Undo my changes
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {settings.rolling
          ? "Saving changes while rolling restarts the rotation from the order shown above. Visitors see the new order the next time they open or reload the website."
          : "Roll starts from the order shown above and keeps going until you stop it. Visitors see changes the next time they open or reload the website."}
      </p>
    </div>
  );
}

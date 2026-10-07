"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2 } from "lucide-react";
import { deletePulledPoster, pullPosterFromSchedule } from "@/lib/actions/billboards";

type Result = { ok: boolean; message: string } | null;

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Could not reach the server. Try again." });
    }
    setBusy(false);
  }
  return { busy, result, run };
}

/** Super Admin: publish the poster from the club's event schedule to the website screens. */
export function PullPosterButton({ slotId, posterUrl, compact }: { slotId: string; posterUrl: string; compact?: boolean }) {
  const { busy, result, run } = useAction();
  return (
    <span className={compact ? "inline-flex flex-col gap-1" : "grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"}>
      {!compact ? (
        <span className="flex items-center gap-3 text-sm text-amber-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterUrl} alt="Poster from the event schedule" className="h-16 w-12 rounded object-cover" />
          <span>No billboard uploaded yet, but the club added a poster to its <b>event schedule</b>. You can put that on the website.</span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => run(() => pullPosterFromSchedule(slotId))}
        disabled={busy}
        title="Publish the poster from this event's schedule to the website screens"
        className={`inline-flex w-fit items-center gap-1.5 rounded-lg font-semibold disabled:opacity-50 ${compact ? "border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100" : "bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700"}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? "Pulling…" : compact ? "Pull poster" : "Pull poster from event schedule"}
      </button>
      {result ? <span className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span> : null}
    </span>
  );
}

/** Club admin: remove a poster the Super Admin pulled from the event schedule. */
export function DeletePulledPosterButton({ billboardId, eventName }: { billboardId: string; eventName: string }) {
  const { busy, result, run } = useAction();
  return (
    <span className="grid gap-1">
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Remove the ${eventName} poster from the website? Your event schedule keeps its poster.`)) run(() => deletePulledPoster(billboardId));
        }}
        disabled={busy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {busy ? "Removing…" : "Delete this poster"}
      </button>
      {result ? <span className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span> : null}
    </span>
  );
}

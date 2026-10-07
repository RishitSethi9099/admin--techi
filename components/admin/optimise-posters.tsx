"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minimize2 } from "lucide-react";
import { optimiseUploadedPoster } from "@/lib/browser-upload";
import { setBillboardMedia } from "@/lib/actions/billboards";

type Poster = { id: string; url: string; name: string };

/** Super Admin: shrink every live poster that is too big for phones (done in this browser). */
export function OptimisePostersButton({ posters }: { posters: Poster[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function run() {
    if (busy || !window.confirm(`Check ${posters.length} live posters and shrink the big ones? The website keeps working while this runs.`)) return;
    setBusy(true);
    setLog([]);
    let done = 0;
    for (const poster of posters) {
      try {
        const small = await optimiseUploadedPoster(poster.url);
        if (small) {
          const res = await setBillboardMedia({ id: poster.id, url: small });
          setLog((l) => [...l, res.ok ? `✓ ${poster.name}: made smaller` : `✗ ${poster.name}: ${res.message}`]);
          if (res.ok) done++;
        } else {
          setLog((l) => [...l, `· ${poster.name}: already small`]);
        }
      } catch (error) {
        setLog((l) => [...l, `✗ ${poster.name}: ${error instanceof Error ? error.message : "failed"}`]);
      }
    }
    setLog((l) => [...l, `Done. ${done} poster${done === 1 ? "" : "s"} made smaller.`]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || !posters.length}
        title="Big poster files load slowly on phones. This makes smaller copies (same look) and uses them on the website."
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minimize2 className="h-4 w-4" />}
        {busy ? "Optimising…" : "Optimise posters"}
      </button>
      {log.length ? (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-muted">
          {log.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, RotateCcw } from "lucide-react";
import { setBillboardLive } from "@/lib/actions/billboards";

export function BillboardLiveButton({ id, live, name }: { id: string; live: boolean; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    if (live && !window.confirm(`Take “${name}” down from the website? You can put it back up later.`)) return;
    setBusy(true);
    setProblem(null);
    let result;
    try {
      result = await setBillboardLive({ id, live: !live });
    } catch {
      result = { ok: false, message: "Could not reach the server. Try again." };
    }
    setBusy(false);
    if (result.ok) router.refresh();
    else setProblem(result.message);
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex h-9 w-fit items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-60 ${
          live ? "bg-red-600 text-white hover:bg-red-700" : "border border-border bg-white text-foreground hover:bg-slate-50"
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : live ? <EyeOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
        {live ? "Take down from website" : "Put back up"}
      </button>
      {problem ? <span className="text-xs text-red-600">{problem}</span> : null}
    </div>
  );
}

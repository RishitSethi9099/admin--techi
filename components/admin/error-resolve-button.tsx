"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { setErrorResolved } from "@/lib/actions/errors";

export function ErrorResolveButton({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    let result;
    try {
      result = await setErrorResolved({ id, resolved: !resolved });
    } catch {
      result = { ok: false, message: "Could not reach the server. Try again." };
    }
    setBusy(false);
    if (result.ok) router.refresh();
    else setProblem(result.message);
  }

  return (
    <div className="grid justify-items-start gap-1 lg:justify-items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-60 ${
          resolved ? "border border-border bg-white text-foreground hover:bg-slate-50" : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : resolved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {resolved ? "Reopen" : "Mark fixed"}
      </button>
      {problem ? <span className="text-xs text-red-600">{problem}</span> : null}
    </div>
  );
}

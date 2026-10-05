"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DatabaseBackup, Loader2, XCircle } from "lucide-react";
import { runManualBackup } from "@/lib/actions/backups";
import type { BackupOutcome } from "@/lib/backup";

export function BackupNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BackupOutcome | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    let next: BackupOutcome;
    try {
      next = await runManualBackup();
    } catch {
      next = { ok: false, changed: false, message: "Could not reach the server. Try again." };
    }
    setBusy(false);
    setResult(next);
    router.refresh();
  }

  return (
    <div className="grid justify-items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
        {busy ? "Backing up…" : "Back up now"}
      </button>
      {result ? (
        <div className={`flex max-w-md items-start gap-2 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            {result.message}
            {result.commitUrl ? <> <a href={result.commitUrl} target="_blank" rel="noreferrer" className="font-semibold underline">View on GitHub</a></> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

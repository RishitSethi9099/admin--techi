"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { revertApprovalRequest } from "@/lib/actions/approvals";

const WHAT: Record<string, string> = {
  approved: "This takes the published copy off the website and puts the request back in pending.",
  rejected: "This puts the request back in pending so you can decide again.",
  clarification_requested: "This puts the request back in pending."
};

export function ApprovalRevertButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function revert() {
    if (busy || !window.confirm(`Undo this decision?\n\n${WHAT[status] ?? "This puts the request back in pending."}`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await revertApprovalRequest(id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not reach the server. Try again." });
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-1">
      <button type="button" onClick={revert} disabled={busy} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-slate-50 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        {busy ? "Undoing…" : "Undo decision"}
      </button>
      {message ? <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span> : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { deleteAdmins, type DeleteAdminsResult } from "@/lib/actions/admins";

const CHECKBOX = "input[data-admin-select]";

function Result({ result, onClose }: { result: DeleteAdminsResult; onClose: () => void }) {
  return (
    <div role={result.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
      {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1">{result.message}</span>
      <button type="button" onClick={onClose} className="text-xs font-semibold underline">Dismiss</button>
    </div>
  );
}

async function run(ids: string[]): Promise<DeleteAdminsResult> {
  try {
    return await deleteAdmins({ ids });
  } catch {
    return { ok: false, message: "Could not reach the server. Try again.", deleted: [] };
  }
}

/** Checkbox on each account card; the bar below reads the ticked ones. */
export function AdminSelectBox({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-medium ${disabled ? "text-slate-300" : "text-muted"}`} title={disabled ? "You can't delete your own account" : undefined}>
      <input
        type="checkbox"
        data-admin-select={id}
        data-admin-name={name}
        disabled={disabled}
        onChange={() => window.dispatchEvent(new Event("admin-selection"))}
        className="h-4 w-4"
      />
      Select
    </label>
  );
}

/** Sticky bar: select all / delete the ticked accounts. */
export function DeleteSelectedBar() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteAdminsResult | null>(null);

  useEffect(() => {
    const update = () => setCount(document.querySelectorAll(`${CHECKBOX}:checked`).length);
    window.addEventListener("admin-selection", update);
    update();
    return () => window.removeEventListener("admin-selection", update);
  }, []);

  function selectAll(on: boolean) {
    document.querySelectorAll<HTMLInputElement>(`${CHECKBOX}:not(:disabled)`).forEach((box) => { box.checked = on; });
    window.dispatchEvent(new Event("admin-selection"));
  }

  async function remove() {
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(`${CHECKBOX}:checked`));
    if (!boxes.length || busy) return;
    const names = boxes.map((box) => box.dataset.adminName).slice(0, 8).join(", ") + (boxes.length > 8 ? ` and ${boxes.length - 8} more` : "");
    if (!window.confirm(`Permanently delete ${boxes.length} account${boxes.length === 1 ? "" : "s"}?\n\n${names}\n\nThey won't be able to log in again. This can't be undone.`)) return;
    setBusy(true);
    setResult(null);
    const res = await run(boxes.map((box) => box.dataset.adminSelect!));
    setBusy(false);
    setResult(res);
    selectAll(false);
    router.refresh();
  }

  return (
    <div className="sticky top-2 z-10 mb-4 grid gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
        <span className="text-sm font-medium">{count ? `${count} selected` : "Tick accounts to delete several at once"}</span>
        <button type="button" onClick={() => selectAll(true)} className="text-sm font-semibold text-primary underline underline-offset-2">Select all</button>
        {count ? <button type="button" onClick={() => selectAll(false)} className="text-sm font-semibold text-muted underline underline-offset-2">Clear</button> : null}
        <button
          type="button"
          onClick={remove}
          disabled={!count || busy}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {busy ? "Deleting…" : `Delete selected${count ? ` (${count})` : ""}`}
        </button>
      </div>
      {result ? <Result result={result} onClose={() => setResult(null)} /> : null}
    </div>
  );
}

/** Delete button for one account card. */
export function DeleteAdminButton({ id, name, isSelf }: { id: string; name: string; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteAdminsResult | null>(null);
  if (isSelf) return <span className="text-xs text-muted">This is you</span>;

  async function remove() {
    if (busy || !window.confirm(`Permanently delete ${name}'s account? They won't be able to log in again. This can't be undone.`)) return;
    setBusy(true);
    const res = await run([id]);
    setBusy(false);
    if (res.ok) router.refresh();
    else setResult(res);
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={remove} disabled={busy} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {busy ? "Deleting…" : "Delete account"}
      </button>
      {result ? <Result result={result} onClose={() => setResult(null)} /> : null}
    </div>
  );
}

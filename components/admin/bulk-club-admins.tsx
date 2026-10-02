"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, FileUp, Loader2, MessageCircle, XCircle } from "lucide-react";
import { bulkCreateClubAdmins, type BulkClubAdminResult, type BulkClubAdminRow } from "@/lib/actions/admins";
import type { Club } from "@/lib/supabase/types";

type ExistingAdmin = { email: string; club_id: string | null; role: string; name: string };
type PreviewRow = BulkClubAdminRow & { line: number; problems: string[]; warning?: string; clubLabel: string };

const HEADERS = ["club", "admin_name", "email", "whatsapp", "club_id"];
const BATCH = 5;

/* minimal CSV reader: quotes, commas, CRLF, BOM (what Excel / Google Sheets export) */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function whatsappNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`; // Indian mobile without country code
  return digits.length >= 11 ? digits : "";
}

export function BulkClubAdmins({ clubs, admins }: { clubs: Club[]; admins: ExistingAdmin[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<BulkClubAdminResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const clubAdminsByClub = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const admin of admins) if (admin.role === "club_admin" && admin.club_id) map.set(admin.club_id, [...(map.get(admin.club_id) ?? []), admin.name]);
    return map;
  }, [admins]);

  function downloadTemplate() {
    const sorted = [...clubs].sort((a, b) => (a.short_name ?? a.name).localeCompare(b.short_name ?? b.name));
    const rows = sorted.map((club) => [club.short_name || club.name, "", "", "", club.id]);
    download("techideate-club-admins.csv", toCsv([HEADERS, ...rows]));
  }

  function findClub(row: BulkClubAdminRow) {
    const id = row.club_id?.trim();
    if (id) {
      const byId = clubs.find((club) => club.id === id);
      if (byId) return byId;
    }
    const key = row.club.trim().toLowerCase();
    return clubs.find((club) => [club.name, club.short_name, club.slug].some((v) => (v ?? "").trim().toLowerCase() === key)) ?? null;
  }

  async function onFile(file: File | undefined) {
    setResults(null); setPreview(null); setFileProblem(null); setDone(0);
    if (!file) return;
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setFileProblem("Upload a .csv file. In Excel use File → Save As → CSV; in Google Sheets use File → Download → CSV.");
      return;
    }
    const table = parseCsv(await file.text());
    const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    if (col("email") < 0 || (col("admin_name") < 0 && col("name") < 0) || (col("club") < 0 && col("club_id") < 0)) {
      setFileProblem("The first row must have the columns club, admin_name, email (and optionally whatsapp, club_id). Download the template to start from.");
      return;
    }
    const nameCol = col("admin_name") >= 0 ? col("admin_name") : col("name");
    const seen = new Map<string, number>();
    const rows: PreviewRow[] = [];
    table.slice(1).forEach((cells, i) => {
      const get = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
      const row: BulkClubAdminRow = { club: get(col("club")), club_id: get(col("club_id")), name: get(nameCol), email: get(col("email")).toLowerCase(), whatsapp: get(col("whatsapp")) };
      if (!row.name && !row.email) return; // unfilled template line: ignore
      const problems: string[] = [];
      const club = findClub(row);
      if (!club) problems.push(`Club "${row.club || row.club_id}" not found`);
      if (row.name.length < 2) problems.push("Name missing");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) problems.push("Email not valid");
      if (seen.has(row.email)) problems.push(`Same email as line ${seen.get(row.email)}`);
      if (admins.some((a) => a.email.toLowerCase() === row.email)) problems.push("Email already has an account");
      if (row.whatsapp && !whatsappNumber(row.whatsapp)) problems.push("WhatsApp number not valid");
      seen.set(row.email, i + 2);
      const existing = club ? clubAdminsByClub.get(club.id) : undefined;
      rows.push({
        ...row,
        line: i + 2,
        clubLabel: club ? club.short_name || club.name : row.club,
        problems,
        warning: existing?.length ? `Club already has admin: ${existing.join(", ")}` : undefined
      });
    });
    if (!rows.length) setFileProblem("No filled rows found. Fill admin_name and email for the clubs you want, then upload again.");
    setPreview(rows);
  }

  const ready = preview?.filter((row) => !row.problems.length) ?? [];

  async function create() {
    if (!ready.length || running) return;
    if (!window.confirm(`Create ${ready.length} club admin account${ready.length === 1 ? "" : "s"}?`)) return;
    setRunning(true); setDone(0);
    const all: BulkClubAdminResult[] = [];
    for (let i = 0; i < ready.length; i += BATCH) {
      const batch = ready.slice(i, i + BATCH);
      try {
        const res = await bulkCreateClubAdmins({ rows: batch.map(({ club, club_id, name, email, whatsapp }) => ({ club, club_id, name, email, whatsapp })), startRow: i + 1 });
        res.forEach((r, j) => { r.row = batch[j].line; });
        all.push(...res);
      } catch {
        all.push(...batch.map((row) => ({ row: row.line, club: row.clubLabel, name: row.name, email: row.email, whatsapp: row.whatsapp ?? "", status: "failed" as const, message: "Could not reach the server. Upload the file again to retry these rows." })));
      }
      setDone(Math.min(i + BATCH, ready.length));
      setResults([...all]);
    }
    setRunning(false);
    setPreview(null);
  }

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = (r: BulkClubAdminResult) =>
    `Hi ${r.name}, here is your TECHIDEATE '26 admin login for ${r.club}.\n\nLink: ${loginUrl}\nEmail: ${r.email}\nPassword: ${r.password}\n\nPlease keep it private.`;
  const created = results?.filter((r) => r.status === "created") ?? [];

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <div className="grid gap-4">
      <ol className="grid gap-2 text-sm text-muted">
        <li><b className="text-foreground">1.</b> Download the template. It already lists every club.</li>
        <li><b className="text-foreground">2.</b> Fill <b>admin_name</b>, <b>email</b> and, if you want a WhatsApp button, <b>whatsapp</b>. Leave rows empty for clubs you're not adding now. Don't change <b>club_id</b>.</li>
        <li><b className="text-foreground">3.</b> Save as CSV and upload it here. Nothing is created until you press Create.</li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={downloadTemplate} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 font-semibold">
          <Download className="h-4 w-4" /> Download template
        </button>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
          <FileUp className="h-4 w-4" /> {fileName ? "Upload another CSV" : "Upload filled CSV"}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={running} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {fileName ? <span className="self-center text-sm text-muted">{fileName}</span> : null}
      </div>
      {fileProblem ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fileProblem}</p> : null}

      {preview && preview.length ? (
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[50px_1fr_1.2fr_1.6fr_1.6fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span>Line</span><span>Club</span><span>Name</span><span>Email</span><span>Check</span>
            </div>
            <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
              {preview.map((row) => (
                <div key={row.line} className={`grid grid-cols-[50px_1fr_1.2fr_1.6fr_1.6fr] items-center gap-3 px-3 py-2 text-sm ${row.problems.length ? "bg-red-50/60" : ""}`}>
                  <span className="text-muted">{row.line}</span>
                  <span className="truncate">{row.clubLabel}</span>
                  <span className="truncate">{row.name}</span>
                  <span className="truncate">{row.email}</span>
                  <span className="text-xs">
                    {row.problems.length ? (
                      <span className="inline-flex items-start gap-1 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{row.problems.join(" · ")}</span>
                    ) : row.warning ? (
                      <span className="inline-flex items-start gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{row.warning}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={create} disabled={!ready.length || running} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-50">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {running ? `Creating ${done} of ${ready.length}…` : `Create ${ready.length} account${ready.length === 1 ? "" : "s"}`}
            </button>
            {preview.length - ready.length ? <span className="text-sm text-red-700">{preview.length - ready.length} row{preview.length - ready.length === 1 ? "" : "s"} with problems will be skipped. Fix them and upload again.</span> : null}
          </div>
        </div>
      ) : null}

      {results ? (
        <div className="grid gap-3">
          {created.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span><b>Save these passwords now.</b> They are shown only once and can't be seen again after you leave this page.</span>
              <button
                type="button"
                onClick={() => download("techideate-club-admin-logins.csv", toCsv([["club", "name", "email", "password", "login_link", "whatsapp"], ...created.map((r) => [r.club, r.name, r.email, r.password ?? "", loginUrl, r.whatsapp])]))}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-3 font-semibold text-white"
              >
                <Download className="h-4 w-4" /> Download logins (CSV)
              </button>
            </div>
          ) : null}
          <p className="text-sm text-muted">
            {created.length} created · {results.filter((r) => r.status === "skipped").length} skipped · {results.filter((r) => r.status === "failed").length} failed
            {running ? ` · working… ${done} of ${ready.length || done}` : ""}
          </p>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {results.map((r) => {
                const wa = whatsappNumber(r.whatsapp);
                return (
                  <div key={`${r.row}-${r.email}`} className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[1fr_1.4fr_1.2fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.club} · {r.name}</div>
                      <div className="truncate text-muted">{r.email}</div>
                    </div>
                    <div className={r.status === "created" ? "text-green-700" : r.status === "skipped" ? "text-amber-700" : "text-red-700"}>
                      {r.status === "created" ? "Created" : r.status === "skipped" ? "Skipped" : "Failed"}{r.status !== "created" ? `: ${r.message}` : ""}
                    </div>
                    <div className="font-mono text-base">{r.password ?? ""}</div>
                    {r.status === "created" ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => copy(r.email, message(r))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 font-semibold">
                          <Copy className="h-4 w-4" /> {copied === r.email ? "Copied" : "Copy message"}
                        </button>
                        {wa ? (
                          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(message(r))}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-green-600 px-3 font-semibold text-white">
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                          </a>
                        ) : null}
                      </div>
                    ) : <span />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

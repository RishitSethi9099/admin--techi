import { createServiceRoleClient } from "@/lib/supabase/server";

/*
 * Backs up the database to the GitHub backup repo.
 *
 * Each run writes one JSON file per table into backup/ and commits it. If nothing changed since
 * the last run, no commit is made. Git history keeps every earlier version.
 *
 * Saved:     every table below, plus a list of the poster/video files in storage (name, size, link).
 * Not saved: the media files themselves (too big for git), passwords (Supabase only keeps hashes and
 *            they can't be exported), secret keys, and backup_runs (each run would change it, so the
 *            repo would get a commit every 30 minutes even when nothing else changed).
 */

const TABLES = [
  "clubs",
  "users",
  "admin_club_access",
  "event_slots",
  "events",
  "billboards",
  "approval_requests",
  "major_screen_rotation",
  "team_members",
  "notifications",
  "audit_logs",
  "crash_logs",
  "crash_alert_deliveries"
] as const;

const BUCKETS = ["billboard-media", "event-posters", "team-photos"] as const;
const PAGE = 1000;

export type BackupOutcome = {
  ok: boolean;
  changed: boolean;
  message: string;
  commitUrl?: string;
};

export function backupConfig() {
  const token = process.env.GITHUB_BACKUP_TOKEN || "";
  const repo = process.env.GITHUB_BACKUP_REPO || "RishitSethi9099/backup-repo-";
  const branch = process.env.GITHUB_BACKUP_BRANCH || "main";
  return { token, repo, branch, ready: Boolean(token && process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

function stableKey(row: Record<string, unknown>) {
  return String(row.id ?? row.screen_number ?? row.user_id ?? JSON.stringify(row));
}

async function readTable(supabase: ReturnType<typeof createServiceRoleClient>, table: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows.sort((a, b) => (stableKey(a) < stableKey(b) ? -1 : stableKey(a) > stableKey(b) ? 1 : 0));
}

async function listBucket(supabase: ReturnType<typeof createServiceRoleClient>, bucket: string) {
  const files: { path: string; size: number | null; type: string | null; updated_at: string | null; url: string }[] = [];
  async function walk(prefix: string, depth: number) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`${bucket}: ${error.message}`);
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id) {
          if (depth < 3) await walk(path, depth + 1); // folder (one per club)
          continue;
        }
        const meta = (item.metadata ?? {}) as { size?: number; mimetype?: string };
        files.push({
          path,
          size: meta.size ?? null,
          type: meta.mimetype ?? null,
          updated_at: item.updated_at ?? null,
          url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
        });
      }
      if (!data || data.length < 100) break;
    }
  }
  await walk("", 0);
  return files;
}

async function gh(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: body as Record<string, any> | null };
}

function ghError(step: string, res: { status: number; body: Record<string, any> | null }) {
  const why = res.body?.message || `HTTP ${res.status}`;
  if (res.status === 401) return new Error(`GitHub rejected the token (${step}). Check GITHUB_BACKUP_TOKEN in Vercel.`);
  if (res.status === 403 || res.status === 404) return new Error(`GitHub: no write access to the backup repo (${step}: ${why}). The token needs Contents: Read and write on that repo.`);
  return new Error(`GitHub ${step} failed: ${why}`);
}

const README = `# TECHIDEATE '26 backups

Written automatically by the admin panel (every 30 minutes, and when a Super Admin presses "Back up now").

- \`backup/<table>.json\` — every row of that database table.
- \`backup/media-files.json\` — every poster/video in storage, with its size and link (the files themselves stay in Supabase).
- Git history keeps every earlier version: open the commit list to see the data at any past time.

Not included: the media files, passwords (people reset them after a restore) and secret keys.
`;

async function currentHead(repo: string, branch: string, token: string) {
  let ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`, token);
  if (ref.status === 404 || ref.status === 409) {
    // empty repo: the low-level git API needs one commit first
    const init = await gh(`/repos/${repo}/contents/README.md`, token, {
      method: "PUT",
      body: JSON.stringify({ message: "Start backups", content: Buffer.from(README).toString("base64"), branch })
    });
    if (init.status >= 300) throw ghError("creating the first commit", init);
    ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`, token);
  }
  if (ref.status >= 300 || !ref.body?.object?.sha) throw ghError("reading the branch", ref);
  const commitSha = ref.body.object.sha as string;
  const commit = await gh(`/repos/${repo}/git/commits/${commitSha}`, token);
  if (commit.status >= 300) throw ghError("reading the last commit", commit);
  return { commitSha, treeSha: commit.body!.tree.sha as string };
}

export async function runBackup({ type, triggeredBy }: { type: "scheduled" | "manual"; triggeredBy?: string | null }): Promise<BackupOutcome> {
  const { token, repo, branch } = backupConfig();
  const supabase = createServiceRoleClient();

  const { data: run } = await supabase
    .from("backup_runs")
    .insert({ backup_type: type, status: "running", triggered_by: triggeredBy ?? null, manifest: { github_repo: repo } })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id;
  const finish = async (fields: Record<string, unknown>) => {
    if (runId) await supabase.from("backup_runs").update({ completed_at: new Date().toISOString(), ...fields }).eq("id", runId);
  };

  try {
    if (!token) throw new Error("GITHUB_BACKUP_TOKEN is not set in Vercel, so there is nowhere to save the backup.");

    const files: { path: string; content: string }[] = [];
    const counts: Record<string, number | string> = {};
    for (const table of TABLES) {
      try {
        const rows = await readTable(supabase, table);
        counts[table] = rows.length;
        files.push({ path: `backup/${table}.json`, content: JSON.stringify(rows, null, 2) + "\n" });
      } catch (error) {
        // a table from a migration that hasn't been run yet: note it, keep going
        counts[table] = `skipped: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const media: Record<string, unknown> = {};
    for (const bucket of BUCKETS) {
      try {
        media[bucket] = await listBucket(supabase, bucket);
      } catch (error) {
        media[bucket] = `skipped: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    files.push({ path: "backup/media-files.json", content: JSON.stringify(media, null, 2) + "\n" });
    files.push({ path: "README.md", content: README });
    const sizeBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);

    const head = await currentHead(repo, branch, token);
    const tree = await gh(`/repos/${repo}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({ base_tree: head.treeSha, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })) })
    });
    if (tree.status >= 300) throw ghError("saving the files", tree);

    const manifest = { github_repo: repo, rows: counts, files: files.length };
    const lastUrl = `https://github.com/${repo}/commit/${head.commitSha}`;
    if (tree.body!.sha === head.treeSha) {
      await finish({ status: "success", size_bytes: sizeBytes, storage_location: lastUrl, manifest: { ...manifest, changed: false } });
      return { ok: true, changed: false, message: "Nothing changed since the last backup, so no new copy was needed.", commitUrl: lastUrl };
    }

    const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const commit = await gh(`/repos/${repo}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({ message: `${type === "manual" ? "Manual" : "Scheduled"} backup · ${stamp} IST`, tree: tree.body!.sha, parents: [head.commitSha] })
    });
    if (commit.status >= 300) throw ghError("creating the commit", commit);
    const update = await gh(`/repos/${repo}/git/refs/heads/${branch}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.body!.sha })
    });
    if (update.status >= 300) throw ghError("moving the branch (another backup may have run at the same moment; try again)", update);

    const commitUrl = `https://github.com/${repo}/commit/${commit.body!.sha}`;
    await finish({ status: "success", size_bytes: sizeBytes, storage_location: commitUrl, manifest: { ...manifest, changed: true, commit: commit.body!.sha } });
    return { ok: true, changed: true, message: "Backup saved to GitHub.", commitUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: "failed", failure_reason: message });
    return { ok: false, changed: false, message };
  }
}

"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { inviteAdmin } from "@/lib/actions/admins";
import type { AppRole, Club } from "@/lib/supabase/types";

type OpsClubRow = {
  id: number;
  clubId: string;
};

function clubLabel(club: Club) {
  return club.short_name ? `${club.short_name} — ${club.name}` : club.name;
}

/** collabIds: collab entries ("ACM x SIGAI") — not offered for Club Admin accounts, since the partner clubs' admins run them */
export function TeamAccessCreateForm({ clubs, collabIds = [] }: { clubs: Club[]; collabIds?: string[] }) {
  const [role, setRole] = useState<AppRole>("club_admin");
  const [nextOpsRowId, setNextOpsRowId] = useState(1);
  const [opsClubRows, setOpsClubRows] = useState<OpsClubRow[]>([{ id: 0, clubId: "" }]);
  const noClubs = !clubs.length;
  const maxOpsRows = Math.min(10, clubs.length);
  const selectedOpsClubIds = useMemo(() => opsClubRows.map((row) => row.clubId).filter(Boolean), [opsClubRows]);
  const canAddOpsClub = role === "event_ops" && !noClubs && opsClubRows.length < maxOpsRows && opsClubRows.every((row) => row.clubId);

  function updateOpsClub(rowId: number, clubId: string) {
    setOpsClubRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, clubId } : row)));
  }

  function addOpsClubRow() {
    if (!canAddOpsClub) return;
    setOpsClubRows((rows) => [...rows, { id: nextOpsRowId, clubId: "" }]);
    setNextOpsRowId((id) => id + 1);
  }

  function removeOpsClubRow(rowId: number) {
    setOpsClubRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  return (
    <form action={inviteAdmin} className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-12">
        <input name="name" required placeholder="Name" className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
        <input name="login_id" required minLength={3} placeholder="Login ID (no spaces)" title="Letters, numbers, dots, dashes or underscores. Spaces become dots." className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
        <input name="email" required type="email" placeholder="Email" className="h-11 rounded-lg border border-border px-3 xl:col-span-3" />
        <input name="password" required type="text" minLength={8} placeholder="Fixed password" className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
        <select
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as AppRole)}
          className="h-11 rounded-lg border border-border px-3 xl:col-span-3"
        >
          <option value="club_admin">Club Admin</option>
          <option value="event_ops">Ops / POC Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      {role === "club_admin" ? (
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Club Admin access</span>
          <select name="club_id" required className="h-11 w-full rounded-lg border border-border px-3" disabled={noClubs}>
            <option value="">{noClubs ? "No clubs yet" : "Select one club"}</option>
            {clubs.filter((club) => !collabIds.includes(club.id)).map((club) => (
              <option key={club.id} value={club.id}>{clubLabel(club)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {role === "event_ops" ? (
        <div className="rounded-2xl border border-border bg-slate-50 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Ops / POC club access</div>
              <div className="text-xs text-muted">Choose up to 10 clubs. Selected clubs disappear from the next dropdown.</div>
            </div>
            <button
              type="button"
              disabled={!canAddOpsClub}
              onClick={addOpsClubRow}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add another club
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {opsClubRows.map((row, index) => {
              const selectedInOtherRows = selectedOpsClubIds.filter((clubId) => clubId !== row.clubId);
              const availableClubs = clubs.filter((club) => !selectedInOtherRows.includes(club.id));

              return (
                <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    name="club_ids"
                    required
                    value={row.clubId}
                    onChange={(event) => updateOpsClub(row.id, event.target.value)}
                    className="h-11 rounded-lg border border-border bg-white px-3"
                    disabled={noClubs}
                  >
                    <option value="">{noClubs ? "No clubs yet" : `Select club ${index + 1}`}</option>
                    {availableClubs.map((club) => (
                      <option key={club.id} value={club.id}>{clubLabel(club)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove club ${index + 1}`}
                    disabled={opsClubRows.length === 1}
                    onClick={() => removeOpsClubRow(row.id)}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-white text-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {selectedOpsClubIds.length >= maxOpsRows && maxOpsRows > 0 ? (
            <p className="mt-2 text-xs text-muted">All available club slots for this Ops / POC admin are selected.</p>
          ) : null}
        </div>
      ) : null}

      {role === "super_admin" ? (
        <div className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
          Super Admin gets access to every club and every control.
        </div>
      ) : null}

      <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white">
        <Plus className="h-4 w-4" /> Create
      </button>
    </form>
  );
}

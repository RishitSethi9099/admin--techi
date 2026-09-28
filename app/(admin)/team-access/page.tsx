import { Ban, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireSuperAdmin } from "@/lib/auth";
import { getAdmins, getClubs } from "@/lib/data";
import { inviteAdmin, updateAdmin } from "@/lib/actions/admins";
import { formatDateTime } from "@/lib/utils";

export default async function TeamAccessPage({
  searchParams
}: {
  searchParams?: { created?: string; updated?: string; email?: string; error?: string };
}) {
  await requireSuperAdmin();
  const loadResult = await Promise.all([getAdmins(), getClubs()])
    .then(([admins, clubs]) => ({ admins, clubs, error: null as string | null }))
    .catch((error: Error) => ({ admins: [], clubs: [], error: error.message }));
  const { admins, clubs } = loadResult;
  const clubName = (id: string | null) => clubs.find((club) => club.id === id)?.name ?? "All clubs";

  return (
    <>
      <PageTitle
        title="Team Access"
        subtitle="Create fixed admin credentials, check active access, and control ID/IP bans."
      />

      {searchParams?.created ? (
        <Card className="mb-5 border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Admin access created{searchParams.email ? ` for ${searchParams.email}` : ""}. The form has been reset for the next account.
        </Card>
      ) : null}

      {searchParams?.updated ? (
        <Card className="mb-5 border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Admin access updated.
        </Card>
      ) : null}

      {searchParams?.error ? (
        <Card className="mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {searchParams.error}
        </Card>
      ) : null}

      {loadResult.error ? (
        <Card className="mb-5 border-amber-200 bg-amber-50 p-5 text-amber-800">
          <div className="font-semibold">Team Access needs a Supabase schema update</div>
          <p className="mt-2 text-sm">
            {loadResult.error}
          </p>
          <p className="mt-2 text-sm">
            Run all migrations up to <code>005_billboard_uploads_and_scope.sql</code>, then refresh this page.
          </p>
        </Card>
      ) : null}

      <Card className="mb-5 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" />
          Create admin access
        </div>
        <form action={inviteAdmin} className="grid gap-3 xl:grid-cols-12">
          <input name="name" required placeholder="Name" className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
          <input name="login_id" required placeholder="Login ID" className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
          <input name="email" required type="email" placeholder="Email" className="h-11 rounded-lg border border-border px-3 xl:col-span-3" />
          <input name="password" required type="text" minLength={8} placeholder="Fixed password" className="h-11 rounded-lg border border-border px-3 xl:col-span-2" />
          <select name="role" className="h-11 rounded-lg border border-border px-3 xl:col-span-1">
            <option value="club_admin">Club</option>
            <option value="event_ops">Ops</option>
            <option value="super_admin">Super</option>
          </select>
          <select name="club_id" className="h-11 rounded-lg border border-border px-3 xl:col-span-1" disabled={!clubs.length}>
            <option value="">{clubs.length ? "Select club" : "No clubs yet"}</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>{club.short_name ? `${club.short_name} — ${club.name}` : club.name}</option>
            ))}
          </select>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white xl:col-span-1">
            <Plus className="h-4 w-4" /> Create
          </button>
        </form>
        {!clubs.length ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Create/import clubs first. Club admins and POC admins need a club assignment before they can be created.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          Passwords are created by Super Admin. Admins should not get a self-service password-change flow unless you enable it later.
        </p>
      </Card>

      {!admins.length ? (
        <EmptyState title="No admin accounts" description="Create the first admin access record once Supabase is connected." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {admins.map((admin) => (
            <Card key={admin.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-foreground">{admin.name}</div>
                    <Badge tone={admin.role === "super_admin" ? "purple" : admin.role === "event_ops" ? "blue" : "grey"}>
                      {admin.role.replace("_", " ")}
                    </Badge>
                    <StatusBadge status={admin.status} />
                  </div>
                  <div className="mt-1 truncate text-sm text-muted">{admin.email}</div>
                  <div className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
                    <span>Login ID: {admin.login_id ?? "not set"}</span>
                    <span>Club: {clubName(admin.club_id)}</span>
                    <span>Last active: {formatDateTime(admin.last_login_at)}</span>
                    <span>
                      Ban flags: {admin.id_banned ? "ID banned" : "ID clear"} / {admin.ip_banned ? "IP banned" : "IP clear"}
                    </span>
                  </div>
                </div>
                <form action={updateAdmin} className="w-full space-y-2 lg:w-80">
                  <input type="hidden" name="id" value={admin.id} />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select name="status" defaultValue={admin.status} className="h-9 rounded-lg border border-border px-2 text-sm">
                      <option value="active">Active</option>
                      <option value="invited">Invited</option>
                      <option value="suspended">Suspended</option>
                    </select>
                    <button className="rounded-lg bg-primary px-3 text-sm font-medium text-white">Save</button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" name="id_banned" defaultChecked={admin.id_banned} /> <Ban className="h-3.5 w-3.5" /> ID ban
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" name="ip_banned" defaultChecked={admin.ip_banned} /> <ShieldCheck className="h-3.5 w-3.5" /> IP ban
                    </label>
                  </div>
                  <input name="banned_ip" defaultValue={admin.banned_ip ?? ""} placeholder="IP to ban" className="h-9 w-full rounded-lg border border-border px-2 text-sm" />
                  <input name="ban_reason" defaultValue={admin.ban_reason ?? ""} placeholder="Ban reason" className="h-9 w-full rounded-lg border border-border px-2 text-sm" />
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

# Techi Admin

Next.js 14 admin panel for Techi.

## Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/001_initial_schema.sql`.
3. Create `.env.local` and fill the Supabase, Resend, Sentry, and webhook values listed below.
4. Run the app:

```bash
npm install
npm run dev
```

## Current Scope

The admin panel includes:

- Supabase auth middleware and login.
- Three administrative roles: `super_admin`, `club_admin`, and `event_ops`.
- Server-side route authorization through explicit permissions.
- Role-specific dashboards for Super Admin, Club Admin, and Event Ops.
- Approval request workflow for protected changes and sensitive submissions.
- Soft-deletion-ready schema fields for protected records.
- Audit Log viewer and append-only audit migration support.
- System Health and Errors sections backed by real `crash_logs`.
- Backup tracking section that records not-configured state instead of fake successes.
- Admin Management for Super Admin role assignment/suspension.
- Billboards/promotions and events routed through approval for non-super roles.
- `/api/webhooks/crash-alert` for Sentry or uptime alerts, Resend email, and optional Discord.

## Production Control Migrations

Apply these migrations in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_platform_control.sql`
3. `supabase/migrations/003_audit_error_rich_metadata.sql`
4. `supabase/migrations/004_team_access_bans.sql`
5. `supabase/migrations/005_billboard_uploads_and_scope.sql`

The second and third migrations add the production control-system layer: Event Ops role support, approval requests, notification records, backup run tracking, event lifecycle states, soft deletion metadata, richer error monitoring, and richer audit metadata.

Seed the initial club list with:

```sql
supabase/seeds/initial_clubs.sql
```

## Real Integrations Required

These pieces are prepared but intentionally do not pretend to be active until credentials/services are connected:

- Supabase Auth, Postgres, Storage, and Realtime
- GitHub backup repo writer for `RishitSethi9099/backup-repo-`
- Private media/full-dump backup storage bucket
- Registration provider
- Uptime/Sentry webhook senders
- Deployment environment health checks

## Vercel Environment Variables

This project is pinned to Node.js 20 through `package.json` and `.nvmrc`. In Vercel, import the GitHub repo, keep the framework as Next.js, and deploy from `main`.

Required for deployment:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
```

Optional alert email variables:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
SUPER_ADMIN_ALERT_EMAIL=
CRASH_WEBHOOK_SECRET=
DISCORD_WEBHOOK_URL=
```

If `RESEND_FROM_EMAIL` is empty, the crash alert route uses Resend's temporary `onboarding@resend.dev` sender. That is useful before a domain is verified, but production email should use a verified Resend domain.

Email routing:

- Platform-wide errors go to active `super_admin` users.
- Club-specific billboard/event/schedule errors go only to active `club_admin` users assigned to that club.
- Banned or suspended admins are not emailed.

## Security Note

This project stays on Next.js 14 as requested. As of the current npm registry audit, Next 14 is flagged with unresolved advisories and npm recommends a breaking upgrade to Next 16. Before production deployment, either approve a Next 16 upgrade or verify a patched Next 14 release is available.

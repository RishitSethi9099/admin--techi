# Techi Admin

Next.js 14 admin panel for Techi.

## Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/001_initial_schema.sql`.
3. Copy `.env.example` to `.env.local` and fill the Supabase, Resend, Sentry, and webhook values.
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

The second and third migrations add the production control-system layer: Event Ops role support, approval requests, notification records, backup run tracking, event lifecycle states, soft deletion metadata, richer error monitoring, and richer audit metadata.

## Real Integrations Required

These pieces are prepared but intentionally do not pretend to be active until credentials/services are connected:

- Supabase Auth, Postgres, Storage, and Realtime
- GitHub backup repo writer for `RishitSethi9099/backup-repo-`
- Private media/full-dump backup storage bucket
- Registration provider
- Uptime/Sentry webhook senders
- Deployment environment health checks

## Security Note

This project stays on Next.js 14 as requested. As of the current npm registry audit, Next 14 is flagged with unresolved advisories and npm recommends a breaking upgrade to Next 16. Before production deployment, either approve a Next 16 upgrade or verify a patched Next 14 release is available.

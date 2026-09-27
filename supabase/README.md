# Techi Supabase

The migration in `migrations/001_initial_schema.sql` creates the shared database for `techi-admin` and `techi-website`.

Apply it in Supabase SQL Editor or with the Supabase CLI once the project is linked:

```bash
supabase db push
```

The schema includes app roles, club-scoped RLS, approval status protections, private media buckets, public team-photo reads, audit-log support through a service-role helper, and realtime publication for `crash_logs`.

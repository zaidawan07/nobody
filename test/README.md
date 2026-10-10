# RLS test battery

These scripts evaluate migrations `0000`..`0007` against a real Postgres
engine (not a mock). Use the in-process WASM Postgres runner
(`node test/run-tests.mjs`) on any machine, or the psql commands below on a
machine with a Postgres server:

```bash
createdb estateos_test
psql -d estateos_test -f test/00_supabase_stub.sql
psql -d estateos_test -f drizzle/migrations/0000_multi_tenant_realestate_foundation.sql
psql -d estateos_test -f drizzle/migrations/0001_tenant_isolation_and_employee_scope.sql
psql -d estateos_test -f drizzle/migrations/0002_property_contacts_media_checkins.sql
psql -d estateos_test -f drizzle/migrations/0003_conversations_media_scope.sql
psql -d estateos_test -f drizzle/migrations/0004_tenant_link_integrity.sql
psql -d estateos_test -f drizzle/migrations/0005_real_media_and_locations.sql
psql -d estateos_test -f drizzle/migrations/0006_super_admin_plans_subscriptions_usage_audit.sql
psql -d estateos_test -f drizzle/migrations/0007_super_admin_platform_lockdown.sql
psql -d estateos_test -f test/01_seed.sql
psql -d estateos_test -f test/02_security_tests.sql
psql -d estateos_test -f test/03_extended_security_tests.sql
psql -d estateos_test -f test/04_super_admin_security_tests.sql
```

Or run everything in-process against a WASM Postgres (no server required):

```bash
npm install --save-dev @electric-sql/pglite
node test/run-tests.mjs
```

A clean run prints the number of sections executed, the number of
`(expect ERROR ...)` sections that raised as expected, one `PASS ...` NOTICE
per numbered test (T1-T30 plus the bootstrap test) and **no** unexpected
`ERROR`. The lines that say `(expect ERROR ...)` in the `\echo` banner are
supposed to raise -- that's `psql` showing the RLS/trigger guard doing its
job, not a failure. `\set ON_ERROR_STOP off` is what lets the script keep
going after those.

`04_super_admin_security_tests.sql` covers the platform tables from
migration 0006: an agency admin or employee cannot write plans, plan
features or their own subscription; one agency cannot read another agency's
subscription, usage or audit rows; anon reads nothing; and the super admin
can read every platform row and write plans.

If you're running against your actual Supabase project instead of a scratch
Postgres, skip `00_supabase_stub.sql` (the real `auth` schema already exists)
and reset `assigned_to`/`agency_id` on any seeded rows afterwards -- the seed
data is meant for a throwaway database, not to be left in a shared one.

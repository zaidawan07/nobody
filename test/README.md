# RLS test battery

These scripts evaluate migrations `0000`..`0016` against a real Postgres
engine (not a mock). Use the in-process WASM Postgres runner
(`node test/run-tests.mjs`) on any machine, or the psql commands below on a
machine with a Postgres server.

Note: the psql list below is a historical subset (through migration 0008 and
test file 05). `test/run-tests.mjs` is the source of truth for the full order
(migrations 0000-0016 plus test files 01-11); this section has not been kept in
sync by hand beyond 0008.

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
psql -d estateos_test -f drizzle/migrations/0008_plan_limits.sql
psql -d estateos_test -f test/01_seed.sql
psql -d estateos_test -f test/02_security_tests.sql
psql -d estateos_test -f test/03_extended_security_tests.sql
psql -d estateos_test -f test/04_super_admin_security_tests.sql
psql -d estateos_test -f test/05_subscription_limits.sql
```

Or run everything in-process against a WASM Postgres (no server required):

```bash
npm install --save-dev @electric-sql/pglite
node test/run-tests.mjs
```

A clean run prints the number of sections executed, the number of
`(expect ERROR ...)` sections that raised as expected, one `PASS ...` NOTICE
per numbered test (T1-T41 plus the bootstrap test) and **no** unexpected
`ERROR`. The lines that say `(expect ERROR ...)` in the `\echo` banner are
supposed to raise -- that's `psql` showing the RLS/trigger guard doing its
job, not a failure. `\set ON_ERROR_STOP off` is what lets the script keep
going after those.

`04_super_admin_security_tests.sql` covers the platform tables from
migration 0006: an agency admin or employee cannot write plans, plan
features or their own subscription; one agency cannot read another agency's
subscription, usage or audit rows; anon reads nothing; and the super admin
can read every platform row and write plans.

`05_subscription_limits.sql` covers migrations 0008 and 0016: an agency at its
property or lead cap is refused the next insert by the database trigger, an
unlimited plan is unconstrained, an agency with **no subscription row now
behaves as the Free plan** (0016 — it used to be unconstrained), owner-context
maintenance still works, and the `plan_limit_for_agency` /
`count_agency_metric` / `agency_is_billing_active` helpers refuse cross-agency
probes (they are `SECURITY DEFINER`, so RLS alone would not protect them).

If you're running against your actual Supabase project instead of a scratch
Postgres, skip `00_supabase_stub.sql` (the real `auth` schema already exists)
and reset `assigned_to`/`agency_id` on any seeded rows afterwards -- the seed
data is meant for a throwaway database, not to be left in a shared one.

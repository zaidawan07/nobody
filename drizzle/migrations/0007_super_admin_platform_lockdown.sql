-- ============================================================================
-- 0007: Platform lockdown for the 0006 tables + property_status alignment
--
-- Three separate problems, all found by auditing the Super Admin panel:
--
--  1. property_status drift. Migration 0000 created the enum with five
--     values, but the application (property wizard, edit dialog, status
--     changer, list filter) and the live database both carry 'draft',
--     'unavailable' and 'expired'. Nothing in 0001..0006 ever added them, so
--     a database built from these migrations rejects writes the UI offers.
--     ADD VALUE IF NOT EXISTS keeps this safe against the live project, where
--     the values already exist.
--
--  2. anon could read the platform catalogue. 0006 granted SELECT on plans /
--     plan_features to anon (and 0005 did the same for locations), so an
--     unauthenticated caller could enumerate pricing. No public route in
--     src/routes reads them. Revoke the grants and replace the policies with
--     authenticated-only equivalents.
--
--  3. 0006 wrote super-admin FOR ALL policies for plans / plan_features /
--     subscriptions but granted authenticated SELECT only, so the policy was
--     inoperative: even a super admin could not write through PostgREST and
--     the RLS rules could not be tested. Grant the DML so RLS -- the security
--     boundary -- is what actually decides.
--
--  4. two of 0006's updated_at triggers point at columns that 0006 never
--     created, which breaks any UPDATE on plan_features.
--
-- usage_counters and audit_logs deliberately keep SELECT-only grants for
-- authenticated: nothing in the app writes them, and 0006 scopes their writes
-- to service_role.
-- ============================================================================

-- ---------- 1. property_status: match the live schema and the UI ----------
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'unavailable';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'expired';

-- ---------- 2. anon reads nothing on the platform/geo tables ----------
REVOKE SELECT ON public.plans FROM anon;
REVOKE SELECT ON public.plan_features FROM anon;
REVOKE SELECT ON public.locations FROM anon;

DROP POLICY IF EXISTS "public read plans" ON public.plans;
DROP POLICY IF EXISTS "members read active plans" ON public.plans;
CREATE POLICY "members read active plans" ON public.plans
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "public read plan_features" ON public.plan_features;
DROP POLICY IF EXISTS "members read plan_features" ON public.plan_features;
CREATE POLICY "members read plan_features" ON public.plan_features
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "locations readable by anon" ON public.locations;

-- ---------- 2b. two 0006 triggers point at columns that do not exist ----------
-- set_updated_at() assigns NEW.updated_at, but 0006 created
-- plan_features and audit_logs WITHOUT an updated_at column, so *any* UPDATE
-- on plan_features raises record "new" has no field "updated_at" (that is the
-- path the Plans page uses to edit a feature). Give plan_features the column
-- the trigger expects; audit_logs is append-only (insert policy only, never
-- updated), so drop its trigger instead of widening the table.
ALTER TABLE public.plan_features ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_updated_at_audit_logs ON public.audit_logs;

-- ---------- 3. make the super-admin write policies operable ----------
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_features TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

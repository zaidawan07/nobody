-- Plan-limit battery for migration 0008.
-- Runs after 04, whose fixtures leave Agency A on the Free plan
-- (properties 5, leads 20, team_members 2) and Agency B on Professional
-- (properties/leads unlimited, team_members 10).
--
-- The 02/03/04 files insert fixtures as the table owner, and 0008 skips
-- enforcement when auth.uid() IS NULL, so none of those writes are affected.
--
-- Same conventions: PASS notices are the goal; statements under an
-- "(expect ERROR ...)" banner are SUPPOSED to fail.
--
-- Counts are derived at runtime rather than hardcoded, so this stays green
-- even if the property/lead fixtures change.

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

-- ---------------------------------------------------------------------------
-- Fixtures: fill Agency A exactly up to its property and lead limits. Written
-- as the owner (auth.uid() IS NULL), so the limit guard does not apply --
-- exactly like the 01_seed fixture inserts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_have int;
BEGIN
  SELECT count(*) INTO v_have FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  INSERT INTO public.properties (id, agency_id, title, property_type, purpose, status)
  SELECT gen_random_uuid(),
         '10000000-0000-0000-0000-000000000001',
         'A - filler property ' || i,
         'house', 'sale', 'available'
    FROM generate_series(1, 5 - v_have) AS i;
END $$;

DO $$
DECLARE v_have int;
BEGIN
  SELECT count(*) INTO v_have FROM public.leads
   WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  INSERT INTO public.leads (id, agency_id, name, status)
  SELECT gen_random_uuid(),
         '10000000-0000-0000-0000-000000000001',
         'A - filler lead ' || i,
         'new'
    FROM generate_series(1, 20 - v_have) AS i;
END $$;

\echo '--- T31: agency A is at its property limit before the tests below ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL T31: expected 5 Agency A properties, found %', n; END IF;
  SELECT count(*) INTO n FROM public.leads WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 20 THEN RAISE EXCEPTION 'FAIL T31: expected 20 Agency A leads, found %', n; END IF;
  RAISE NOTICE 'PASS T31: Agency A has 5 properties and 20 leads (its Free limits)';
END $$;

-- ---------------------------------------------------------------------------
-- T32: an authenticated agency admin cannot insert the 6th property
-- ---------------------------------------------------------------------------
\echo '--- T32: Agency A admin cannot add the 6th property over the Free limit (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.properties (agency_id, title, property_type, purpose, status)
VALUES ('10000000-0000-0000-0000-000000000001', 'A - over limit', 'house', 'sale', 'available');

-- ---------------------------------------------------------------------------
-- T33: an authenticated agency admin cannot insert the 21st lead
-- ---------------------------------------------------------------------------
\echo '--- T33: Agency A admin cannot add the 21st lead over the Free limit (expect ERROR) ---'
INSERT INTO public.leads (agency_id, name, status)
VALUES ('10000000-0000-0000-0000-000000000001', 'A - lead over limit', 'new');

-- ---------------------------------------------------------------------------
-- T34: nothing was actually written by the rejected inserts
-- ---------------------------------------------------------------------------
\echo '--- T34: rejected inserts left no trace ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL T34: Agency A has % properties, expected 5', n; END IF;
  SELECT count(*) INTO n FROM public.leads WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 20 THEN RAISE EXCEPTION 'FAIL T34: Agency A has % leads, expected 20', n; END IF;
  RAISE NOTICE 'PASS T34: both rejected writes left no trace';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T35: an unlimited plan (limit_value = -1) is not constrained
-- ---------------------------------------------------------------------------
\echo '--- T35: Agency B admin on the unlimited Professional plan can add properties ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.properties (agency_id, title, property_type, purpose, status)
  VALUES ('10000000-0000-0000-0000-000000000002', 'B - unlimited ok', 'house', 'sale', 'available');
  SELECT count(*) INTO n FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000002' AND title = 'B - unlimited ok';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T35: unlimited plan insert produced % rows', n; END IF;
  RAISE NOTICE 'PASS T35: unlimited plan insert allowed';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T36: no subscription row means FREE limits, not unlimited (migration 0016).
--
-- This is the regression guard for 0016. Before it, plan_limit_for_agency()
-- returned NULL (unconstrained) for an agency with no subscriptions row, and
-- the 6th property below would have been accepted. Now the helper must return
-- the Free limits and the trigger must refuse the write.
-- ---------------------------------------------------------------------------
\echo '--- T36: an agency with no subscription row reports the Free plan limits ---'
DELETE FROM public.subscriptions WHERE agency_id = '10000000-0000-0000-0000-000000000002';

-- Put Agency B at or above the Free property cap, written as the owner so the
-- guard does not apply (same escape hatch as the 01_seed inserts). Only adds
-- rows, so it cannot disturb fixtures written by earlier files.
DO $$
DECLARE v_have int;
BEGIN
  SELECT count(*) INTO v_have FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF v_have < 5 THEN
    INSERT INTO public.properties (id, agency_id, title, property_type, purpose, status)
    SELECT gen_random_uuid(),
           '10000000-0000-0000-0000-000000000002',
           'B - free-cap fixture ' || i,
           'house', 'sale', 'available'
      FROM generate_series(1, 5 - v_have) AS i;
  END IF;
END $$;

SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE v bigint; n int;
BEGIN
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'properties');
  IF v <> 5 THEN RAISE EXCEPTION 'FAIL T36: no-subscription properties limit = %, expected Free 5', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'leads');
  IF v <> 20 THEN RAISE EXCEPTION 'FAIL T36: no-subscription leads limit = %, expected Free 20', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'team_members');
  IF v <> 2 THEN RAISE EXCEPTION 'FAIL T36: no-subscription team_members limit = %, expected Free 2', v; END IF;
  RAISE NOTICE 'PASS T36: no subscription row now reports the Free plan limits (5/20/2)';
END $$;

\echo '--- T36b: the no-subscription agency admin cannot exceed the Free property cap (expect ERROR) ---'
INSERT INTO public.properties (agency_id, title, property_type, purpose, status)
VALUES ('10000000-0000-0000-0000-000000000002', 'B - over free cap', 'house', 'sale', 'available');

\echo '--- T36c: the rejected write left no trace and the cap was not widened ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n < 5 THEN RAISE EXCEPTION 'FAIL T36c: Agency B dropped below its free-cap fixture (% rows)', n; END IF;
  SELECT count(*) INTO n FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000002' AND title = 'B - over free cap';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T36c: the over-cap property was written anyway'; END IF;
  RAISE NOTICE 'PASS T36c: the over-cap insert was rejected';
END $$;
SELECT test_logout();

-- restore the B fixture the rest of the suite may rely on
INSERT INTO public.subscriptions (id, agency_id, plan_id, status)
VALUES ('90000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'active');

-- ---------------------------------------------------------------------------
-- T37: maintenance/provisioning writes are not subject to the limits.
--
-- Note on the stub: here `service_role` has no BYPASSRLS attribute and no
-- RLS policy on properties, so an insert AS service_role is stopped by RLS
-- before it ever reaches the trigger. On a real Supabase project service_role
-- bypasses RLS entirely, so it also bypasses this trigger. The property we can
-- verify in this scratch database is the one the guard actually keys on:
-- auth.uid() IS NULL (owner / seed / migration context) is not limited. That
-- is the same escape hatch 01_seed.sql relies on.
-- ---------------------------------------------------------------------------
\echo '--- T37: owner-context maintenance writes are not limited by the plan ---'
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
  RESET ROLE;
  INSERT INTO public.properties (agency_id, title, property_type, purpose, status)
  VALUES ('10000000-0000-0000-0000-000000000001', 'A - maintenance ok', 'house', 'sale', 'available');
  SELECT count(*) INTO n FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000001' AND title = 'A - maintenance ok';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T37: maintenance insert produced % rows', n; END IF;
  RAISE NOTICE 'PASS T37: owner-context write over the limit was allowed';
END $$;

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);

-- clean the maintenance row back out so the counts above stay meaningful
SELECT test_logout();
DELETE FROM public.properties WHERE title = 'A - maintenance ok';

-- ---------------------------------------------------------------------------
-- T38/T39: run as the super admin (the helpers now refuse cross-agency probes)
-- ---------------------------------------------------------------------------
\echo '--- T38: plan_limit_for_agency returns the seeded limits ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE v bigint;
BEGIN
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'properties');
  IF v <> 5 THEN RAISE EXCEPTION 'FAIL T38: agency A properties limit = %', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'leads');
  IF v <> 20 THEN RAISE EXCEPTION 'FAIL T38: agency A leads limit = %', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'team_members');
  IF v <> 2 THEN RAISE EXCEPTION 'FAIL T38: agency A team_members limit = %', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'properties');
  IF v <> -1 THEN RAISE EXCEPTION 'FAIL T38: agency B properties limit = %', v; END IF;
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'team_members');
  IF v <> 10 THEN RAISE EXCEPTION 'FAIL T38: agency B team_members limit = %', v; END IF;
  v := public.count_agency_metric('10000000-0000-0000-0000-000000000001', 'properties');
  IF v <> 5 THEN RAISE EXCEPTION 'FAIL T38: agency A live property count = %', v; END IF;
  v := public.count_agency_metric('10000000-0000-0000-0000-000000000001', 'whatsapp_messages');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL T38: uncounted metric leaked a count of %', v; END IF;
  RAISE NOTICE 'PASS T38: limits and live counts match the seeded plan features';
END $$;

\echo '--- T39: agency_is_billing_active reflects subscription status ---'
DO $$
DECLARE v boolean;
BEGIN
  v := public.agency_is_billing_active('10000000-0000-0000-0000-000000000001');
  IF v IS NOT TRUE THEN RAISE EXCEPTION 'FAIL T39: expected true for a trialing agency'; END IF;
  UPDATE public.subscriptions SET status = 'canceled' WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  v := public.agency_is_billing_active('10000000-0000-0000-0000-000000000001');
  IF v IS NOT FALSE THEN RAISE EXCEPTION 'FAIL T39: expected false for a canceled agency'; END IF;
  UPDATE public.subscriptions SET status = 'trialing' WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  v := public.agency_is_billing_active('10000000-0000-0000-0000-000000000001');
  IF v IS NOT TRUE THEN RAISE EXCEPTION 'FAIL T39: expected true again after restoring trialing'; END IF;
  RAISE NOTICE 'PASS T39: agency_is_billing_active tracks status';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T40: the helper functions refuse cross-agency probes (they are SECURITY
-- DEFINER, so RLS alone would not protect them)
-- ---------------------------------------------------------------------------
\echo '--- T40: an agency admin cannot read another agency''s limits or counts ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE v bigint;
BEGIN
  -- Agency B's own plan is readable: Professional, team_members limit 10
  v := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000002', 'team_members');
  IF v <> 10 THEN RAISE EXCEPTION 'FAIL T40: agency B could not read its own limit (%)', v; END IF;

  -- Agency A's limits are not
  IF public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'properties') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T40: agency B admin read agency A plan limits';
  END IF;
  IF public.count_agency_metric('10000000-0000-0000-0000-000000000001', 'properties') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T40: agency B admin read agency A record counts';
  END IF;
  IF public.agency_is_billing_active('10000000-0000-0000-0000-000000000001') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL T40: agency B admin read agency A billing state';
  END IF;
  RAISE NOTICE 'PASS T40: cross-agency probes return null/false';
END $$;

\echo '--- T41: anon cannot use the helpers at all ---'
SET ROLE anon;
DO $$
BEGIN
  -- Either outcome is a pass: anon has no EXECUTE at all since 0009 revoked
  -- it (permission denied), or a narrower grant leaves it with no data.
  DECLARE n int;
  BEGIN
    IF public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'properties') IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL T41: anon read agency A plan limits';
    END IF;
    IF public.count_agency_metric('10000000-0000-0000-0000-000000000001', 'properties') IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL T41: anon read agency A record counts';
    END IF;
    RAISE NOTICE 'PASS T41: anon gets null from every helper';
  EXCEPTION WHEN insufficient_privilege OR undefined_function THEN
    RAISE NOTICE 'PASS T41: anon has no EXECUTE on the helpers at all';
  END;
END $$;
RESET ROLE;

\echo '=== PLAN LIMIT BATTERY DONE ==='

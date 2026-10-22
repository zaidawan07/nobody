-- Platform / Super Admin battery: migrations 0006 + 0007 (plans, plan
-- features, subscriptions, usage_counters, audit_logs).
-- Same conventions as 02 and 03: PASS notices are the goal, and every
-- statement under an "(expect ERROR ...)" banner is SUPPOSED to fail.
-- Run after test/03_extended_security_tests.sql.

\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- Fixtures. Written as the table owner (bypasses RLS) purely so that
-- cross-tenant reads have something to leak. Not part of what is tested.
-- ---------------------------------------------------------------------------
SELECT test_logout();

INSERT INTO public.subscriptions (id, agency_id, plan_id, status) VALUES
  ('90000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'trialing'),
  ('90000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'active');

INSERT INTO public.usage_counters (id, agency_id, metric_key, period_start, period_end, count, limit_value) VALUES
  ('91000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'properties', '2026-10-01 00:00:00+00', '2026-11-01 00:00:00+00', 3, 5),
  ('91000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'properties', '2026-10-01 00:00:00+00', '2026-11-01 00:00:00+00', 1, -1);

INSERT INTO public.audit_logs (id, actor_id, actor_role, agency_id, action) VALUES
  ('92000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'agency_admin', '10000000-0000-0000-0000-000000000001', 'fixture.agency_a'),
  ('92000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'agency_admin', '10000000-0000-0000-0000-000000000002', 'fixture.agency_b');

-- ---------------------------------------------------------------------------
-- T17: an agency admin cannot change their OWN subscription/plan
-- ---------------------------------------------------------------------------
\echo '--- T17: Agency A admin cannot change their own subscription (must fail) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int; before_plan uuid;
BEGIN
  SELECT plan_id INTO before_plan FROM public.subscriptions
    WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF before_plan IS NULL THEN
    RAISE EXCEPTION 'FAIL T17: fixture subscription for Agency A is missing';
  END IF;

  BEGIN
    UPDATE public.subscriptions
       SET plan_id = '33333333-3333-3333-3333-333333333333'
     WHERE agency_id = '10000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL T17: agency admin changed % subscription row(s)', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- blocked by table privileges instead of RLS: also a pass
  END;

  IF (SELECT plan_id FROM public.subscriptions
       WHERE agency_id = '10000000-0000-0000-0000-000000000001') <> before_plan THEN
    RAISE EXCEPTION 'FAIL T17: subscription plan_id changed';
  END IF;
  RAISE NOTICE 'PASS T17: agency admin could not reassign their own subscription';
END $$;

-- ---------------------------------------------------------------------------
-- T18: an agency admin cannot edit plans (price/name) either
-- ---------------------------------------------------------------------------
\echo '--- T18: Agency A admin cannot edit a plan (must fail) ---'
DO $$
DECLARE n int; before_price numeric;
BEGIN
  SELECT price_pkr INTO before_price FROM public.plans WHERE id = '11111111-1111-1111-1111-111111111111';
  IF before_price IS NULL THEN
    RAISE EXCEPTION 'FAIL T18: seeded Free plan is missing';
  END IF;

  BEGIN
    UPDATE public.plans SET name = name, price_pkr = price_pkr
     WHERE id = '11111111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL T18: agency admin updated % plan row(s)', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF (SELECT price_pkr FROM public.plans WHERE id = '11111111-1111-1111-1111-111111111111') <> before_price THEN
    RAISE EXCEPTION 'FAIL T18: plan price changed';
  END IF;
  RAISE NOTICE 'PASS T18: agency admin could not edit plans';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T19: an employee cannot change their own agency's subscription or plans
-- ---------------------------------------------------------------------------
\echo '--- T19: Agency A employee cannot change own agency subscription/plan (must fail) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.subscriptions
       SET plan_id = '33333333-3333-3333-3333-333333333333'
     WHERE agency_id = '10000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL T19: employee changed % subscription row(s)', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.plans SET price_pkr = price_pkr WHERE id = '11111111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL T19: employee updated % plan row(s)', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS T19: employee could not change their own agency''s subscription or the plans';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T20/T21: tenant isolation on reads
-- ---------------------------------------------------------------------------
\echo '--- T20: Agency A admin reads own subscription, never Agency B''s ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subscriptions WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T20: agency A admin saw % Agency B subscription rows', n; END IF;
  SELECT count(*) INTO n FROM public.subscriptions WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T20: agency A admin saw % own subscription rows, expected 1', n; END IF;
  RAISE NOTICE 'PASS T20: agency admin sees exactly their own subscription';
END $$;

\echo '--- T21: Agency A admin reads own usage counters, never Agency B''s ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usage_counters WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T21: agency A admin saw % Agency B usage rows', n; END IF;
  SELECT count(*) INTO n FROM public.usage_counters WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T21: agency A admin saw % own usage rows, expected 1', n; END IF;
  RAISE NOTICE 'PASS T21: agency admin sees exactly their own usage rows';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T22: employees have no subscription/usage visibility at all
-- ---------------------------------------------------------------------------
\echo '--- T22: Agency A employee sees no subscription or usage rows ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subscriptions;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T22: employee saw % subscription rows', n; END IF;
  SELECT count(*) INTO n FROM public.usage_counters;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T22: employee saw % usage rows', n; END IF;
  RAISE NOTICE 'PASS T22: employee sees no subscription or usage rows';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T23: audit log scoping (own agency for an admin, nothing for an employee)
-- ---------------------------------------------------------------------------
\echo '--- T23: Agency A admin reads own audit logs only; employee reads none ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.audit_logs WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T23: agency A admin saw % Agency B audit rows', n; END IF;
  SELECT count(*) INTO n FROM public.audit_logs WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T23: agency A admin saw % own audit rows, expected 1', n; END IF;
  RAISE NOTICE 'PASS T23: agency admin sees only their own audit rows';
END $$;
SELECT test_logout();

SELECT test_login('00000000-0000-0000-0000-0000000000a3');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.audit_logs;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T23b: employee saw % audit rows', n; END IF;
  RAISE NOTICE 'PASS T23b: employee sees no audit rows';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T24: the super admin reads every platform row
-- ---------------------------------------------------------------------------
\echo '--- T24: Super admin reads all subscriptions, usage and audit rows ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subscriptions;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T24: super admin saw % subscription rows, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.usage_counters;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T24: super admin saw % usage rows, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.audit_logs;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T24: super admin saw % audit rows, expected 2', n; END IF;
  RAISE NOTICE 'PASS T24: super admin reads every platform row';
END $$;

-- ---------------------------------------------------------------------------
-- T25: the super admin CAN write plans / plan_features / subscriptions
-- ---------------------------------------------------------------------------
\echo '--- T25: Super admin CAN update a plan, a plan feature and a subscription ---'
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.plans SET sort_order = sort_order WHERE id = '22222222-2222-2222-2222-222222222222';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'plans update touched % rows, expected 1', n; END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL T25: super admin could not update plans: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.plan_features SET included = included WHERE plan_id = '22222222-2222-2222-2222-222222222222';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n < 1 THEN RAISE EXCEPTION 'plan_features update touched % rows, expected at least 1', n; END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL T25: super admin could not update plan_features: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.subscriptions SET status = status
     WHERE agency_id = '10000000-0000-0000-0000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'subscriptions update touched % rows, expected 1', n; END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL T25: super admin could not update subscriptions: %', SQLERRM;
  END;

  RAISE NOTICE 'PASS T25: super admin can write plans, plan_features and subscriptions';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T26/T27: an agency admin cannot INSERT into the platform tables
-- ---------------------------------------------------------------------------
\echo '--- T26: Agency A admin cannot INSERT their own subscription (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.subscriptions (id, agency_id, plan_id, status)
VALUES ('90000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'active');
SELECT test_logout();

\echo '--- T27: Agency A admin cannot INSERT a plan (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.plans (id, name, price_pkr)
VALUES ('93000000-0000-0000-0000-000000000001', 'Agency A sneaky plan', 1);
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T28/T29: anon reads and writes nothing
-- ---------------------------------------------------------------------------
\echo '--- T28: anon reads nothing on plans/plan_features/subscriptions/usage/audit/checkins/locations (expect permission denied) ---'
SELECT test_logout();
SET ROLE anon;
DO $$
DECLARE n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans','plan_features','subscriptions','usage_counters','audit_logs','property_checkins','locations'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE EXCEPTION 'FAIL T28: anon could read % (%)', t, n;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS T28: anon denied on %', t;
    END;
  END LOOP;
END $$;
RESET ROLE;

\echo '--- T29: anon cannot INSERT into plans (expect ERROR) ---'
SET ROLE anon;
INSERT INTO public.plans (id, name, price_pkr) VALUES ('93000000-0000-0000-0000-000000000002', 'anon plan', 1);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T30: nothing that was supposed to be rejected actually landed
-- ---------------------------------------------------------------------------
\echo '--- T30: no rejected INSERT actually wrote a row ---'
SELECT test_logout();
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plans
   WHERE id IN ('93000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T30: % rejected plan rows exist', n; END IF;

  SELECT count(*) INTO n FROM public.subscriptions WHERE id = '90000000-0000-0000-0000-000000000099';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T30: rejected subscription row exists (% rows)', n; END IF;

  SELECT count(*) INTO n FROM public.subscriptions WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T30: Agency A has % subscription rows, expected 1', n; END IF;

  RAISE NOTICE 'PASS T30: every rejected write left no trace';
END $$;

\echo '=== SUPER ADMIN BATTERY DONE ==='

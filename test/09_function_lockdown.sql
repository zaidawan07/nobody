-- Function EXECUTE lockdown for what this batch adds (0010-0013).
--
-- What is under test is what each *caller* can actually reach, not what a
-- migration intended:
--   * T71  anon has no EXECUTE on the SECURITY DEFINER functions added here,
--          and on the trigger function, which nothing should ever call;
--   * T72  revoking EXECUTE from authenticated did NOT disable a trigger --
--          the guard the product depends on still fires for real users;
--   * T73  an explicit GRANT still opens a function, so the closed default is
--          a deliberate door and not a wall;
--   * T74  signed-in users keep the helpers they are meant to have.
--
-- On the default ACL in 0013: PGlite (this battery) does not implement ALTER
-- DEFAULT PRIVILEGES, so that statement cannot be verified here -- it has to
-- be checked against live, where the default ACL of the schema for objtype=f is
-- what silently handed EXECUTE to anon for every new function. Because it is
-- unverifiable here, T71 asserts the explicit REVOKEs instead: they are what
-- actually protects the functions this project adds everywhere, including on a
-- database whose defaults nobody has ever adjusted.

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

\echo '--- T71: anon cannot call the functions this batch adds ---'
SET ROLE anon;
DO $$
DECLARE v int := 0;
BEGIN
  -- reopen_property(): SECURITY DEFINER, called by the app as an
  -- authenticated user. Reaching it as anon would let an unauthenticated
  -- caller reopen a sold property and write an audit row.
  BEGIN
    PERFORM public.reopen_property(gen_random_uuid(), 'should not be reachable');
    RAISE EXCEPTION 'FAIL T71: anon reached reopen_property';
  EXCEPTION WHEN insufficient_privilege THEN v := v + 1; END;

  -- can_access_assigned_conversation(): how the conversation policies read
  -- the sibling row. Reaching it as anon would leak assignment state.
  BEGIN
    PERFORM public.can_access_assigned_conversation(gen_random_uuid(), gen_random_uuid());
    RAISE EXCEPTION 'FAIL T71: anon reached can_access_assigned_conversation';
  EXCEPTION WHEN insufficient_privilege THEN v := v + 1; END;

  -- The trigger function is never called by hand, so anon (and authenticated)
  -- must not hold EXECUTE on it.
  BEGIN
    PERFORM public.guard_property_status_transition();
    RAISE EXCEPTION 'FAIL T71: anon reached guard_property_status_transition';
  EXCEPTION WHEN insufficient_privilege THEN v := v + 1; END;

  IF v <> 3 THEN RAISE EXCEPTION 'FAIL T71: only % of 3 checks were refused', v; END IF;
  RAISE NOTICE 'PASS T71: anon is refused on all three functions';
END $$;
RESET ROLE;

\echo '--- T72: revoking authenticated from the trigger did not disable the guard ---'
-- 0009 revoked EXECUTE from trigger functions and this batch follows it.
-- That is only safe if the guard still fires: if the EXECUTE check did apply at
-- trigger time, the sold -> available protection would be gone for exactly the
-- users it is meant to protect. This proves it is not.
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; n int; v_status public.property_status;
BEGIN
  SELECT id INTO v_id FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FAIL T72: no property fixture'; END IF;
  UPDATE public.properties SET status = 'inactive' WHERE id = v_id;
  UPDATE public.properties SET status = 'sold' WHERE id = v_id;
  BEGIN
    UPDATE public.properties SET status = 'available' WHERE id = v_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T72: sold -> available succeeded (% rows)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T72: status is now %', v_status; END IF;
  RAISE NOTICE 'PASS T72: the guard still fires without authenticated holding EXECUTE';
END $$;
SELECT test_logout();

\echo '--- T73: an explicit grant still opens a function ---'
-- The point of a closed default is that a grant is deliberate. Prove a grant
-- still works, so closing the defaults cannot silently break a later
-- migration that means to expose something.
CREATE OR REPLACE FUNCTION public._execute_probe() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION public._execute_probe() TO authenticated, service_role;

SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE v boolean;
BEGIN
  v := public._execute_probe();
  IF v IS NOT TRUE THEN RAISE EXCEPTION 'FAIL T73: granted function returned %', v; END IF;
  RAISE NOTICE 'PASS T73: an explicit grant still opens the function';
END $$;
SELECT test_logout();
DROP FUNCTION public._execute_probe();

\echo '--- T74: signed-in users keep the helpers they are meant to have ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_plan bigint;
BEGIN
  -- The reopen path and the limit helpers must stay reachable for a signed-in
  -- user, or the lockdown broke the product for the people who need it.
  v_plan := public.plan_limit_for_agency('10000000-0000-0000-0000-000000000001', 'properties');
  IF v_plan IS NULL THEN RAISE EXCEPTION 'FAIL T74: signed-in user got no plan limit'; END IF;
  IF public.can_access_assigned_record(
       '10000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T74: the shared assigned-record helper stopped working';
  END IF;
  RAISE NOTICE 'PASS T74: signed-in helpers still reachable (plan limit %)', v_plan;
END $$;
SELECT test_logout();

\echo '--- T75: anon holds no grant on the two new tables ---'
-- The table-level part of the same erosion. A new table in public inherits
-- anon=ALL from the schema default ACL, which 0010 and 0011 now revoke.
-- has_table_privilege is the only direct way to assert this, because RLS
-- alone would make an anon SELECT quietly return zero rows either way.
DO $$
DECLARE v int := 0;
BEGIN
  IF has_table_privilege('anon', 'public.notifications', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL T75: anon still holds SELECT on public.notifications';
  END IF;
  IF has_table_privilege('authenticated', 'public.notifications', 'SELECT') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T75: authenticated lost SELECT on public.notifications';
  END IF;
  IF has_table_privilege('service_role', 'public.notifications', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T75: service_role lost INSERT on public.notifications';
  END IF;
  IF has_table_privilege('anon', 'public.property_reopen_log', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL T75: anon still holds SELECT on public.property_reopen_log';
  END IF;
  IF has_table_privilege('authenticated', 'public.property_reopen_log', 'SELECT') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T75: authenticated lost SELECT on public.property_reopen_log';
  END IF;
  RAISE NOTICE 'PASS T75: anon holds nothing, authenticated/service_role keep theirs';
END $$;

\echo '--- T76: anon holds no EXECUTE on the shared helpers either ---'
-- Guards the fix from 0009 against the same erosion for the helpers that were
-- already locked down, so a future migration cannot quietly re-open one.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.can_access_assigned_record(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T76: anon regained EXECUTE on can_access_assigned_record';
  END IF;
  IF has_function_privilege('anon', 'public.is_super_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T76: anon regained EXECUTE on is_super_admin';
  END IF;
  IF has_function_privilege('anon', 'public.plan_limit_for_agency(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T76: anon regained EXECUTE on plan_limit_for_agency';
  END IF;
  RAISE NOTICE 'PASS T76: anon holds no EXECUTE on the already-locked helpers';
END $$;

\echo '=== FUNCTION LOCKDOWN BATTERY DONE ==='

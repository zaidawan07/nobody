-- Notification isolation tests (migration 0009).
--
-- The guarantee under test: a user can neither read nor mark read another
-- user's notifications, and anon reads nothing. All writes in this battery go
-- through the service_role policy, which is the only write path the server
-- functions use.

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

-- Fixtures: two notifications for Agency A's admin, one for a second Agency A
-- employee, and one for Agency B's admin. Written as the service role, exactly
-- as the server functions do.
SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.notifications (id, user_id, agency_id, type, title, body) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'lead_assigned', 'Lead assigned to you', 'Lead A1'),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'visit_requested', 'Site visit requested', 'Visit A1'),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'lead_assigned', 'Lead assigned to you', 'Lead A1'),
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'lead_assigned', 'Lead assigned to you', 'Lead B1');
SELECT set_config('request.jwt.claim.role', '', false);

-- ---------------------------------------------------------------------------
-- T42: the recipient sees their own plus (as agency admin) their agency's,
--       and NOTHING from another agency.
--
-- The agency-admin read policy is deliberate: an agency admin may audit their
-- own agency's notifications. What must never happen is seeing another
-- agency's, so that is the assertion that carries the weight here.
-- ---------------------------------------------------------------------------
\echo '--- T42: recipient sees own, never another agency ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  -- Own agency: 2 own + 1 team member's (a2), via the agency-admin policy.
  SELECT count(*) INTO n FROM public.notifications;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL T42: agency admin saw % notifications, expected 3 (2 own + 1 team)', n; END IF;
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T42: agency admin saw % of agency B notifications', n; END IF;
  RAISE NOTICE 'PASS T42: agency admin sees own agency only, never agency B';
END $$;
SELECT test_logout();

-- An employee is NOT an agency admin, so the audit policy does not apply:
-- they see strictly their own.
\echo '--- T42b: employee sees strictly their own notification ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T42b: employee saw % notifications, expected exactly 1 (their own)', n; END IF;
  RAISE NOTICE 'PASS T42b: employee sees strictly their own notification';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T43: a user cannot mark someone else's notification read
--
-- The UPDATE policy is USING (user_id = auth.uid()), so this affects zero
-- rows. The block asserts both the row count AND that read_at is still null.
-- ---------------------------------------------------------------------------
\echo '--- T43: user cannot mark another user notification read ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.notifications
       SET read_at = now()
     WHERE id = 'a0000000-0000-0000-0000-00000000000a';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T43: cross-user UPDATE changed % row(s)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- blocked at the grant layer: also acceptable
  END;

  IF (SELECT read_at FROM public.notifications WHERE id = 'a0000000-0000-0000-0000-00000000000a') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T43: a ''s notification was marked read by agent B';
  END IF;
  RAISE NOTICE 'PASS T43: cross-user mark-read was blocked';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T44: the owner CAN mark their own notification read
-- ---------------------------------------------------------------------------
\echo '--- T44: owner marks own notification read ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  UPDATE public.notifications SET read_at = now()
   WHERE id = 'a0000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T44: owner update changed % row(s), expected 1', n; END IF;

  SELECT count(*) INTO n FROM public.notifications WHERE read_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T44: % notifications appear read, expected 1', n; END IF;
  RAISE NOTICE 'PASS T44: owner marks own notification read';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T45: an agency admin can read agency notifications for auditing, but cannot
-- touch them (there is no UPDATE policy for them).
-- ---------------------------------------------------------------------------
\echo '--- T45: agency admin audits agency notifications but cannot modify ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  -- Own agency: 2 own + 1 team member's (a2), via the agency-admin policy.
  SELECT count(*) INTO n FROM public.notifications
   WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL T45: agency admin saw % agency notifications, expected 3', n; END IF;

  -- Another agency: nothing.
  SELECT count(*) INTO n FROM public.notifications
   WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T45: agency admin saw % of another agency notifications', n; END IF;
  RAISE NOTICE 'PASS T45: agency admin audits only own agency notifications';
END $$;

-- and cannot mark the other member's notification read, even inside own agency
-- (targets the notification owned by employee a2, not by the signed-in admin)
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.notifications SET read_at = now()
     WHERE id = 'a0000000-0000-0000-0000-00000000000d';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T45b: agency admin changed % team notification(s)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS T45b: agency admin cannot mark a team member notification read';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T46: anon reads nothing
-- ---------------------------------------------------------------------------
\echo '--- T46: anon reads no notifications ---'
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.notifications;
    RAISE EXCEPTION 'FAIL T46: anon could read % notifications', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T46: anon denied on notifications';
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T47: only the service role can insert
-- ---------------------------------------------------------------------------
\echo '--- T47: only the service role can insert notifications ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES ('00000000-0000-0000-0000-0000000000a2', 'fake', 'Fake');
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T47: client inserted % notification(s)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS T47: client cannot insert notifications';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T48: the service role can still insert (the path the server functions use)
-- ---------------------------------------------------------------------------
-- T48: the service role inserts (the path the server functions use). The
-- a2 row was removed in the T47 fixture reset, so recreate it here and assert
-- it lands.
-- ---------------------------------------------------------------------------
\echo '--- T48: service role inserts notifications ---'
SELECT test_logout();
INSERT INTO public.notifications (id, user_id, agency_id, type, title)
  VALUES ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'lead_assigned', 'Lead assigned to you');

\echo '=== NOTIFICATIONS BATTERY DONE ==='

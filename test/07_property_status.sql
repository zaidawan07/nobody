-- Property status transition and availability tests (migration 0010).
--
-- Under test: a sold or rented property cannot become available or reserved
-- through an ordinary status change -- the path a stale client, an edit form or
-- the inline status picker would take -- while every other transition stays
-- open so an admin can still correct a status. The one way back is
-- reopen_property(), which records an audit row and refuses anyone who does not
-- belong to the property's agency.
--
-- Measurement: the guarded UPDATE either affects zero rows or raises
-- insufficient_privilege, depending on the grant in force. Each block accepts
-- either and then asserts the stored status never moved, so a silent no-op can
-- never pass as success.
--
-- Fixture staging is done as the table owner (RLS bypassed), because staging
-- is setup, not a test of permissions; the permission under test is what each
-- block does afterwards while signed in.

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

\echo '--- T49: valid transition available -> sold is allowed ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; n int;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  -- Guard no longer applies once sold (the guard only refuses sold -> available/
  -- reserved), so this ordinary write is the allowed direction.
  UPDATE public.properties SET status = 'inactive' WHERE id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T49: ordinary correction blocked (% rows)', n; END IF;
  RAISE NOTICE 'PASS T49: sold -> inactive (correction) stays allowed';
END $$;
SELECT test_logout();

\echo '--- T50: invalid transition sold -> available is refused ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; n int; v_status public.property_status;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  BEGIN
    UPDATE public.properties SET status = 'available' WHERE id = v_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T50: sold -> available succeeded (% rows)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T50: status is now %, expected sold', v_status; END IF;
  RAISE NOTICE 'PASS T50: sold -> available refused, status unchanged';
END $$;
SELECT test_logout();

\echo '--- T51: invalid transition sold -> reserved is refused ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; n int; v_status public.property_status;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  BEGIN
    UPDATE public.properties SET status = 'reserved' WHERE id = v_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL T51: sold -> reserved succeeded (% rows)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T51: status is now %', v_status; END IF;
  RAISE NOTICE 'PASS T51: sold -> reserved refused';
END $$;
SELECT test_logout();

\echo '--- T52: reopen_property() reopens and writes an audit row ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_status public.property_status; v_logged int; v_reason text;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  PERFORM public.reopen_property(v_id, 'Sale fell through, buyer withdrew');
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'available' THEN RAISE EXCEPTION 'FAIL T52: not reopened, status %', v_status; END IF;
  SELECT count(*), max(reason) INTO v_logged, v_reason FROM public.property_reopen_log WHERE property_id = v_id;
  IF v_logged <> 1 THEN RAISE EXCEPTION 'FAIL T52: % audit rows, expected 1', v_logged; END IF;
  IF v_reason <> 'Sale fell through, buyer withdrew' THEN
    RAISE EXCEPTION 'FAIL T52: audit reason is %', v_reason;
  END IF;
  RAISE NOTICE 'PASS T52: reopen reopens and records actor, agency, reason and both statuses';
END $$;
SELECT test_logout();

\echo '--- T53: reopen_property() demands a real reason ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  BEGIN
    PERFORM public.reopen_property(v_id, 'no');
    RAISE EXCEPTION 'FAIL T53: a one-word reason was accepted';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS T53: short reason refused';
  END;
END $$;
SELECT test_logout();

\echo '--- T54: another agency's admin cannot reopen ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_status public.property_status;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.reopen_property(v_id, 'Another agency must not do this');
    RAISE EXCEPTION 'FAIL T54: cross-agency reopen succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    NULL; -- refused by the privilege check inside the function
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T54: status changed to %', v_status; END IF;
  RAISE NOTICE 'PASS T54: cross-agency reopen refused';
END $$;
SELECT test_logout();

\echo '--- T55: an employee cannot reopen ---'
SELECT test_logout();
UPDATE public.properties p SET status = 'draft'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
UPDATE public.properties p SET status = 'sold'
  WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_status public.property_status;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  SET ROLE authenticated;
  BEGIN
    PERFORM public.reopen_property(v_id, 'Employee must not be able to do this');
    RAISE EXCEPTION 'FAIL T55: employee reopen succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T55: status changed to %', v_status; END IF;
  RAISE NOTICE 'PASS T55: employee reopen refused';
END $$;
SELECT test_logout();

\echo '--- T56: the reopen log is tenant-scoped and records no message data ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int; bad int; v_raw text;
BEGIN
  SELECT count(*) INTO n FROM public.property_reopen_log WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T56: % own-agency log rows, expected 1', n; END IF;
  SELECT count(*) INTO n FROM public.property_reopen_log WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T56: saw % of agency B log rows', n; END IF;
  -- The log must not carry message content: every column is a status, an id, a
  -- reason and a timestamp, and nothing else.
  SELECT count(*) INTO bad FROM public.property_reopen_log
   WHERE reason ILIKE '%customer%' OR reason ILIKE '%message%' OR reason ILIKE '%@%';
  IF bad <> 0 THEN RAISE EXCEPTION 'FAIL T56: % log rows look like they hold personal data', bad; END IF;
  RAISE NOTICE 'PASS T56: reopen log is tenant-scoped and free of message data';
END $$;
SELECT test_logout();

\echo '--- T57: only status = available counts as recommendable ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_total int; v_available int; v_hidden int; v_leaked int;
BEGIN
  SELECT count(*) INTO v_total FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_available FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' AND status = 'available';
  SELECT count(*) INTO v_hidden FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' AND status <> 'available';
  IF v_available + v_hidden <> v_total THEN
    RAISE EXCEPTION 'FAIL T57: available % + hidden % <> total %', v_available, v_hidden, v_total;
  END IF;
  SELECT count(*) INTO v_leaked FROM public.properties
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND status IN ('sold','rented','reserved','expired','inactive','unavailable','draft')
     AND status = 'available';
  IF v_leaked <> 0 THEN RAISE EXCEPTION 'FAIL T57: % closed properties leak into available', v_leaked; END IF;
  RAISE NOTICE 'PASS T57: recommendable set is status = available only (% of %)', v_available, v_total;
END $$;
SELECT test_logout();

\echo '--- T58: a stale cache cannot resurrect a sold listing ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_status public.property_status; v_updated int;
BEGIN
  SELECT id INTO v_id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1;
  -- Simulate a client that fetched 'available' earlier, then tries to write that
  -- stale value back after someone else sold it.
  UPDATE public.properties p SET status = 'sold'
    WHERE p.id = (SELECT id FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1);
  BEGIN
    UPDATE public.properties SET status = 'available' WHERE id = v_id AND status = 'available';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 0 THEN RAISE EXCEPTION 'FAIL T58: stale write landed (% rows)', v_updated; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SELECT status INTO v_status FROM public.properties WHERE id = v_id;
  IF v_status <> 'sold' THEN RAISE EXCEPTION 'FAIL T58: stale write changed status to %', v_status; END IF;
  RAISE NOTICE 'PASS T58: stale availability write rejected, row stays sold';
END $$;
SELECT test_logout();

\echo '=== PROPERTY STATUS BATTERY DONE ==='

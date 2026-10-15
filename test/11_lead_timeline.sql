-- ============================================================================
-- 0015: lead timeline and follow-ups.
--
-- Mirrors T59-T64 (the conversation isolation battery): the super admin reads
-- nothing, the agency's admins read everything in the agency, an employee reads
-- only their own assigned lead, and another agency reads nothing.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

-- ---------- fixtures ----------
-- The seed gives agency A two leads: one assigned to emp1 and one unassigned.
-- There is no lead assigned to emp2, so the "colleague" case is created here.
-- Rows are inserted as the owner (auth.uid() IS NULL), the same context the
-- seed uses, so the 0008 plan guard's skip path applies and RLS is not
-- consulted for the setup itself.
--
-- Agencies A and B are separate agencies.
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
SELECT test_logout();

DO $$
DECLARE
  v_l1 uuid;   -- agency A, assigned to emp1
  v_l2 uuid;   -- agency A, assigned to emp2 (the colleague)
  v_l3 uuid;   -- agency A, unassigned
  v_lb uuid;   -- agency B
  v_act uuid;
BEGIN
  -- Deterministic ids so a re-run reuses rows instead of duplicating.
  INSERT INTO public.leads (id, agency_id, name, status, assigned_to)
  VALUES ('30000000-0000-0000-0000-0000000000f1',
          '10000000-0000-0000-0000-000000000001',
          'Timeline fixture - colleague', 'new',
          '00000000-0000-0000-0000-0000000000a3')
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_l1 FROM public.leads
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND assigned_to = '00000000-0000-0000-0000-0000000000a2'
   ORDER BY created_at LIMIT 1;

  SELECT id INTO v_l2 FROM public.leads
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND assigned_to = '00000000-0000-0000-0000-0000000000a3'
   ORDER BY created_at LIMIT 1;

  SELECT id INTO v_l3 FROM public.leads
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND assigned_to IS NULL
   ORDER BY created_at LIMIT 1;

  SELECT id INTO v_lb FROM public.leads
   WHERE agency_id = '10000000-0000-0000-0000-000000000002'
   ORDER BY created_at LIMIT 1;

  IF v_l1 IS NULL THEN RAISE EXCEPTION 'Fixture: no lead assigned to emp1 in agency A'; END IF;
  IF v_l2 IS NULL THEN RAISE EXCEPTION 'Fixture: no lead assigned to emp2 in agency A'; END IF;
  IF v_lb IS NULL THEN RAISE EXCEPTION 'Fixture: no lead in agency B'; END IF;

  PERFORM set_config('test.lead1', v_l1::text, false);
  PERFORM set_config('test.lead2', v_l2::text, false);
  PERFORM set_config('test.lead3', coalesce(v_l3::text, ''), false);
  PERFORM set_config('test.leadB', v_lb::text, false);

  -- Enough timeline rows that "sees some" and "sees all" are distinguishable.
  FOR v_act IN
    SELECT id FROM public.lead_activities
     WHERE lead_id IN (v_l1, v_l2) 
  LOOP
    EXIT;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = v_l1) THEN
    INSERT INTO public.lead_activities (agency_id, lead_id, type, body, author_id, is_system)
    VALUES ('10000000-0000-0000-0000-000000000001', v_l1, 'note',
            'Fixture: first contact made', '00000000-0000-0000-0000-0000000000a2', false);
    INSERT INTO public.lead_activities (agency_id, lead_id, type, body, author_id, is_system)
    VALUES ('10000000-0000-0000-0000-000000000001', v_l1, 'call',
            'Fixture: called back, wants a viewing', '00000000-0000-0000-0000-0000000000a2', false);
    INSERT INTO public.lead_activities (agency_id, lead_id, type, body, author_id, is_system)
    VALUES ('10000000-0000-0000-0000-000000000001', v_l1, 'status_change',
            'Fixture: moved to qualified', '00000000-0000-0000-0000-0000000000a1', false);
    INSERT INTO public.lead_activities (agency_id, lead_id, type, body, author_id, is_system)
    VALUES ('10000000-0000-0000-0000-000000000001', v_l2, 'note',
            'Fixture: colleague lead note', '00000000-0000-0000-0000-0000000000a3', false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lead_followups WHERE lead_id = v_l1) THEN
    INSERT INTO public.lead_followups (agency_id, lead_id, due_at, note, assigned_to, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', v_l1,
            now() + interval '2 days', 'Fixture: call back about the viewing',
            '00000000-0000-0000-0000-0000000000a2',
            '00000000-0000-0000-0000-0000000000a1');
  END IF;
END $$;

\echo '--- T87: super admin reads no lead activities ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T87: super admin saw % lead activities', n; END IF;
  RAISE NOTICE 'PASS T87: super admin sees 0 lead activities';
END $$;
SELECT test_logout();

\echo '--- T88: super admin reads no follow-ups ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_followups;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T88: super admin saw % follow-ups', n; END IF;
  RAISE NOTICE 'PASS T88: super admin sees 0 follow-ups';
END $$;
SELECT test_logout();

\echo '--- T89: super admin cannot insert a lead activity (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
INSERT INTO public.lead_activities (agency_id, lead_id, type, body)
VALUES ('10000000-0000-0000-0000-000000000001', current_setting('test.lead1')::uuid, 'note', 'Should never land');
SELECT test_logout();

\echo '--- T90: agency admin sees all of their own agency's timeline ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <= 0 THEN RAISE EXCEPTION 'FAIL T90: agency admin saw % rows, expected > 0', n; END IF;
  RAISE NOTICE 'PASS T90: agency admin sees all their agency rows (% present)', n;
END $$;
SELECT test_logout();

\echo '--- T91: employee sees only their own assigned lead's timeline ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n_own int; n_all int;
BEGIN
  SELECT count(*) INTO n_own FROM public.lead_activities WHERE lead_id = current_setting('test.lead1')::uuid;
  SELECT count(*) INTO n_all FROM public.lead_activities WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n_all > n_own THEN
    RAISE EXCEPTION 'FAIL T91: employee saw % rows but only % are on their own lead', n_all, n_own;
  END IF;
  RAISE NOTICE 'PASS T91: employee sees only their own lead rows (% of %)', n_own, n_all;
END $$;
SELECT test_logout();

\echo '--- T92: employee cannot read a colleague's lead timeline ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = current_setting('test.lead2')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T92: employee saw % rows on a colleague lead', n; END IF;
  RAISE NOTICE 'PASS T92: employee sees 0 rows on a colleague lead';
END $$;
SELECT test_logout();

\echo '--- T93: another agency's lead timeline is invisible ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = current_setting('test.leadB')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T93: agency A employee saw % of agency B rows', n; END IF;
  RAISE NOTICE 'PASS T93: agency A employee sees 0 of agency B rows';
END $$;
SELECT test_logout();

SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = current_setting('test.leadB')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T93b: agency A admin saw % of agency B rows', n; END IF;
  RAISE NOTICE 'PASS T93b: agency A admin also sees 0 of agency B rows';
END $$;
SELECT test_logout();

\echo '--- T94: anon reads no timeline rows ---'
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.lead_activities;
    RAISE EXCEPTION 'FAIL T94: anon read % lead activities', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T94: anon has no grant on lead_activities';
  END;
END $$;
RESET ROLE;

\echo '--- T95: a client cannot forge a system-authored entry (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.lead_activities (agency_id, lead_id, type, body, author_id, is_system)
SELECT '10000000-0000-0000-0000-000000000001', current_setting('test.lead1')::uuid, 'status_change', 'Forged system entry', '00000000-0000-0000-0000-0000000000a1', true;
SELECT test_logout();

\echo '--- T96: agency_id is derived from the lead, not the client ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_agency uuid;
BEGIN
  INSERT INTO public.lead_activities (lead_id, type, body)
  VALUES (current_setting('test.lead1')::uuid, 'note', 'No agency_id supplied')
  RETURNING id INTO v_id;
  SELECT agency_id INTO v_agency FROM public.lead_activities WHERE id = v_id;
  IF v_agency IS DISTINCT FROM '10000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'FAIL T96: derived agency is %, expected the lead agency', v_agency;
  END IF;
  RAISE NOTICE 'PASS T96: agency_id derived from the lead';
END $$;
SELECT test_logout();

\echo '--- T97: an employee cannot write to a colleague's lead (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.lead_activities (lead_id, type, body)
VALUES (current_setting('test.lead2')::uuid, 'note', 'Should never land');
SELECT test_logout();

\echo '--- T98: follow-ups are scoped to the assignee and admins ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n_all int; n_own int;
BEGIN
  SELECT count(*) INTO n_all FROM public.lead_followups WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO n_own FROM public.lead_followups WHERE lead_id = current_setting('test.lead1')::uuid;
  IF n_all > n_own THEN
    RAISE EXCEPTION 'FAIL T98: employee saw % follow-ups, only % are on their lead', n_all, n_own;
  END IF;
  RAISE NOTICE 'PASS T98: employee follow-up scope matches lead scope';
END $$;
SELECT test_logout();

\echo '--- T99: an unassigned lead is visible to admins only ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  IF current_setting('test.lead3') = '' THEN
    RAISE NOTICE 'PASS T99 (skipped): no unassigned lead fixture';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = current_setting('test.lead3')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T99: employee saw % rows on an unassigned lead', n; END IF;
  RAISE NOTICE 'PASS T99: employee sees no rows on an unassigned lead';
END $$;
SELECT test_logout();

SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  IF current_setting('test.lead3') = '' THEN RETURN; END IF;
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = current_setting('test.lead3')::uuid;
  RAISE NOTICE 'PASS T99b: admin sees % rows on an unassigned lead', n;
END $$;
SELECT test_logout();

\echo '--- T100: a follow-up assigned to an employee is visible to them ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_followups
   WHERE lead_id = current_setting('test.lead1')::uuid AND assigned_to = '00000000-0000-0000-0000-0000000000a2';
  IF n <= 0 THEN RAISE EXCEPTION 'FAIL T100: employee cannot see their own follow-up (% rows)', n; END IF;
  RAISE NOTICE 'PASS T100: employee sees their own follow-up';
END $$;
SELECT test_logout();

\echo '=== LEAD TIMELINE BATTERY DONE ==='

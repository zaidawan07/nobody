-- Full Part 10 test battery. Each block either raises "PASS: ..." or lets a
-- real error surface (which means the guard did NOT hold and something is
-- wrong). Run top to bottom; a clean run with only PASS/expected-error lines
-- and no unexpected ERROR is a green build.

\set ON_ERROR_STOP off
\pset pager off

\echo '--- T1: Agency A admin cannot read Agency B properties ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1'); -- Agency A admin
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T1: Agency A admin saw % Agency B properties', n; END IF;
  RAISE NOTICE 'PASS T1: Agency A admin sees 0 Agency B properties';
END $$;

\echo '--- T2: Agency A employee cannot read Agency B leads/visits ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2'); -- Agency A employee 1
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.leads WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T2: Agency A employee saw % Agency B leads', n; END IF;
  SELECT count(*) INTO n FROM public.site_visits WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T2: Agency A employee saw % Agency B site_visits', n; END IF;
  RAISE NOTICE 'PASS T2: Agency A employee sees 0 Agency B leads/visits';
END $$;

\echo '--- T3: Agency A employee cannot change own agency_id (expect ERROR from trigger) ---'
UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000002' WHERE id = '00000000-0000-0000-0000-0000000000a2';

\echo '--- T3b: Agency A employee cannot change own status (expect ERROR from trigger) ---'
UPDATE public.profiles SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-0000000000a2';

\echo '--- T4: Agency A employee cannot grant themselves a new role (expect ERROR: permission denied) ---'
INSERT INTO public.user_roles (user_id, role, agency_id) VALUES ('00000000-0000-0000-0000-0000000000a2', 'super_admin', NULL);

\echo '--- T4b: Agency A employee cannot escalate role by updating an existing row either (expect ERROR: no UPDATE grant) ---'
UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = '00000000-0000-0000-0000-0000000000a2';

\echo '--- T5: Agency A employee 1 cannot see the unassigned Agency A property, or employee 2''s assigned property ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000003'; -- unassigned
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T5: employee1 saw the unassigned property'; END IF;
  SELECT count(*) INTO n FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000002'; -- assigned to emp2
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T5: employee1 saw employee2''s assigned property'; END IF;
  SELECT count(*) INTO n FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000001'; -- assigned to emp1 (self)
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T5: employee1 could not see their OWN assigned property'; END IF;
  RAISE NOTICE 'PASS T5: employee1 sees exactly their own assigned property, nothing else';
END $$;

\echo '--- T5b: employee cannot DELETE even their own assigned property (admin-only delete) ---'
DELETE FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000001';

\echo '--- T5c: employee CAN insert a lead assigned to themselves ---'
INSERT INTO public.leads (id, agency_id, name, assigned_to)
VALUES ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', 'Self-assigned test lead', '00000000-0000-0000-0000-0000000000a2');

\echo '--- T5d: employee CANNOT insert a lead assigned to a co-worker (expect ERROR) ---'
INSERT INTO public.leads (id, agency_id, name, assigned_to)
VALUES ('30000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000001', 'Sneaky lead for coworker', '00000000-0000-0000-0000-0000000000a3');

SELECT test_logout();

\echo '--- T6: Agency A admin CAN see all Agency A data (properties/leads/visits), including unassigned rows ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL T6: agency admin saw % Agency A properties, expected 3', n; END IF;
  RAISE NOTICE 'PASS T6: Agency A admin sees all 3 Agency A properties (assigned + unassigned)';
END $$;

\echo '--- T6b: Agency admin CAN change a teammate''s status directly? (expect ERROR now -- must go through service-role fn) ---'
UPDATE public.profiles SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-0000000000a2';
SELECT test_logout();

\echo '--- T7: Super admin can perform platform administration (suspend/reactivate an agency) ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
BEGIN
  UPDATE public.agencies SET status = 'suspended' WHERE id = '10000000-0000-0000-0000-000000000002';
  UPDATE public.agencies SET status = 'active' WHERE id = '10000000-0000-0000-0000-000000000002';
  RAISE NOTICE 'PASS T7: super admin suspended and reactivated Agency B';
END $$;
SELECT test_logout();

\echo '--- T8: Logged-out (anon) user cannot read tenant data ---'
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.properties;
    RAISE EXCEPTION 'FAIL T8: anon role could query properties at all (got % rows)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T8: anon role has no grant on properties (permission denied, as expected)';
  END;
END $$;
RESET ROLE;

\echo '--- T-bootstrap: first super-admin claim succeeds, a second claim is rejected (expect ERROR from unique_violation) ---'
DO $$
BEGIN
  INSERT INTO public.platform_bootstrap (claimed_by) VALUES ('00000000-0000-0000-0000-00000000000a');
  RAISE NOTICE 'PASS bootstrap-1: first claim inserted';
END $$;
INSERT INTO public.platform_bootstrap (claimed_by) VALUES ('00000000-0000-0000-0000-0000000000a1');

\echo '=== DONE ==='

-- ============================================================================
-- 0014: team-member invitations. Cross-agency read isolation, employee write
-- denial, the admin-only write rule, the role-enum guard (super_admin cannot
-- be expressed), the one-pending-per-email constraint, and transition rules.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

\echo '--- T73: agency admin invites a teammate in their own agency ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, full_name, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'new.hire@example.test', 'New Hire', 'employee',
        '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
SELECT test_logout();

\echo '--- T74: another agency cannot read the invite list ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_invitations WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T74: agency B admin saw % of agency A invites', n; END IF;
  RAISE NOTICE 'PASS T74: agency B admin sees 0 agency A invites';
END $$;
SELECT test_logout();

\echo '--- T75: an employee cannot read the invite list ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_invitations;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T75: employee saw % invites', n; END IF;
  RAISE NOTICE 'PASS T75: employee sees no invitations';
END $$;
SELECT test_logout();

\echo '--- T76: an employee cannot create an invitation (expect ERROR from WITH CHECK) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'rogue@example.test', 'agency_admin', '00000000-0000-0000-0000-0000000000a2', now() + interval '7 days');
SELECT test_logout();

\echo '--- T77: agency admin cannot invite into another agency (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000002', 'cross@example.test', 'employee', '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
SELECT test_logout();

\echo '--- T78: an invitation cannot express super_admin (expect ERROR from the enum) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'owner@example.test', 'super_admin', '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
SELECT test_logout();

\echo '--- T79: anon reads no invitations ---'
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.agency_invitations;
    RAISE EXCEPTION 'FAIL T79: anon read % invitations', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T79: anon has no grant on agency_invitations';
  END;
END $$;
RESET ROLE;

\echo '--- T80: a second pending invite for the same email is refused (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'dup@example.test', 'employee', '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'dup@example.test', 'employee', '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
SELECT test_logout();

\echo '--- T81: a revoked invitation cannot be revived (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.agency_invitations
   WHERE email = 'dup@example.test' AND agency_id = '10000000-0000-0000-0000-000000000001' LIMIT 1;
  UPDATE public.agency_invitations SET status = 'revoked' WHERE id = v_id;
  UPDATE public.agency_invitations SET status = 'pending' WHERE id = v_id;
  RAISE EXCEPTION 'unreachable';
END $$;
SELECT test_logout();

\echo '--- T82: an expired invite is reported as expired, not pending ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'stale@example.test', 'employee', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour');
DO $$
DECLARE v public.invitation_status;
BEGIN
  SELECT status INTO v FROM public.agency_invitations
   WHERE email = 'stale@example.test' AND agency_id = '10000000-0000-0000-0000-000000000001' LIMIT 1;
  IF v <> 'expired' THEN RAISE EXCEPTION 'FAIL T82: stale invite is %, expected expired', v; END IF;
  RAISE NOTICE 'PASS T82: expired invite reads back as expired';
END $$;
SELECT test_logout();

\echo '--- T83: accepting an invitation is allowed and stamps the time ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_id uuid; v_at timestamptz;
BEGIN
  SELECT id INTO v_id FROM public.agency_invitations
   WHERE email = 'new.hire@example.test' AND agency_id = '10000000-0000-0000-0000-000000000001' LIMIT 1;
  UPDATE public.agency_invitations SET status = 'accepted' WHERE id = v_id;
  SELECT accepted_at INTO v_at FROM public.agency_invitations WHERE id = v_id;
  IF v_at IS NULL THEN RAISE EXCEPTION 'FAIL T83: accepted_at was not stamped'; END IF;
  RAISE NOTICE 'PASS T83: accepted invitation stamps accepted_at';
END $$;
SELECT test_logout();

\echo '--- T84: invitations cannot be deleted (expect ERROR permission denied) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DELETE FROM public.agency_invitations WHERE email = 'new.hire@example.test' AND agency_id = '10000000-0000-0000-0000-000000000001';
SELECT test_logout();

\echo '--- T85: super admin reads no invitations ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_invitations;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T85: super admin saw % invitations', n; END IF;
  RAISE NOTICE 'PASS T85: super admin sees 0 invitations (agency-scoped table)';
END $$;
SELECT test_logout();

\echo '--- T86: a real profile id is required for invited_by (expect ERROR from FK) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'nobody@example.test', 'employee', '00000000-0000-0000-0000-00000000dead', now() + interval '7 days');
SELECT test_logout();

\echo '=== INVITATION BATTERY DONE ==='

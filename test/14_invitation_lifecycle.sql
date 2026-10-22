-- Atomic revocation of a pending invitation also removes the
-- pre-provisioned role. Function is service-role only.
\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

\echo '--- T87: service role atomically revokes invite and removes pending access ---'
INSERT INTO public.profiles (id, agency_id, full_name, email)
VALUES ('00000000-0000-0000-0000-0000000000d1',
        '10000000-0000-0000-0000-000000000001',
        'Revocation Test', 'revoke.me@example.test')
ON CONFLICT (id) DO UPDATE SET
  agency_id = excluded.agency_id,
  full_name = excluded.full_name,
  email = excluded.email;

INSERT INTO public.user_roles (user_id, role, agency_id)
VALUES ('00000000-0000-0000-0000-0000000000d1', 'employee',
        '10000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role) DO UPDATE SET agency_id = excluded.agency_id;

SELECT test_login('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.agency_invitations (agency_id, email, full_name, role, invited_by, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001',
        'revoke.me@example.test', 'Revocation Test', 'employee',
        '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
SELECT test_logout();

SET ROLE service_role;
DO $$
DECLARE
  v_id uuid;
  v_ok boolean;
  v_status public.invitation_status;
  v_roles integer;
BEGIN
  SELECT id INTO v_id FROM public.agency_invitations
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND lower(email) = 'revoke.me@example.test'
     AND status = 'pending';
  v_ok := public.revoke_agency_invitation(
    v_id, '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1'
  );
  IF NOT v_ok THEN RAISE EXCEPTION 'FAIL T87: revoke RPC returned false'; END IF;
  SELECT status INTO v_status FROM public.agency_invitations WHERE id = v_id;
  SELECT count(*) INTO v_roles FROM public.user_roles
   WHERE user_id = '00000000-0000-0000-0000-0000000000d1'
     AND agency_id = '10000000-0000-0000-0000-000000000001'
     AND role = 'employee';
  IF v_status <> 'revoked' OR v_roles <> 0 THEN
    RAISE EXCEPTION 'FAIL T87: status %, remaining roles %', v_status, v_roles;
  END IF;
  IF public.revoke_agency_invitation(
    v_id, '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1'
  ) THEN RAISE EXCEPTION 'FAIL T87: repeated revoke succeeded'; END IF;
  RAISE NOTICE 'PASS T87: revocation is atomic, removes pending role, and is not repeatable';
END $$;
RESET ROLE;

\echo '--- T88: authenticated users cannot execute the revoke RPC (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
SELECT public.revoke_agency_invitation(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1'
);
SELECT test_logout();

\echo '=== INVITATION LIFECYCLE BATTERY DONE ==='

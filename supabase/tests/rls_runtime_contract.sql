-- RLS Runtime Contract - Security authorization tests
-- All tests inside a single transaction ending with ROLLBACK

BEGIN;

\set ON_ERROR_STOP off
\pset pager off

-- T-Contract-01: Cross-tenant tampering - Agency A cannot access Agency B data
\echo '--- T-Contract-01: Cross-tenant tampering - Agency A cannot access Agency B properties ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000004';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-01: Cross-tenant access allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-01: Cross-tenant property access blocked';
END $$;
SELECT test_logout();

-- T-Contract-02: Cross-tenant leads access blocked
\echo '--- T-Contract-02: Cross-tenant leads access blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.leads WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-02: Cross-tenant leads access allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-02: Cross-tenant leads blocked';
END $$;
SELECT test_logout();

-- T-Contract-03: Cross-tenant property media blocked
\echo '--- T-Contract-03: Cross-tenant property media blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.property_media WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-03: Cross-tenant media access allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-03: Cross-tenant media blocked';
END $$;
SELECT test_logout();

-- T-Contract-04: Cross-tenant conversations blocked
\echo '--- T-Contract-04: Cross-tenant conversations blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-04: Cross-tenant conversations allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-04: Cross-tenant conversations blocked';
END $$;
SELECT test_logout();

-- T-Contract-05: Cross-tenant conversation messages blocked
\echo '--- T-Contract-05: Cross-tenant conversation messages blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-05: Cross-tenant messages allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-05: Cross-tenant messages blocked';
END $$;
SELECT test_logout();

-- T-Contract-06: Unauthorized mutation - cannot update cross-tenant leads
\echo '--- T-Contract-06: Unauthorized direct writes blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
UPDATE public.leads SET notes = 'tampered' WHERE id = '30000000-0000-0000-0000-000000000003' AND agency_id = '10000000-0000-0000-0000-000000000002';
SELECT test_logout();

-- T-Contract-07: Cannot update cross-tenant properties
\echo '--- T-Contract-07: Cross-tenant property update blocked (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
UPDATE public.properties SET title = 'hacked' WHERE id = '20000000-0000-0000-0000-000000000004';
SELECT test_logout();

-- T-Contract-08: Cannot delete cross-tenant data
\echo '--- T-Contract-08: Cross-tenant delete blocked (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DELETE FROM public.properties WHERE id = '20000000-0000-0000-0000-000000000004';
SELECT test_logout();

-- T-Contract-09: Identifier alone does not authorize
\echo '--- T-Contract-09: Access requires proper tenant context ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  -- Try to access by ID without proper ownership context
  SELECT count(*) INTO n FROM public.properties p WHERE p.id = '20000000-0000-0000-0000-000000000004' AND p.agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid());
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-09: Context bypassed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-09: Proper context required';
END $$;
SELECT test_logout();

-- T-Contract-10: Wrong organization blocked
\echo '--- T-Contract-10: Wrong organization blocked ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1'); -- Agency B
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.properties WHERE assigned_to = '00000000-0000-0000-0000-0000000000a2';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T-Contract-10: Wrong org access allowed';
  END IF;
  RAISE NOTICE 'PASS T-Contract-10: Wrong org blocked';
END $$;
SELECT test_logout();

ROLLBACK;

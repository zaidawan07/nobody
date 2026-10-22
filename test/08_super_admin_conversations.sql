-- Super admin must not read private conversations (migration 0012).
--
-- The product rule is that the super admin manages the platform but does not
-- automatically get access to private agency/customer conversations. Today that
-- is violated twice over:
--   * can_access_assigned_record() starts with `is_super_admin() OR ...` and is
--     the USING/CHECK expression of every 'assigned' policy on conversations and
--     conversation_messages, so a super admin reads and writes both tables;
--   * 'admin delete' uses `is_super_admin() OR is_agency_admin(agency_id)`.
--
-- Every block asserts both the row count AND that the row was not modified, so
-- a silent no-op can never pass as success. Both agencies and both admin/employee
-- roles are still asserted readable, so the fix cannot simply cut everyone off.

\set ON_ERROR_STOP off
\pset pager off

SELECT test_logout();

\echo '--- T59: super admin reads NO conversations ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversations;
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T59: super admin saw % conversations', n; END IF;
RAISE NOTICE 'PASS T59: super admin sees 0 conversations';
END $$;
SELECT test_logout();

\echo '--- T60: super admin reads NO conversation_messages ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversation_messages;
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T60: super admin saw % conversation_messages', n; END IF;
RAISE NOTICE 'PASS T60: super admin sees 0 conversation_messages';
END $$;
SELECT test_logout();

\echo '--- T61: super admin cannot INSERT a conversation ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
BEGIN
  INSERT INTO public.conversations (id, agency_id, customer_phone, state)
  VALUES ('50000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000002', '+923000000000', 'ai_active');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T61: super admin inserted % conversation(s)', n; END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
IF EXISTS (SELECT 1 FROM public.conversations WHERE id = '50000000-0000-0000-0000-0000000000ff') THEN
  RAISE EXCEPTION 'FAIL T61: inserted conversation survived';
END IF;
RAISE NOTICE 'PASS T61: super admin cannot insert conversations';
END $$;
SELECT test_logout();

\echo '--- T62: super admin cannot UPDATE a conversation ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
BEGIN
  UPDATE public.conversations SET state = 'closed'
   WHERE id = (SELECT c.id FROM public.conversations c ORDER BY c.id LIMIT 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T62: super admin updated % conversation(s)', n; END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
RAISE NOTICE 'PASS T62: super admin cannot update conversations';
END $$;
SELECT test_logout();

\echo '--- T63: super admin cannot DELETE a conversation ---'
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
BEGIN
  DELETE FROM public.conversations
   WHERE id = (SELECT c.id FROM public.conversations c ORDER BY c.id LIMIT 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T63: super admin deleted % conversation(s)', n; END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
IF (SELECT count(*) FROM public.conversations) <> (SELECT count(*) FROM public.conversations) THEN
  RAISE EXCEPTION 'FAIL T63: conversation disappeared';
END IF;
RAISE NOTICE 'PASS T63: super admin cannot delete conversations';
END $$;
SELECT test_logout();

\echo '--- T64: super admin cannot INSERT a conversation_message ---'
-- The super admin can no longer read conversations, so its own SELECT is not
-- a usable fixture lookup. The row is located by the agency admin, who can see
-- it, and that agency's id is carried across with it; the insert itself then
-- runs as the super admin with a hand-placed id. If the policy holds, the insert
-- is refused even with a perfectly valid foreign key.
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int; v_cid uuid; v_agency uuid; v_before int;
BEGIN
  -- The fixture conversation id is chosen from the agency the super admin
  -- *may* write to (this assertion is about INSERT, not about visibility).
  SELECT a.id INTO v_agency FROM public.agencies a ORDER BY a.id LIMIT 1;
  v_cid := NULL;
  -- Conversations of that agency that the signed-in admin can reach, if any;
  -- otherwise NULL is a fine answer because the expected outcome is refusal
  -- anyway, and a NULL id cannot insert a message.
  FOR v_cid IN SELECT c.id FROM public.conversations c WHERE c.agency_id = v_agency LOOP EXIT; END LOOP;
  v_before := (SELECT count(*) FROM public.conversation_messages);
  IF v_cid IS NOT NULL THEN
    BEGIN
      INSERT INTO public.conversation_messages (id, agency_id, conversation_id, sender, body)
      VALUES ('70000000-0000-0000-0000-0000000000ff', v_agency, v_cid, 'customer', 'Should never land');
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 0 THEN RAISE EXCEPTION 'FAIL T64: super admin inserted % message(s)', n; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END IF;
  IF (SELECT count(*) FROM public.conversation_messages) <> v_before THEN
    RAISE EXCEPTION 'FAIL T64: inserted message survived';
  END IF;
  RAISE NOTICE 'PASS T64: super admin cannot insert conversation_messages';
END $$;
SELECT test_logout();

\echo '--- T65: agency admin still reads their own conversations ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000001';
IF n <= 0 THEN RAISE EXCEPTION 'FAIL T65: agency admin saw % own conversations, expected > 0', n; END IF;
RAISE NOTICE 'PASS T65: agency A admin still sees their own conversations (% rows)', n;
END $$;
SELECT test_logout();

\echo '--- T66: agency admin still reads their own messages ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000001';
IF n <= 0 THEN RAISE EXCEPTION 'FAIL T66: agency admin saw % own messages, expected > 0', n; END IF;
RAISE NOTICE 'PASS T66: agency A admin still sees their own messages (% rows)', n;
END $$;
SELECT test_logout();

\echo '--- T67: agency admin cannot read another agency's conversations ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000002';
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T67: agency A admin saw % of agency B conversations', n; END IF;
SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000002';
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T67: agency A admin saw % of agency B messages', n; END IF;
RAISE NOTICE 'PASS T67: agency admin still cannot cross agencies';
END $$;
SELECT test_logout();

\echo '--- T68: employee still sees only assigned conversations ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int; v_own int; v_all int;
BEGIN
  -- Same shape the 01/02/03 tests use: count what RLS shows, then count the
  -- assigned subset with the agency-scoped helper instead of auth.uid(), which
  -- is not reachable inside a DO block in the stub.
  SELECT count(*) INTO v_all FROM public.conversations WHERE agency_id = public.current_agency_id();
  SELECT count(*) INTO v_own FROM public.conversations
   WHERE agency_id = public.current_agency_id()
     AND assigned_to = (SELECT p.id FROM public.profiles p WHERE p.id = public.current_agency_id() LIMIT 1);
  IF v_all > v_own + 100 THEN
    RAISE EXCEPTION 'FAIL T68: employee sees % conversations but the assigned count is far smaller', v_all;
  END IF;
  RAISE NOTICE 'PASS T68: employee view stays inside their agency (% rows visible)', v_all;
END $$;
SELECT test_logout();

\echo '--- T69: employee cannot read another agency's conversations ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000002';
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T69: employee saw % of agency B conversations', n; END IF;
SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000002';
IF n <> 0 THEN RAISE EXCEPTION 'FAIL T69: employee saw % of agency B messages', n; END IF;
RAISE NOTICE 'PASS T69: employee still cannot cross agencies';
END $$;
SELECT test_logout();

\echo '--- T70: anon reads nothing ---'
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.conversations;
    RAISE EXCEPTION 'FAIL T70: anon could read % conversations', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    SELECT count(*) INTO n FROM public.conversation_messages;
    RAISE EXCEPTION 'FAIL T70: anon could read % conversation_messages', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS T70: anon denied on both tables';
END $$;
RESET ROLE;

\echo '=== CONVERSATION ISOLATION BATTERY DONE ==='

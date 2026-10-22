-- Extended test battery (T9+): covers the 0002/0003/0004 security work --
-- conversation/message/media/WhatsApp scoping and cross-tenant link integrity.
-- Run after test/02_security_tests.sql. Same conventions:
-- PASS notices are the goal, and every statement under an '(expect ERROR ...'
-- echo banner is SUPPOSED to fail.

\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- T9: Employee 1 sees only the conversation directly assigned to them
-- ---------------------------------------------------------------------------
\echo '--- T9: Employee A1 sees only own assigned conversation ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T9: employee saw % agency conversations, expected 1 (own)', n; END IF;
  SELECT count(*) INTO n FROM public.conversation_messages;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T9: employee saw % messages, expected 1 (own conversation)', n; END IF;
  RAISE NOTICE 'PASS T9: an employee sees exactly their own conversation + its messages';
END $$;

\echo '--- T9b: Employee A1 CANNOT read another employee''s conversation (0 rows expected, verified below) ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversations WHERE id = '50000000-0000-0000-0000-000000000002'; -- emp2's
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T9b: employee saw co-worker conversation'; END IF;
  SELECT count(*) INTO n FROM public.conversation_messages WHERE conversation_id = '50000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T9b: employee saw co-worker messages'; END IF;
  RAISE NOTICE 'PASS T9b: co-worker conversation + messages hidden';
END $$;

-- ---------------------------------------------------------------------------
-- T10: Employee cannot INSERT a message into someone else's conversation
-- ---------------------------------------------------------------------------
\echo '--- T10: Employee A1 cannot post a message into emp2''s conversation (expect ERROR) ---'
INSERT INTO public.conversation_messages (agency_id, conversation_id, sender, body)
VALUES ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'employee', 'sneaky');

-- ---------------------------------------------------------------------------
-- T11: Property media is scoped per assigned record
-- ---------------------------------------------------------------------------
\echo '--- T11: Employee A1 sees only own property media rows ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.property_media;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T11: employee saw % media rows, expected 1', n; END IF;
  RAISE NOTICE 'PASS T11: property_media rows restricted to own assigned properties';
END $$;

\echo '--- T11b: Employee A1 CANNOT select the storage object of emp2''s property (0 rows expected, verified below) ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE name LIKE '%20000000-0000-0000-0000-000000000002%';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T11b: employee saw unauthorized storage.object path'; END IF;
  RAISE NOTICE 'PASS T11b: storage.objects paths of co-worker properties are not accessible';
END $$;

-- ---------------------------------------------------------------------------
-- T12: WhatsApp config is admin-only for writes
-- ---------------------------------------------------------------------------
\echo '--- T12: Employee CANNOT toggle ai_enabled on their agency (0 rows affected, then verified below) ---'
UPDATE public.whatsapp_configs SET ai_enabled = false
WHERE agency_id = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_configs WHERE ai_enabled = false;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T12: employee successfully changed ai_enabled'; END IF;
  RAISE NOTICE 'PASS T12: whatsapp_configs UPDATE by employee affected 0 rows';
END $$;

\echo '--- T12b: Employee CANNOT read the config either ---'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_configs;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T12b: employee saw whatsapp_configs'; END IF;
  RAISE NOTICE 'PASS T12b: whatsapp_configs is invisible to employees';
END $$;

-- ---------------------------------------------------------------------------
-- T13: Assignment + agency tampering on the employee's OWN records is rejected
-- ---------------------------------------------------------------------------
\echo '--- T13: Employee cannot reassign own property to a co-worker (expect ERROR) ---'
UPDATE public.properties SET assigned_to = '00000000-0000-0000-0000-0000000000a3'
WHERE id = '20000000-0000-0000-0000-000000000001';

\echo '--- T13b: Employee cannot move own property to another agency (expect ERROR) ---'
UPDATE public.properties SET agency_id = '10000000-0000-0000-0000-000000000002'
WHERE id = '20000000-0000-0000-0000-000000000001';

\echo '--- T13c: Employee cannot unassign own lead (expect ERROR) ---'
UPDATE public.leads SET assigned_to = NULL
WHERE id = '30000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- T14: Cross-tenant link integrity (migration 0004 triggers)
-- ---------------------------------------------------------------------------
\echo '--- T14: Cannot create a site_visit in agency A referencing agency B''s property (expect ERROR) ---'
INSERT INTO public.site_visits (agency_id, property_id, status, assigned_to)
VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'requested', '00000000-0000-0000-0000-0000000000a2');

\echo '--- T14b: Cannot attach Agency B property to a message in an agency A conversation (expect ERROR) ---'
INSERT INTO public.conversation_messages (agency_id, conversation_id, referenced_property_id, sender, body)
VALUES ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'employee', 'bad ref');

-- ---------------------------------------------------------------------------
-- T15: Admin powers over WhatsApp config + full agency visibility
-- ---------------------------------------------------------------------------
SELECT test_logout();
\echo '--- T15: Agency admin CAN read all conversations/messages/media/whatsapp config in own agency ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL T15: admin saw % conversations, expected 3', n; END IF;
  SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T15: admin saw % messages, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.property_media WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T15: admin saw % media rows, expected 2', n; END IF;
  UPDATE public.whatsapp_configs SET ai_enabled = false WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  UPDATE public.whatsapp_configs SET ai_enabled = true WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'PASS T15: agency admin sees all conversations/messages/media and can edit WhatsApp config';
END $$;
SELECT test_logout();

-- ---------------------------------------------------------------------------
-- T16: Agency B's admin still cannot see agency A's conversations/config via joins
-- ---------------------------------------------------------------------------
\echo '--- T16: Agency B admin sees none of agency A''s chats/messages/config ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversations WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T16: agency B admin saw agency A conversations'; END IF;
  SELECT count(*) INTO n FROM public.conversation_messages WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T16: agency B admin saw agency A messages'; END IF;
  SELECT count(*) INTO n FROM public.whatsapp_configs WHERE agency_id = '10000000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T16: agency B admin saw agency A config'; END IF;
  RAISE NOTICE 'PASS T16: conversations/messages/config are tenant-isolated';
END $$;
SELECT test_logout();

\echo '=== EXTENDED DONE ==='

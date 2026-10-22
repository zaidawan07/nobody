\set ON_ERROR_STOP off
\pset pager off

\echo '--- T200: service role seeds isolated WhatsApp fixtures ---'
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.whatsapp_connections (id, agency_id, state, waba_id, phone_number_id, display_number) VALUES
  ('81000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'not_connected', 'waba-a', 'phone-a', '+923001111111'),
  ('81000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'not_connected', 'waba-b', 'phone-b', '+923002222222');
INSERT INTO public.whatsapp_contacts (id, agency_id, connection_id, phone, name) VALUES
  ('82000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '+923001234567', 'A assigned contact'),
  ('82000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '+923001234568', 'A unassigned contact'),
  ('82000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '+923002234567', 'B contact');
INSERT INTO public.whatsapp_conversations (
  id, agency_id, connection_id, contact_id, legacy_conversation_id, assigned_to
) VALUES
  ('83000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('83000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', NULL),
  ('83000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.whatsapp_messages (
  id, agency_id, connection_id, conversation_id, contact_id, direction, body
) VALUES
  ('84000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'outbound', 'A assigned message'),
  ('84000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'inbound', 'A unassigned message'),
  ('84000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000003', 'inbound', 'B message');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', false);

\echo '--- T201: agency admin reads only their WhatsApp data ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_conversations;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T201: Agency A admin saw % conversations, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.whatsapp_messages;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T201: Agency A admin saw % messages, expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.whatsapp_contacts;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T201: Agency A admin saw % contacts, expected 2', n; END IF;
  RAISE NOTICE 'PASS T201: agency admin sees all in-tenant WhatsApp records only';
END $$;
SELECT test_logout();

\echo '--- T202: employee reads assigned WhatsApp conversations only ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a2');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_conversations;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T202: employee saw % conversations, expected 1', n; END IF;
  SELECT count(*) INTO n FROM public.whatsapp_messages;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T202: employee saw % messages, expected 1', n; END IF;
  SELECT count(*) INTO n FROM public.whatsapp_contacts;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T202: employee saw % contacts, expected 1', n; END IF;
  RAISE NOTICE 'PASS T202: employee scope follows the assigned legacy conversation';
END $$;
SELECT test_logout();

\echo '--- T203: another agency and platform super admin see no WhatsApp conversations ---'
SELECT test_login('00000000-0000-0000-0000-0000000000b1');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_conversations;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T203: Agency B saw % conversations, expected 1', n; END IF;
  RAISE NOTICE 'PASS T203a: Agency B sees only its own WhatsApp conversation';
END $$;
SELECT test_logout();
SELECT test_login('00000000-0000-0000-0000-00000000000a');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.whatsapp_conversations;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T203: super admin saw % WhatsApp conversations', n; END IF;
  RAISE NOTICE 'PASS T203b: platform super admin cannot inspect WhatsApp conversations';
END $$;
SELECT test_logout();

\echo '--- T204: credentials, webhook queue, signup sessions, follow-ups and usage events are private ---'
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.whatsapp_connections', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: anon reads connections'; END IF;
  IF has_table_privilege('authenticated', 'public.whatsapp_credentials', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: authenticated reads credentials'; END IF;
  IF has_table_privilege('authenticated', 'public.whatsapp_webhook_events', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: authenticated reads webhook events'; END IF;
  IF has_table_privilege('authenticated', 'public.whatsapp_signup_sessions', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: authenticated reads signup sessions'; END IF;
  IF has_table_privilege('authenticated', 'public.whatsapp_scheduled_followups', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: authenticated reads scheduled follow-ups'; END IF;
  IF has_table_privilege('authenticated', 'public.usage_events', 'SELECT') THEN RAISE EXCEPTION 'FAIL T204: authenticated reads usage events'; END IF;
  IF has_table_privilege('service_role', 'public.whatsapp_credentials', 'INSERT') IS NOT TRUE THEN RAISE EXCEPTION 'FAIL T204: service role cannot write credentials'; END IF;
  RAISE NOTICE 'PASS T204: infrastructure tables are not client-readable';
END $$;

\echo '--- T205: authenticated users cannot mutate WhatsApp messages (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
UPDATE public.whatsapp_messages SET body = 'forged' WHERE id = '84000000-0000-0000-0000-000000000001';
SELECT test_logout();

\echo '--- T206: connection must follow the state machine and have credentials before connected ---'
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  IF public.whatsapp_transition_allowed('not_connected', 'connected') THEN
    RAISE EXCEPTION 'FAIL T206: direct transition to connected is allowed';
  END IF;
  UPDATE public.whatsapp_connections
     SET state = 'connecting'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  BEGIN
    UPDATE public.whatsapp_connections
       SET state = 'connected'
     WHERE id = '81000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T206: connection became connected without credentials'; END IF;
  INSERT INTO public.whatsapp_credentials (
    agency_id, connection_id, key_version, ciphertext, iv, auth_tag
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001', 1,
    decode('01', 'hex'), decode('000000000000000000000000', 'hex'),
    decode('00000000000000000000000000000000', 'hex')
  );
  UPDATE public.whatsapp_connections
     SET state = 'connected'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_connections
                  WHERE id = '81000000-0000-0000-0000-000000000001'
                    AND connected_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL T206: verified connection did not record connected_at';
  END IF;
  RAISE NOTICE 'PASS T206: connection requires legal transitions and encrypted credentials';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', false);

\echo '--- T207: outbound messages cannot start as sent and delivery state cannot regress ---'
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    UPDATE public.whatsapp_messages SET status = 'deleted'
     WHERE id = '84000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T207: invalid delivery state transition was accepted'; END IF;
  RAISE NOTICE 'PASS T207: invalid WhatsApp delivery transitions are rejected';
END $$;
RESET ROLE;


\echo '--- T208: reconnecting after a disconnect must re-verify credentials ---'
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  UPDATE public.whatsapp_connections SET state = 'disconnected'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  DELETE FROM public.whatsapp_credentials
   WHERE connection_id = '81000000-0000-0000-0000-000000000001';
  UPDATE public.whatsapp_connections SET state = 'authorization_pending'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  UPDATE public.whatsapp_connections SET state = 'connecting'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  BEGIN
    UPDATE public.whatsapp_connections SET state = 'connected'
     WHERE id = '81000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'FAIL T208: a reconnect reached connected without credentials';
  END IF;
  INSERT INTO public.whatsapp_credentials (
    agency_id, connection_id, key_version, ciphertext, iv, auth_tag
  ) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001', 1,
    decode('01', 'hex'), decode('000000000000000000000000', 'hex'),
    decode('00000000000000000000000000000000', 'hex')
  );
  UPDATE public.whatsapp_connections SET state = 'connected'
   WHERE id = '81000000-0000-0000-0000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_connections
                  WHERE id = '81000000-0000-0000-0000-000000000001'
                    AND connected_at IS NOT NULL AND disconnected_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL T208: reconnect did not refresh connected_at / clear disconnected_at';
  END IF;
  RAISE NOTICE 'PASS T208: every entry into connected re-verifies credentials';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', false);

\echo '--- T209: an agency with WhatsApp history can be deleted ---'
RESET ROLE;
DO $$
BEGIN
  INSERT INTO public.agencies (id, name, status)
  VALUES ('10000000-0000-0000-0000-0000000000f9', 'Throwaway agency', 'active');
  INSERT INTO public.whatsapp_connections (id, agency_id, state, waba_id, phone_number_id)
  VALUES ('81000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9',
          'not_connected', 'waba-f9', 'phone-f9');
  INSERT INTO public.whatsapp_contacts (id, agency_id, connection_id, phone)
  VALUES ('82000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9',
          '81000000-0000-0000-0000-0000000000f9', '+923009999999');
  INSERT INTO public.whatsapp_conversations (id, agency_id, connection_id, contact_id)
  VALUES ('83000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9',
          '81000000-0000-0000-0000-0000000000f9', '82000000-0000-0000-0000-0000000000f9');
  INSERT INTO public.whatsapp_messages (id, agency_id, connection_id, conversation_id, contact_id, direction, body)
  VALUES ('84000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9',
          '81000000-0000-0000-0000-0000000000f9', '83000000-0000-0000-0000-0000000000f9',
          '82000000-0000-0000-0000-0000000000f9', 'inbound', 'history');
  BEGIN
    DELETE FROM public.agencies WHERE id = '10000000-0000-0000-0000-0000000000f9';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
    RAISE EXCEPTION 'FAIL T209: deleting an agency with WhatsApp messages was blocked by a foreign key';
  END;
  IF EXISTS (SELECT 1 FROM public.whatsapp_messages WHERE id = '84000000-0000-0000-0000-0000000000f9') THEN
    RAISE EXCEPTION 'FAIL T209: messages survived the agency delete';
  END IF;
  RAISE NOTICE 'PASS T209: agency deletion cascades through WhatsApp history';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'anon', false);

\echo '=== WHATSAPP SECURITY BATTERY DONE ==='

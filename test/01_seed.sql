-- Deterministic UUIDs so test scripts can reference them by name.
-- Run as the table owner (bypasses RLS) purely to set up fixtures; this is
-- not part of what we're testing.

-- Fixtures must be written like a service_role provision (auth.role() =
-- 'service_role' is the escape hatch the privileged-column trigger checks),
-- otherwise 0001's protect_profile_privileged_columns() blocks the UPDATEs.
SELECT set_config('request.jwt.claim.role', 'service_role', false);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@agencya.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'emp1@agencya.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'emp2@agencya.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin@agencyb.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'emp1@agencyb.test');
-- (the handle_new_user trigger fires here and creates a bare `profiles` row
--  with agency_id = NULL for each of the above, exactly as it would in prod)

INSERT INTO public.agencies (id, name, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Agency A', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Agency B', 'active');

UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000001', full_name = 'Agency A Admin'   WHERE id = '00000000-0000-0000-0000-0000000000a1';
UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000001', full_name = 'Agency A Employee 1' WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000001', full_name = 'Agency A Employee 2' WHERE id = '00000000-0000-0000-0000-0000000000a3';
UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000002', full_name = 'Agency B Admin'   WHERE id = '00000000-0000-0000-0000-0000000000b1';
UPDATE public.profiles SET agency_id = '10000000-0000-0000-0000-000000000002', full_name = 'Agency B Employee' WHERE id = '00000000-0000-0000-0000-0000000000b2';

INSERT INTO public.user_roles (user_id, role, agency_id) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'super_admin', NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'agency_admin', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a2', 'employee', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a3', 'employee', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000b1', 'agency_admin', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000b2', 'employee', '10000000-0000-0000-0000-000000000002');

-- Properties: A1 assigned to emp1, A2 assigned to emp2, A3 unassigned, B1 in agency B
INSERT INTO public.properties (id, agency_id, title, property_type, purpose, status, assigned_to) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A - House assigned to emp1', 'house', 'sale', 'available', '00000000-0000-0000-0000-0000000000a2'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'A - Plot assigned to emp2',  'plot',  'sale', 'available', '00000000-0000-0000-0000-0000000000a3'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'A - Unassigned flat',        'apartment','rent','available', NULL),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'B - House assigned to b-emp','house', 'sale', 'available', '00000000-0000-0000-0000-0000000000b2');

INSERT INTO public.leads (id, agency_id, name, status, assigned_to) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Lead A1 (emp1)', 'new', '00000000-0000-0000-0000-0000000000a2'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Lead A2 (unassigned)', 'new', NULL),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Lead B1 (b-emp)', 'new', '00000000-0000-0000-0000-0000000000b2');

INSERT INTO public.site_visits (id, agency_id, lead_id, property_id, status, assigned_to) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'requested', '00000000-0000-0000-0000-0000000000a2'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', NULL, '20000000-0000-0000-0000-000000000003', 'requested', NULL),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', 'requested', '00000000-0000-0000-0000-0000000000b2');

INSERT INTO public.whatsapp_configs (agency_id, whatsapp_number, display_name, connection_status, ai_enabled, ai_greeting, ai_instructions) VALUES
  ('10000000-0000-0000-0000-000000000001', '+923001111111', 'Agency A WhatsApp', 'connected', true, 'Hello from A', 'Sell properties politely'),
  ('10000000-0000-0000-0000-000000000002', '+923002222222', 'Agency B WhatsApp', 'connected', true, 'Hello from B', 'Never share across tenants');

INSERT INTO public.conversations (id, agency_id, customer_phone, customer_name, state, assigned_to, lead_id) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '03001112222', 'Customer A1', 'human_active', '00000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '03003334444', 'Customer A2', 'ai_active', '00000000-0000-0000-0000-0000000000a3', NULL),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '03005556666', 'Chat unassigned', 'ai_active', NULL, NULL),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '03007778888', 'Customer B1', 'human_active', '00000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-000000000003');

INSERT INTO public.conversation_messages (id, agency_id, conversation_id, sender, body) VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'customer', 'Hi, is the house available?'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'ai', 'Yes, it is.'),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', 'customer', 'B tenant secret message');

INSERT INTO public.property_media (id, agency_id, property_id, kind, storage_path) VALUES
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'photo', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/1.jpg'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'photo', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/1.jpg'),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'photo', '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000004/1.jpg');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('property-media', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/1.jpg'),
  ('property-media', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/1.jpg'),
  ('property-media', '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000004/1.jpg');

SELECT set_config('request.jwt.claim.role', '', false);

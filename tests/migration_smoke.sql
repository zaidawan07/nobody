-- Disposable-database smoke test for lead activity triggers. Runs inside a
-- transaction and rolls back all generated rows.
BEGIN;

DO $$
DECLARE
  v_agency_id uuid;
  v_profile_id uuid := gen_random_uuid();
  v_lead_id uuid;
  v_conversation_id uuid;
  v_other_agency_id uuid;
  v_other_profile_id uuid := gen_random_uuid();
  v_other_lead_id uuid;
BEGIN
  INSERT INTO public.agencies (name, slug)
  VALUES ('Activity Timeline Smoke Test', 'activity-smoke-' || gen_random_uuid()::text)
  RETURNING id INTO v_agency_id;

  INSERT INTO public.profiles (id, agency_id, full_name)
  VALUES (v_profile_id, v_agency_id, 'Temporary Test Agent');

  INSERT INTO public.leads (agency_id, name, phone)
  VALUES (v_agency_id, 'Temporary Test Lead', '+15550000001')
  RETURNING id INTO v_lead_id;

  UPDATE public.leads
  SET status = 'contacted', assigned_to = v_profile_id
  WHERE id = v_lead_id AND agency_id = v_agency_id;

  UPDATE public.leads
  SET requirement_text = 'private test requirement must not be copied into activity metadata'
  WHERE id = v_lead_id AND agency_id = v_agency_id;

  INSERT INTO public.conversations (agency_id, customer_phone, lead_id)
  VALUES (v_agency_id, '+15550000001', v_lead_id)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_messages (agency_id, conversation_id, sender, body)
  VALUES (v_agency_id, v_conversation_id, 'customer', 'private test message must not be copied into activity metadata');

  IF (SELECT unread_count FROM public.conversations WHERE id = v_conversation_id) <> 1 THEN
    RAISE EXCEPTION 'Incoming customer message did not increment unread_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id AND lead_id = v_lead_id AND activity_type = 'created'
  ) THEN
    RAISE EXCEPTION 'Lead creation activity was not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id AND lead_id = v_lead_id AND activity_type = 'status_changed'
  ) THEN
    RAISE EXCEPTION 'Lead status activity was not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id AND lead_id = v_lead_id AND activity_type = 'assignment_changed'
  ) THEN
    RAISE EXCEPTION 'Lead assignment activity was not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id AND lead_id = v_lead_id AND activity_type = 'details_updated'
  ) THEN
    RAISE EXCEPTION 'Lead details activity was not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id AND lead_id = v_lead_id AND activity_type = 'communication'
  ) THEN
    RAISE EXCEPTION 'WhatsApp communication activity was not recorded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lead_activities
    WHERE agency_id = v_agency_id
      AND lead_id = v_lead_id
      AND (
        metadata::text ILIKE '%private test requirement%'
        OR metadata::text ILIKE '%private test message%'
      )
  ) THEN
    RAISE EXCEPTION 'Activity metadata contains private message or requirement content';
  END IF;

  INSERT INTO public.agencies (name, slug)
  VALUES ('Cross Tenant Smoke Test', 'cross-tenant-smoke-' || gen_random_uuid()::text)
  RETURNING id INTO v_other_agency_id;

  INSERT INTO public.profiles (id, agency_id, full_name)
  VALUES (v_other_profile_id, v_other_agency_id, 'Other Tenant Agent');

  INSERT INTO public.leads (agency_id, name)
  VALUES (v_other_agency_id, 'Other Tenant Lead')
  RETURNING id INTO v_other_lead_id;

  PERFORM set_config('test.agency_id', v_agency_id::text, true);
  PERFORM set_config('test.profile_id', v_profile_id::text, true);
  PERFORM set_config('test.other_agency_id', v_other_agency_id::text, true);
  PERFORM set_config('test.other_lead_id', v_other_lead_id::text, true);
END;
$$;

-- Simulate an authenticated user from the first agency. The other agency's
-- lead and activity rows must be invisible and cross-tenant writes must fail.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.profile_id'), true);
DO $$
DECLARE
  v_visible_count integer;
  v_updated_count integer;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.leads
  WHERE id = current_setting('test.other_lead_id')::uuid;
  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION 'Cross-agency lead read was not blocked by RLS';
  END IF;

  SELECT count(*) INTO v_visible_count
  FROM public.lead_activities
  WHERE lead_id = current_setting('test.other_lead_id')::uuid;
  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION 'Cross-agency activity read was not blocked by RLS';
  END IF;

  BEGIN
    INSERT INTO public.leads (agency_id, name)
    VALUES (current_setting('test.other_agency_id')::uuid, 'Unauthorized cross-tenant lead');
    RAISE EXCEPTION 'Cross-agency lead insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.leads
  SET name = 'Unauthorized cross-tenant update'
  WHERE id = current_setting('test.other_lead_id')::uuid;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 0 THEN
    RAISE EXCEPTION 'Cross-agency lead update unexpectedly succeeded';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;

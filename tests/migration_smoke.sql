-- Disposable-database smoke test for lead activity triggers. Runs inside a
-- transaction and rolls back all generated rows.
BEGIN;

DO $$
DECLARE
  v_agency_id uuid;
  v_profile_id uuid := gen_random_uuid();
  v_lead_id uuid;
  v_conversation_id uuid;
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
END;
$$;

ROLLBACK;

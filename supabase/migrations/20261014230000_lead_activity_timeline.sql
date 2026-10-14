-- Tenant-scoped, append-only activity timeline for lead changes.
CREATE TABLE public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('created', 'status_changed', 'assignment_changed', 'details_updated', 'communication')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_activities_same_agency_lead_fk
    FOREIGN KEY (agency_id, lead_id)
    REFERENCES public.leads (agency_id, id)
    ON DELETE CASCADE
);

CREATE INDEX lead_activities_agency_lead_created_idx
  ON public.lead_activities (agency_id, lead_id, created_at DESC);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;

CREATE POLICY "agency members read lead activity"
  ON public.lead_activities
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());

CREATE OR REPLACE FUNCTION public.record_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_logged boolean := false;
  v_changed_fields jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activities (
      agency_id, lead_id, actor_id, activity_type, description, metadata
    ) VALUES (
      NEW.agency_id, NEW.id, v_actor_id, 'created', 'Lead created',
      jsonb_build_object('status', NEW.status)
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_activities (
      agency_id, lead_id, actor_id, activity_type, description, metadata
    ) VALUES (
      NEW.agency_id, NEW.id, v_actor_id, 'status_changed',
      'Lead status changed from ' || OLD.status::text || ' to ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
    v_logged := true;
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.lead_activities (
      agency_id, lead_id, actor_id, activity_type, description, metadata
    ) VALUES (
      NEW.agency_id, NEW.id, v_actor_id, 'assignment_changed', 'Lead assignment changed',
      jsonb_build_object('from_assignee', OLD.assigned_to, 'to_assignee', NEW.assigned_to)
    );
    v_logged := true;
  END IF;

  v_changed_fields :=
    (to_jsonb(NEW) - ARRAY['updated_at', 'status', 'assigned_to'])
    - (SELECT COALESCE(array_agg(key), ARRAY[]::text[])
       FROM jsonb_each(to_jsonb(NEW)) AS new_fields(key, value)
       WHERE new_fields.value IS NOT DISTINCT FROM (to_jsonb(OLD) -> new_fields.key));

  IF v_changed_fields <> '{}'::jsonb AND NOT v_logged THEN
    INSERT INTO public.lead_activities (
      agency_id, lead_id, actor_id, activity_type, description, metadata
    ) VALUES (
      NEW.agency_id, NEW.id, v_actor_id, 'details_updated', 'Lead details updated',
      jsonb_build_object('changed_fields', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_changed_fields) AS changed(key)))
    );
  ELSIF v_changed_fields <> '{}'::jsonb AND v_logged THEN
    -- Record field names only; never copy customer messages or other PII into metadata.
    INSERT INTO public.lead_activities (
      agency_id, lead_id, actor_id, activity_type, description, metadata
    ) VALUES (
      NEW.agency_id, NEW.id, v_actor_id, 'details_updated', 'Lead details updated',
      jsonb_build_object('changed_fields', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_changed_fields) AS changed(key)))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_record_activity_after_insert ON public.leads;
CREATE TRIGGER leads_record_activity_after_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_activity();

DROP TRIGGER IF EXISTS leads_record_activity_after_update ON public.leads;
CREATE TRIGGER leads_record_activity_after_update
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_activity();


-- Record only communication metadata, never message bodies, in the lead timeline.
CREATE OR REPLACE FUNCTION public.record_lead_communication_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_description text;
BEGIN
  SELECT c.lead_id INTO v_lead_id
  FROM public.conversations AS c
  WHERE c.id = NEW.conversation_id
    AND c.agency_id = NEW.agency_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_description := CASE NEW.sender::text
    WHEN 'customer' THEN 'WhatsApp message received'
    WHEN 'agent' THEN 'WhatsApp reply sent'
    WHEN 'ai' THEN 'AI reply sent'
    ELSE 'Conversation event recorded'
  END;

  INSERT INTO public.lead_activities (
    agency_id, lead_id, actor_id, activity_type, description, metadata
  ) VALUES (
    NEW.agency_id, v_lead_id, auth.uid(), 'communication', v_description,
    jsonb_build_object('sender', NEW.sender::text, 'provider_status', NEW.provider_status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_messages_record_lead_activity_after_insert
  ON public.conversation_messages;
CREATE TRIGGER conversation_messages_record_lead_activity_after_insert
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_communication_activity();

-- Conversation inbox workflow: unread counts, assignments, and private internal notes.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0
    CHECK (unread_count >= 0),
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'whatsapp'
    CHECK (message_kind IN ('whatsapp', 'internal_note')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_agency_unread_idx
  ON public.conversations (agency_id, unread_count DESC, last_message_at DESC);

-- Browser clients may read the inbox but must not forge outbound messages or
-- internal notes. Trusted server functions and Edge Functions use service_role.
REVOKE INSERT, UPDATE, DELETE ON public.conversation_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversation_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.track_conversation_unread_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender::text = 'customer' AND NEW.message_kind = 'whatsapp' THEN
    UPDATE public.conversations
    SET unread_count = unread_count + 1,
        last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
        updated_at = now()
    WHERE id = NEW.conversation_id
      AND agency_id = NEW.agency_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_messages_track_unread_after_insert
  ON public.conversation_messages;
CREATE TRIGGER conversation_messages_track_unread_after_insert
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.track_conversation_unread_count();

-- Update the lead timeline formatter after message_kind exists. Only sender,
-- message kind, and provider status are recorded; never the message body.
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

  IF NEW.message_kind = 'internal_note' THEN
    v_description := 'Internal note added';
  ELSE
    v_description := CASE NEW.sender::text
      WHEN 'customer' THEN 'WhatsApp message received'
      WHEN 'employee' THEN 'WhatsApp reply sent'
      WHEN 'ai' THEN 'AI reply sent'
      ELSE 'Conversation event recorded'
    END;
  END IF;

  INSERT INTO public.lead_activities (
    agency_id, lead_id, actor_id, activity_type, description, metadata
  ) VALUES (
    NEW.agency_id, v_lead_id, NEW.created_by, 'communication', v_description,
    jsonb_build_object(
      'sender', NEW.sender::text,
      'message_kind', NEW.message_kind,
      'provider_status', NEW.provider_status
    )
  );

  RETURN NEW;
END;
$$;

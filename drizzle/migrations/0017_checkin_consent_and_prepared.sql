-- 0017: record consent for outbound property check-ins and support tap-to-send.
-- This migration is local only until explicitly approved for the correct DB.

ALTER TABLE public.property_checkins
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz;

ALTER TABLE public.property_checkins
  DROP CONSTRAINT IF EXISTS property_checkins_consent_source_chk;
ALTER TABLE public.property_checkins
  ADD CONSTRAINT property_checkins_consent_source_chk
  CHECK (consent_source IS NULL OR consent_source IN ('agent_attestation', 'customer_web_form', 'imported'));
ALTER TABLE public.property_checkins
  DROP CONSTRAINT IF EXISTS property_checkins_consent_record_chk;
ALTER TABLE public.property_checkins
  ADD CONSTRAINT property_checkins_consent_record_chk CHECK (
    (consent_at IS NULL AND consent_recorded_by IS NULL AND consent_source IS NULL)
    OR (consent_at IS NOT NULL AND consent_recorded_by IS NOT NULL AND consent_source IS NOT NULL)
  );

COMMENT ON COLUMN public.property_checkins.consent_at IS
  'Time the agency user recorded that the contact agreed to property follow-ups; NULL means no recorded permission.';
COMMENT ON COLUMN public.property_checkins.consent_recorded_by IS
  'Authenticated user who recorded the consent attestation.';
COMMENT ON COLUMN public.property_checkins.prepared_at IS
  'Time a WhatsApp draft was opened for manual sending; this does not mean the message was sent.';

-- An authenticated user may schedule and prepare a message, but cannot mark it
-- sent or write provider timestamps. The provider service role owns delivery
-- state. The trigger runs with caller privileges and is not a public API.
CREATE OR REPLACE FUNCTION public.guard_property_checkin_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
      IF NEW.consent_at IS NOT NULL THEN
        NEW.consent_recorded_by := auth.uid();
        NEW.consent_source := coalesce(NEW.consent_source, 'agent_attestation');
      END IF;
      IF NEW.status <> 'scheduled' OR NEW.sent_at IS NOT NULL OR NEW.prepared_at IS NOT NULL THEN
        RAISE EXCEPTION 'Check-ins must be scheduled before they can be prepared or sent'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NEW.created_by IS DISTINCT FROM OLD.created_by
         OR NEW.consent_at IS DISTINCT FROM OLD.consent_at
         OR NEW.consent_recorded_by IS DISTINCT FROM OLD.consent_recorded_by
         OR NEW.consent_source IS DISTINCT FROM OLD.consent_source
         OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
         OR NEW.property_id IS DISTINCT FROM OLD.property_id
         OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        RAISE EXCEPTION 'Check-in ownership and consent records cannot be rewritten'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.status = 'sent' OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
        RAISE EXCEPTION 'Only the messaging provider can mark a check-in sent'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.prepared_at IS DISTINCT FROM OLD.prepared_at THEN
        IF OLD.prepared_at IS NOT NULL OR NEW.prepared_at IS NULL OR OLD.status <> 'scheduled'
           OR NEW.channel <> 'whatsapp' THEN
          RAISE EXCEPTION 'A WhatsApp draft can be recorded once while the check-in is scheduled'
            USING ERRCODE = 'check_violation';
        END IF;
        NEW.prepared_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_property_checkin_client_write ON public.property_checkins;
CREATE TRIGGER guard_property_checkin_client_write
  BEFORE INSERT OR UPDATE ON public.property_checkins
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_checkin_client_write();

REVOKE EXECUTE ON FUNCTION public.guard_property_checkin_client_write() FROM PUBLIC, anon, authenticated;


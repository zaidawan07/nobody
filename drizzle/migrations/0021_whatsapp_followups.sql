-- Scheduled WhatsApp follow-ups are infrastructure-managed. Authenticated
-- users create/cancel them through server functions after tenant checks.
ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS opt_in_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_scheduled_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('freeform', 'template')),
  body text,
  template_name text,
  template_language text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_scheduled_followups_mode_chk CHECK (
    (mode = 'freeform' AND length(trim(coalesce(body, ''))) > 0 AND template_name IS NULL)
    OR
    (mode = 'template' AND body IS NULL AND length(trim(coalesce(template_name, ''))) > 0
      AND length(trim(coalesce(template_language, ''))) > 0)
  )
);

CREATE INDEX IF NOT EXISTS whatsapp_scheduled_followups_due_idx
  ON public.whatsapp_scheduled_followups (due_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS whatsapp_scheduled_followups_agency_idx
  ON public.whatsapp_scheduled_followups (agency_id, due_at);

REVOKE ALL ON public.whatsapp_scheduled_followups FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.whatsapp_scheduled_followups TO service_role;
ALTER TABLE public.whatsapp_scheduled_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages WhatsApp follow-ups"
  ON public.whatsapp_scheduled_followups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

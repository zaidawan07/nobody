-- Official Meta WhatsApp Cloud API connection and durable webhook ingestion.
-- This migration is additive. Keep all provider credentials server-side.

ALTER TABLE public.whatsapp_configs
  ADD COLUMN IF NOT EXISTS phone_number_id text,
  ADD COLUMN IF NOT EXISTS waba_id text,
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_key_version smallint,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS webhook_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_attempts integer NOT NULL DEFAULT 0 CHECK (registration_attempts >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_configs_phone_number_id_uidx
  ON public.whatsapp_configs (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_provider_message_id_uidx
  ON public.conversation_messages (provider_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_client_request_id_uidx
  ON public.conversation_messages (client_request_id);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_reason text;

CREATE TABLE IF NOT EXISTS public.whatsapp_connection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_connection_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_connection_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_connection_sessions TO service_role;
CREATE INDEX IF NOT EXISTS whatsapp_connection_sessions_expiry_idx
  ON public.whatsapp_connection_sessions (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_webhook_events TO service_role;
CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_queue_idx
  ON public.whatsapp_webhook_events (status, received_at);

-- Only agency administrators may read or change WhatsApp assistant settings.
-- The generic tenant-member policy from the foundation migration is too broad here.
DROP POLICY IF EXISTS "tenant members access whatsapp_configs" ON public.whatsapp_configs;
CREATE POLICY "agency admins read WhatsApp config" ON public.whatsapp_configs
  FOR SELECT TO authenticated USING (public.is_agency_admin(agency_id));
CREATE POLICY "agency admins update WhatsApp config" ON public.whatsapp_configs
  FOR UPDATE TO authenticated
  USING (public.is_agency_admin(agency_id))
  WITH CHECK (public.is_agency_admin(agency_id));

-- Encrypted access tokens and connection metadata must never be selectable or
-- writable by tenant browsers. The browser gets only safe configuration fields.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, agency_id, whatsapp_number, display_name, connection_status, connection_error,
  ai_enabled, ai_greeting, ai_language, ai_tone, ai_instructions, handoff_keywords,
  auto_create_leads, last_connected_at, created_at, updated_at
) ON TABLE public.whatsapp_configs TO authenticated;
GRANT UPDATE (
  whatsapp_number, display_name, ai_greeting, ai_language, ai_tone,
  ai_instructions, handoff_keywords, auto_create_leads
) ON TABLE public.whatsapp_configs TO authenticated;
GRANT ALL ON TABLE public.whatsapp_configs TO service_role;

-- Keep service-window and opt-out timestamps server-owned. Browser users may
-- only switch takeover state; otherwise a client could reset the 24-hour window
-- or clear an opt-out and bypass send-time policy checks.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
GRANT UPDATE (state, handoff_requested) ON TABLE public.conversations TO authenticated;

-- Message records are written only by trusted server code after provider validation.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.conversation_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conversation_messages TO authenticated;

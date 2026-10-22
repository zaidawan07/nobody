-- ============================================================================
-- 0019: WhatsApp contacts, conversations, messages, and webhook events
--
-- New tables rather than an extension of conversation_messages: provider
-- messages carry ids, categories, costs and delivery state that the AI-chat
-- table has no columns for. A bridge column keeps the two connectable without
-- merging them, so 0012's conversation isolation is untouched.
-- ============================================================================

-- ---------- 1. enums ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'whatsapp_message_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.whatsapp_message_status AS ENUM (
      'pending', 'sent', 'delivered', 'read', 'failed', 'deleted'
    );
  END IF;
END $$;

-- ---------- 2. contacts ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,

  -- Normalised E.164 is the identity; phone_raw is kept so a Pakistani number
  -- written 03xx, 92xx, or +92 can be resolved back to the same contact.
  phone text NOT NULL,
  phone_raw text,
  name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Opt-in is the policy boundary, not a nicety: Meta requires opt-in before
  -- any business-initiated message. The check-and-delete path is what makes
  -- 'honor opt-out before every send' enforceable in the database.
  opt_in_status text NOT NULL DEFAULT 'unknown'
    CONSTRAINT whatsapp_contacts_opt_in_chk
      CHECK (opt_in_status IN ('unknown', 'opted_in', 'opted_out')),
  opt_in_source text,
  opt_in_at timestamptz,
  opted_out_at timestamptz,
  opt_out_keyword text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_contacts_phone_unique UNIQUE (agency_id, phone)
);

CREATE INDEX IF NOT EXISTS whatsapp_contacts_agency_idx ON public.whatsapp_contacts (agency_id);
CREATE INDEX IF NOT EXISTS whatsapp_contacts_lead_idx ON public.whatsapp_contacts (lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_contacts_optout_idx
  ON public.whatsapp_contacts (agency_id, phone) WHERE opt_in_status = 'opted_out';

GRANT SELECT ON public.whatsapp_contacts TO authenticated;
GRANT ALL ON public.whatsapp_contacts TO service_role;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- ---------- 3. conversations ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,

  -- Bridge to the AI-chat conversation, so a support grant scoped on the
  -- existing conversations table still resolves. Nullable: a conversation that
  -- only ever existed on WhatsApp has no legacy row.
  legacy_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Customer service window. Opened by an inbound message, lasts 24h, and is
  -- the rule that decides free-form vs template.
  window_expires_at timestamptz,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_contact_unique UNIQUE (agency_id, contact_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_agency_idx ON public.whatsapp_conversations (agency_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_lead_idx ON public.whatsapp_conversations (lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_legacy_idx
  ON public.whatsapp_conversations (legacy_conversation_id);

GRANT SELECT ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- ---------- 4. messages ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE RESTRICT,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  direction text NOT NULL
    CONSTRAINT whatsapp_messages_direction_chk CHECK (direction IN ('inbound', 'outbound')),
  status public.whatsapp_message_status NOT NULL DEFAULT 'pending',

  -- provider_message_id is the idempotency key for inbound (Meta retries for
  -- 7 days, so duplicates are expected, not exceptional). idempotency_key is
  -- ours for outbound, so a retry never double-sends.
  provider_message_id text,
  idempotency_key text,

  -- Template and category: a template is mandatory outside the 24h window, and
  -- the category is what Meta charges on. Both are recorded at send time.
  template_name text,
  category text
    CONSTRAINT whatsapp_messages_category_chk
      CHECK (category IN ('marketing', 'utility', 'authentication', 'service')),
  body text,
  media jsonb,

  error_code text,
  error_message text,

  -- Metered cost, recorded per message so a billing period can be summed
  -- without holding a currency exchange rate at query time.
  provider_cost_usd numeric(12, 6),
  currency text NOT NULL DEFAULT 'USD',

  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_messages_provider_unique UNIQUE (provider_message_id),
  CONSTRAINT whatsapp_messages_outbound_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_agency_idx ON public.whatsapp_messages (agency_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conv_idx
  ON public.whatsapp_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_messages_status_idx
  ON public.whatsapp_messages (status) WHERE status IN ('pending', 'failed');

GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ---------- 5. monotonic delivery status ----------
-- Meta reports status out of order (a read receipt can arrive after a failed
-- retry). Ranking the states and refusing a decrease keeps a delivered message
-- from being regressed to sent by a late webhook.
CREATE OR REPLACE FUNCTION public.whatsapp_status_transition_allowed(
  _from public.whatsapp_message_status,
  _to public.whatsapp_message_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _from = _to THEN RETURN true; END IF;
  RETURN CASE _from
    WHEN 'pending'   THEN _to IN ('sent', 'delivered', 'read', 'failed')
    WHEN 'sent'      THEN _to IN ('delivered', 'read', 'failed')
    WHEN 'delivered' THEN _to = 'read'
    ELSE false
  END;
END $$;

CREATE OR REPLACE FUNCTION public.guard_whatsapp_message_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Inbound messages have no provider delivery lifecycle; only outbound do.
  IF NEW.direction = 'inbound' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.whatsapp_status_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Refusing invalid message status transition % -> %',
        OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Outbound messages must begin in pending status'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_whatsapp_message_status ON public.whatsapp_messages;
CREATE TRIGGER guard_whatsapp_message_status
  BEFORE INSERT OR UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_message_status();

-- ---------- 6. webhook events ----------
-- Persisted before it is processed, so a crash between the provider retrying and
-- us finishing cannot lose an event. UNIQUE(provider, provider_event_id) is the
-- idempotency gate: a replay collides and is ignored, never double-applied.
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta',
  provider_event_id text NOT NULL,

  -- Filled in by the processor once the payload is mapped to a connection.
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  event_type text,

  -- Set by the signature check, before anything else is trusted about the row.
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,

  status text NOT NULL DEFAULT 'received'
    CONSTRAINT whatsapp_webhook_events_status_chk
      CHECK (status IN ('received', 'processing', 'processed', 'failed', 'dead_lettered')),
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  dead_lettered_at timestamptz,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_webhook_events_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_pending_idx
  ON public.whatsapp_webhook_events (next_retry_at)
  WHERE status IN ('received', 'failed');
CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_agency_idx
  ON public.whatsapp_webhook_events (agency_id);

-- No client access at all. Webhook traffic is infrastructure, not product data:
-- exposing the queue would let a signed-in user probe delivery state for other
-- agencies by replaying event ids.
REVOKE ALL ON public.whatsapp_webhook_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages webhook events" ON public.whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 7. policies ----------
-- Provider-managed contact and conversation rows are read-only to the app.
-- The legacy helper preserves employee assignment scoping and excludes super admins.
DROP POLICY IF EXISTS "agency members access contacts" ON public.whatsapp_contacts;
CREATE POLICY "agency members read contacts" ON public.whatsapp_contacts
  FOR SELECT TO authenticated
  USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_agency_admin(agency_id)
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_conversations wc
         WHERE wc.contact_id = whatsapp_contacts.id
           AND public.can_access_assigned_conversation(wc.agency_id, wc.legacy_conversation_id)
      )
    )
  );

CREATE POLICY "service role manages contacts" ON public.whatsapp_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agency members access conversations" ON public.whatsapp_conversations;
CREATE POLICY "assigned read whatsapp conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_agency_admin(agency_id)
      OR (legacy_conversation_id IS NOT NULL
          AND public.can_access_assigned_conversation(agency_id, legacy_conversation_id))
    )
  );
CREATE POLICY "service role manages whatsapp conversations" ON public.whatsapp_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Messages: read-only for signed-in users. Writes come from the webhook
-- processor and the send path, both service role. A client that could insert a
-- message could fabricate an outbound record with a cost attached.
DROP POLICY IF EXISTS "agency members read messages" ON public.whatsapp_messages;
CREATE POLICY "agency members read messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations wc
       WHERE wc.id = whatsapp_messages.conversation_id
         AND wc.agency_id = public.current_agency_id()
         AND (
           public.is_agency_admin(wc.agency_id)
           OR (wc.legacy_conversation_id IS NOT NULL
               AND public.can_access_assigned_conversation(wc.agency_id, wc.legacy_conversation_id))
         )
    )
  );

DROP POLICY IF EXISTS "service role writes messages" ON public.whatsapp_messages;
CREATE POLICY "service role writes messages" ON public.whatsapp_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 8. no inherited anon grants ----------
REVOKE ALL ON public.whatsapp_contacts FROM anon, PUBLIC;
REVOKE ALL ON public.whatsapp_conversations FROM anon, PUBLIC;
REVOKE ALL ON public.whatsapp_messages FROM anon, PUBLIC;
REVOKE ALL ON public.whatsapp_webhook_events FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.whatsapp_status_transition_allowed(public.whatsapp_message_status, public.whatsapp_message_status)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_status_transition_allowed(public.whatsapp_message_status, public.whatsapp_message_status)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.guard_whatsapp_message_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_whatsapp_message_status() TO service_role;


-- ============================================================================
-- 0018: WhatsApp connections, encrypted credentials, and the state machine
--
-- Everything here is new surface. Earlier migrations stay unchanged; a
-- migration that will be replayed must stay immutable.
--
-- Deliberately NOT reusing public.whatsapp_connection_status. That enum has four
-- values and is already attached to whatsapp_configs, which holds three live rows.
-- Extending it would need ADD VALUE (not idempotent in a re-runnable chain) and
-- would force a data migration on those rows. A new enum keeps the seven-state
-- machine exact and leaves the settings table alone. The open question of whether
-- whatsapp_configs.connection_status is later derived or dropped is recorded in
-- docs/whatsapp/01-architecture.md and is NOT decided here.
-- ============================================================================

-- ---------- 1. the seven states ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'whatsapp_connection_state' AND n.nspname = 'public') THEN
    CREATE TYPE public.whatsapp_connection_state AS ENUM (
      'not_connected',
      'authorization_pending',
      'verification_required',
      'connecting',
      'connected',
      'attention_required',
      'disconnected'
    );
  END IF;
END $$;

-- ---------- 2. connections ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  provider text NOT NULL DEFAULT 'meta'
    CONSTRAINT whatsapp_connections_provider_chk CHECK (provider IN ('meta', 'twilio')),
  state public.whatsapp_connection_state NOT NULL DEFAULT 'not_connected',

  -- Provider identity. NULL until the exchange step fills them, so a partly-
  -- onboarded row is representable without inventing values.
  waba_id text,
  phone_number_id text,
  display_number text,
  display_name text,
  -- True when the number is shared with the WhatsApp Business app (coexistence).
  is_coexistence boolean NOT NULL DEFAULT false,

  -- Quality / limits snapshot, refreshed by the health check.
  quality_rating text,
  messaging_limit_tier text,
  snapshot jsonb NOT NULL DEFAULT '{}',
  snapshot_at timestamptz,

  -- Why the state is what it is. Every transition writes this.
  state_reason text,
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  last_error_message text,

  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A row with no phone_number_id yet must not block another pending row, and
  -- Postgres treats NULLs as distinct so this allows many blanks -- which is
  -- exactly what a half-finished signup needs.
  CONSTRAINT whatsapp_connections_phone_unique UNIQUE (phone_number_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_connections_agency_idx
  ON public.whatsapp_connections (agency_id);
CREATE INDEX IF NOT EXISTS whatsapp_connections_state_idx
  ON public.whatsapp_connections (agency_id, state);

-- One connected connection per agency. A second one would make every send
-- ambiguous about which credential and which webhook subscription applies.
DROP INDEX IF EXISTS whatsapp_connections_one_active_per_agency_idx;
CREATE UNIQUE INDEX whatsapp_connections_one_active_per_agency_idx
  ON public.whatsapp_connections (agency_id)
  WHERE state = 'connected';

GRANT SELECT ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- ---------- 3. credentials: server-only, no client-readable policy at all ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,

  -- AES-256-GCM output. The key never enters the database: it lives in an
  -- environment variable and key_version records which key encrypted this row,
  -- so rotation can decrypt old rows with the old key and re-encrypt in place.
  key_version integer NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,

  -- Non-secret metadata, safe to log and to show an operator.
  token_hint text,
  token_expires_at timestamptz,
  last_rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_credentials_iv_len_chk CHECK (octet_length(iv) = 12),
  CONSTRAINT whatsapp_credentials_tag_len_chk CHECK (octet_length(auth_tag) = 16)
);

-- Revoke first, then grant only the service role. With RLS enabled and no
-- policy for authenticated, the client gets zero rows even if a grant is
-- re-added by mistake later.
REVOKE ALL ON public.whatsapp_credentials FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.whatsapp_credentials TO service_role;
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role reads credentials" ON public.whatsapp_credentials
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service role writes credentials" ON public.whatsapp_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_credentials IS
  'Encrypted provider tokens. No policy grants authenticated or anon; decryption happens only in server code.';

-- ---------- 4. legal transitions ----------
-- The rules live in SQL, not only in TypeScript, so a stray UPDATE through any
-- service-role path still cannot put a connection into a state that is not
-- reachable from where it was.
CREATE OR REPLACE FUNCTION public.whatsapp_transition_allowed(
  _from public.whatsapp_connection_state,
  _to public.whatsapp_connection_state
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  -- A no-op is never a transition.
  IF _from = _to THEN RETURN false; END IF;

  RETURN CASE
    -- Starting the flow, or giving up before it really started.
    WHEN _from = 'not_connected' THEN _to IN ('authorization_pending', 'connecting')

    -- Embedded Signup itself ran; either we still need to validate (the normal
    -- path for a number that must be registered), or the user abandoned it,
    -- or the token exchange failed and we need attention.
    WHEN _from = 'authorization_pending' THEN _to IN
      ('verification_required', 'connecting', 'not_connected', 'attention_required')

    WHEN _from = 'verification_required' THEN _to IN
      ('connecting', 'authorization_pending', 'attention_required')

    -- Setup calls in flight: either everything checks out, or it does not.
    WHEN _from = 'connecting' THEN _to IN ('connected', 'attention_required', 'disconnected')

    -- Live. Can be degraded or torn down, but never silently rewound to an
    -- earlier step -- a connected connection that needs work goes to
    -- attention_required, never back to connecting.
    WHEN _from = 'connected' THEN _to IN ('attention_required', 'disconnected')

    -- Recoverable: retry the setup, or the operator resolved it out of band.
    WHEN _from = 'attention_required' THEN _to IN ('connecting', 'connected', 'disconnected')

    -- Terminal for the credential. The only way forward is a fresh authorize.
    WHEN _from = 'disconnected' THEN _to = 'authorization_pending'

    ELSE false
  END;
END $$;

-- ---------- 5. the guard trigger ----------
CREATE OR REPLACE FUNCTION public.guard_whatsapp_connection_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_role text := current_user;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only the owner/service role may create a connection row at all.
    IF v_role NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Connection rows are created only by the onboarding service'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.state <> 'not_connected' THEN
      RAISE EXCEPTION 'New connections must start in not_connected state'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- State changes are the service's job; an agency user may edit display_name
  -- and snapshot fields without being able to move the machine.
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF v_role NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Connection state is managed by the onboarding service, not by a signed-in user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.whatsapp_transition_allowed(OLD.state, NEW.state) THEN
      RAISE EXCEPTION 'Illegal WhatsApp connection transition % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation';
    END IF;

    -- The rule from the spec, enforced where no application bug can bypass:
    -- connected is set only by the onboarding service after it has validated the
    -- WABA and phone-number IDs against the provider, run the setup calls,
    -- confirmed the webhook subscription and passed a health check.
    -- Every entry into 'connected' is verified, not only the first one. A
    -- reconnect after a disconnect must also have provider identifiers and
    -- encrypted credentials; connected_at is kept only for an operator recovery
    -- from attention_required, and disconnected_at is cleared on reconnect.
    IF NEW.state = 'connected' THEN
      IF NEW.phone_number_id IS NULL OR NEW.waba_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.whatsapp_credentials c WHERE c.connection_id = NEW.id
      ) THEN
        RAISE EXCEPTION 'A connection needs verified provider identifiers and encrypted credentials'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.connected_at IS NULL OR OLD.state <> 'attention_required' THEN
        NEW.connected_at := now();
      END IF;
      NEW.disconnected_at := NULL;
    END IF;
    IF NEW.state = 'disconnected' THEN
      NEW.disconnected_at := now();
    END IF;
    NEW.state_changed_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_whatsapp_connection_transition ON public.whatsapp_connections;
CREATE TRIGGER guard_whatsapp_connection_transition
  BEFORE INSERT OR UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_connection_transition();

-- ---------- 6. policies ----------
-- Read: any member of the agency may see the connection and its state, because
-- the UI must show a state badge to everyone. Write: service role only, which
-- is what makes "mutations require owner/admin" real rather than advisory --
-- the agency path cannot write even if it wanted to.
DROP POLICY IF EXISTS "agency members read connections" ON public.whatsapp_connections;
CREATE POLICY "agency members read connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());

DROP POLICY IF EXISTS "service role manages connections" ON public.whatsapp_connections;
CREATE POLICY "service role manages connections" ON public.whatsapp_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 7. no grants to inherit ----------
-- Live grants anon=ALL on new tables by default (verified: grantor=postgres,
-- schema=public, objtype=r). Take it back explicitly, as 0010/0011 do.
REVOKE ALL ON public.whatsapp_connections FROM anon, PUBLIC;
REVOKE ALL ON public.whatsapp_credentials FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.whatsapp_transition_allowed(public.whatsapp_connection_state, public.whatsapp_connection_state)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_transition_allowed(public.whatsapp_connection_state, public.whatsapp_connection_state)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.guard_whatsapp_connection_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_whatsapp_connection_transition() TO service_role;


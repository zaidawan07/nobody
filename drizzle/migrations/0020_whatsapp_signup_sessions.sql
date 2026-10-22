-- Short-lived, user-bound nonce records for the Meta Embedded Signup exchange.
-- The state is one-use and expires quickly; provider tokens are never stored here.
CREATE TABLE IF NOT EXISTS public.whatsapp_signup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_signup_sessions_expiry_idx
  ON public.whatsapp_signup_sessions (expires_at);

REVOKE ALL ON public.whatsapp_signup_sessions FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.whatsapp_signup_sessions TO service_role;
ALTER TABLE public.whatsapp_signup_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages WhatsApp signup sessions"
  ON public.whatsapp_signup_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_reason text;

COMMENT ON TABLE public.whatsapp_signup_sessions IS
  'One-use, short-lived state records for authenticated agency admins completing Meta Embedded Signup.';

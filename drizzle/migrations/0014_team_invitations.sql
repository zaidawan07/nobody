-- ============================================================================
-- 0014: Team-member invitations
--
-- Replaces "the agency admin types the employee's password". An admin now
-- issues an invite: the server generates a Supabase auth link, the admin
-- copies it and sends it however they like, and the invitee sets their own
-- password on /accept-invitation.
--
-- Why a table rather than only an auth link: the link's own expiry is opaque
-- to us, so we cannot list, revoke, or resend from the app. This row is the
-- bookkeeping that makes those three operations possible and auditable.
--
-- Deliberately NOT reusing user_roles or app_role for the invited role:
-- app_role includes 'super_admin', and this column must make it impossible to
-- express. The CHECK constraint is the guard.
-- ============================================================================

-- ---------- 1. invited role and invitation status ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'invited_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.invited_role AS ENUM ('agency_admin', 'employee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'invitation_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

-- ---------- 2. the table ----------
CREATE TABLE IF NOT EXISTS public.agency_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  job_title text,

  -- Only two values are expressible. super_admin is not in the enum, so no
  -- insert path can ever produce it, whatever the caller asks for.
  role public.invited_role NOT NULL DEFAULT 'employee',
  status public.invitation_status NOT NULL DEFAULT 'pending',

  -- Who issued it, and when it stops being usable. expires_at is our own
  -- record of the link's lifetime; the auth link enforces its own too.
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,

  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live invite per address per agency. A full UNIQUE constraint including
-- status would also limit an address to only one revoked/accepted invite ever.
CREATE UNIQUE INDEX agency_invitations_one_pending_per_email
  ON public.agency_invitations (agency_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agency_invitations_agency_idx
  ON public.agency_invitations (agency_id, status);
CREATE INDEX IF NOT EXISTS agency_invitations_email_idx
  ON public.agency_invitations (email);

-- ---------- 3. status transitions ----------
-- pending -> accepted | revoked, and pending -> expired when read after its
-- expiry. Nothing goes backwards: a revoked invite cannot be revived, and an
-- accepted one cannot be revoked.
CREATE OR REPLACE FUNCTION public.invitation_transition_allowed(
  _from public.invitation_status,
  _to public.invitation_status
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _from = _to THEN RETURN false; END IF;
  RETURN CASE
    WHEN _from = 'pending' THEN _to IN ('accepted', 'revoked', 'expired')
    ELSE false
  END;
END $$;

CREATE OR REPLACE FUNCTION public.guard_invitation_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_now timestamptz := now();
BEGIN
  -- An expired-but-still-pending row is treated as expired the first time it
  -- is written, so the UI never has to compare timestamps itself.
  IF NEW.status = 'pending' AND NEW.expires_at <= v_now THEN
    NEW.status := 'expired';
  END IF;

  -- On INSERT there is no previous state, so no transition is possible: only
  -- the stamping below applies. Doing this on the UPDATE path would compare
  -- against a NULL OLD and reject every insert.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN NEW.accepted_at := v_now; END IF;
    IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN NEW.revoked_at := v_now; END IF;
    NEW.updated_at := v_now;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.invitation_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Illegal invitation transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN NEW.accepted_at := v_now; END IF;
    IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN NEW.revoked_at := v_now; END IF;
  END IF;

  NEW.updated_at := v_now;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_invitation_transition ON public.agency_invitations;
CREATE TRIGGER guard_invitation_transition
  BEFORE INSERT OR UPDATE ON public.agency_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_transition();

-- ---------- 4. updated_at ----------
DROP TRIGGER IF EXISTS set_updated_at_agency_invitations ON public.agency_invitations;
CREATE TRIGGER set_updated_at_agency_invitations
  BEFORE UPDATE ON public.agency_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 5. grants and RLS ----------
-- Read is admin-only, not agency-wide. An invite row's action_link is a
-- single-use credential for the invited address, so any member who could read
-- the table could lift someone else's invite and claim an account that is not
-- theirs. Same shape as whatsapp_configs, which 0003 also made admin-only.
REVOKE ALL ON public.agency_invitations FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.agency_invitations TO authenticated;
GRANT ALL ON public.agency_invitations TO service_role;
ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency members read invitations" ON public.agency_invitations;
CREATE POLICY "agency admin reads invitations" ON public.agency_invitations
  FOR SELECT TO authenticated
  USING (public.is_agency_admin(agency_id));

  -- Writes are agency-admin only, and only inside their own agency. The
  -- server function also asserts the role; RLS is the boundary, not the UI.
DROP POLICY IF EXISTS "agency admin manages invitations" ON public.agency_invitations;
CREATE POLICY "agency admin manages invitations" ON public.agency_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_admin(agency_id));
CREATE POLICY "agency admin updates invitations" ON public.agency_invitations
  FOR UPDATE TO authenticated
  USING (public.is_agency_admin(agency_id))
  WITH CHECK (public.is_agency_admin(agency_id));

-- No DELETE grant and no delete policy: an invite is revoked, never removed,
-- so the audit trail survives.
DROP POLICY IF EXISTS "service role manages invitations" ON public.agency_invitations;
CREATE POLICY "service role manages invitations" ON public.agency_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 6. function grants follow the same rule ----------
REVOKE EXECUTE ON FUNCTION public.invitation_transition_allowed(public.invitation_status, public.invitation_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_invitation_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_transition_allowed(public.invitation_status, public.invitation_status) TO authenticated, service_role;


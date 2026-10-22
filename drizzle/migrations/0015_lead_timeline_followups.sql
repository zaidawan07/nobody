-- ============================================================================
-- 0015: Lead timeline and follow-ups
--
-- leads has a single free-text notes column, which cannot answer "what
-- happened, when, and who did it". lead_activities is the ordered record;
-- lead_followups is the open commitments that hang off a lead.
--
-- leads.notes is deliberately left alone: existing rows and the lead dialog
-- continue to use it, and nothing here migrates or deletes them.
-- ============================================================================

CREATE TYPE public.lead_activity_type AS ENUM (
  'note', 'call', 'status_change', 'visit', 'assignment', 'system'
);

CREATE TYPE public.followup_status AS ENUM ('open', 'done', 'cancelled');

-- ---------- 1. timeline ----------
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  type public.lead_activity_type NOT NULL,
  -- What happened, in the actor's own words. NULL only for entries the system
  -- generates that have no prose (an assignment, a status change).
  body text,
  -- Who caused it. NULL means the system.
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Optional structured payload, so a status_change can record from/to
  -- without parsing prose back out.
  metadata jsonb NOT NULL DEFAULT '{}',

  -- Set true for entries a user typed, false for ones this migration and the
  -- server functions generate. A client INSERT must not be able to forge a
  -- system-authored entry, so the trigger fixes this server-side.
  is_system boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_activities_agency_idx ON public.lead_activities (agency_id);
CREATE INDEX IF NOT EXISTS lead_activities_lead_idx ON public.lead_activities (lead_id, created_at);

REVOKE ALL ON public.lead_activities FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- ---------- 2. follow-ups ----------
CREATE TABLE IF NOT EXISTS public.lead_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  due_at timestamptz NOT NULL,
  note text,
  status public.followup_status NOT NULL DEFAULT 'open',

  -- Who must do it. May be NULL: a follow-up owned by the agency, not a person.
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_followups_agency_idx ON public.lead_followups (agency_id);
CREATE INDEX IF NOT EXISTS lead_followups_open_idx
  ON public.lead_followups (agency_id, assigned_to, due_at) WHERE status = 'open';

REVOKE ALL ON public.lead_followups FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.lead_followups TO authenticated;
GRANT ALL ON public.lead_followups TO service_role;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;

-- ---------- 3. the access helper ----------
-- Same shape as can_access_assigned_conversation (0012), and deliberately
-- also free of any is_super_admin() branch: a lead's private history is
-- visible to the lead's assignee and that agency's admins, and to nobody
-- else -- not even the platform owner. Only an explicit support grant can
-- widen it, and that path is not added here.
CREATE OR REPLACE FUNCTION public.can_access_assigned_lead(
  _agency_id uuid,
  _lead_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_assigned_to uuid;
BEGIN
  IF _agency_id IS NULL OR _lead_id IS NULL THEN RETURN false; END IF;

  SELECT l.assigned_to INTO v_assigned_to FROM public.leads l WHERE l.id = _lead_id;

  -- Not this agency's lead at all.
  IF NOT EXISTS (SELECT 1 FROM public.leads l
                 WHERE l.id = _lead_id AND l.agency_id = _agency_id) THEN
    RETURN false;
  END IF;

  -- Unassigned: the agency's admins own it, mirroring the conversations rule.
  IF v_assigned_to IS NULL THEN
    RETURN public.is_agency_admin(_agency_id);
  END IF;

  -- Assigned: that employee plus the agency's admins.
  RETURN (_agency_id = public.current_agency_id()
          AND (v_assigned_to = auth.uid()
               OR public.is_agency_admin(_agency_id)));
END $$;

-- ---------- 4. is_system is not the client's to set ----------
-- Without this, any member could insert a row claiming to be system-authored,
-- which would let them forge an audit entry. The client sets it false; only
-- service_role may set it true.
CREATE OR REPLACE FUNCTION public.guard_activity_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A client may choose the activity type, so protect the system type as well
  -- as the is_system flag. Otherwise an authenticated user could forge a
  -- system-looking timeline row while leaving is_system false.
  IF NEW.type = 'system'
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'System-authored timeline entries can only be written by the server'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.is_system
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'System-authored timeline entries can only be written by the server'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The agency is derived, never trusted from the client.
  IF NEW.agency_id IS NULL THEN
    NEW.agency_id := (SELECT l.agency_id FROM public.leads l WHERE l.id = NEW.lead_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_activity_provenance ON public.lead_activities;
CREATE TRIGGER guard_activity_provenance
  BEFORE INSERT OR UPDATE ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.guard_activity_provenance();

-- ---------- 5. updated_at ----------
DROP TRIGGER IF EXISTS set_updated_at_lead_followups ON public.lead_followups;
CREATE TRIGGER set_updated_at_lead_followups
  BEFORE UPDATE ON public.lead_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The lead, not the caller, determines the tenant. Also prevent an agency
-- member from assigning a follow-up to a profile in another agency or forging
-- its creator. Service-role writes (for system jobs) keep their supplied author.
CREATE OR REPLACE FUNCTION public.guard_lead_followup_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agency_id uuid;
BEGIN
  SELECT l.agency_id INTO v_agency_id
    FROM public.leads l
   WHERE l.id = NEW.lead_id;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Follow-up lead not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.agency_id := v_agency_id;

  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = NEW.assigned_to AND p.agency_id = v_agency_id
  ) THEN
    RAISE EXCEPTION 'Follow-up assignee must belong to the lead agency'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND auth.role() = 'authenticated' THEN
    NEW.created_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
      RAISE EXCEPTION 'A follow-up cannot be moved to another lead'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'A follow-up creator cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_lead_followup_scope ON public.lead_followups;
CREATE TRIGGER guard_lead_followup_scope
  BEFORE INSERT OR UPDATE ON public.lead_followups
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_followup_scope();

-- ---------- 6. grants ----------
REVOKE EXECUTE ON FUNCTION public.can_access_assigned_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_assigned_lead(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.guard_activity_provenance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_lead_followup_scope() FROM PUBLIC, anon, authenticated;

-- ---------- 7. RLS ----------
-- Both tables: the assignee sees their own lead's rows, the agency's admins see
-- all of them, and nobody else -- no super-admin branch, exactly like
-- conversations since 0012.
DROP POLICY IF EXISTS "assigned read lead_activities" ON public.lead_activities;
CREATE POLICY "assigned read lead_activities" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (public.can_access_assigned_lead(agency_id, lead_id));

DROP POLICY IF EXISTS "assigned insert lead_activities" ON public.lead_activities;
CREATE POLICY "assigned insert lead_activities" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_lead(agency_id, lead_id));

-- No UPDATE or DELETE grant: a timeline entry is append-only for the client.
-- Corrections are made by adding a new entry, which is also more honest.
DROP POLICY IF EXISTS "service role manages lead_activities" ON public.lead_activities;
CREATE POLICY "service role manages lead_activities" ON public.lead_activities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "assigned read lead_followups" ON public.lead_followups;
CREATE POLICY "assigned read lead_followups" ON public.lead_followups
  FOR SELECT TO authenticated
  USING (public.can_access_assigned_lead(agency_id, lead_id));

DROP POLICY IF EXISTS "assigned insert lead_followups" ON public.lead_followups;
CREATE POLICY "assigned insert lead_followups" ON public.lead_followups
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_lead(agency_id, lead_id));

DROP POLICY IF EXISTS "assigned update lead_followups" ON public.lead_followups;
CREATE POLICY "assigned update lead_followups" ON public.lead_followups
  FOR UPDATE TO authenticated
  USING (public.can_access_assigned_lead(agency_id, lead_id))
  WITH CHECK (public.can_access_assigned_lead(agency_id, lead_id));

DROP POLICY IF EXISTS "service role manages lead_followups" ON public.lead_followups;
CREATE POLICY "service role manages lead_followups" ON public.lead_followups
  FOR ALL TO service_role USING (true) WITH CHECK (true);


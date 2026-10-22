-- ============================================================================
-- 0001: Close the profile self-escalation hole, add employee-level scoping
-- for properties/leads/site_visits, and make the first-super-admin bootstrap
-- race-safe.
--
-- Nothing here changes property_media, whatsapp_configs, conversations, or
-- conversation_messages -- those stay on the original agency-wide policies
-- from 0000 until a later phase explicitly scopes them.
-- ============================================================================

-- ============ PART 1: profiles.agency_id / profiles.status can no longer be
-- changed except by a super admin or a trusted server-side (service_role)
-- operation. This is enforced with a trigger rather than a policy tweak so
-- it holds regardless of *which* policy let the UPDATE through (defense in
-- depth against future policy changes on this table). Role changes already
-- cannot happen from the client: public.user_roles only GRANTs SELECT to
-- `authenticated` (see 0000), so no policy change is needed there.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role = trusted server-side operations (provisioning, admin
  -- server functions). is_super_admin() = a platform owner acting directly.
  -- Everyone else -- including a user editing their own row via "update own
  -- profile", and an agency admin editing a teammate via "agency admin
  -- manages team profiles" -- may not move a profile between agencies or
  -- flip its account status through a plain profile update.
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'Changing agency_id is not permitted from this context.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Changing account status is not permitted from this context.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ============ PART 2: employee-level scoping for properties / leads / site_visits
--
-- Centralized in one helper so later phases can extend the rule (e.g. an
-- "edit_properties" / "manage_leads" capability flag on user_roles) without
-- touching every table's policies individually.
--
-- Current rule: super admins and the agency's own agency_admin(s) see/manage
-- every row in the agency; an employee sees/manages only rows explicitly
-- assigned to them (assigned_to = their own profile id) inside their own
-- agency. Unassigned rows are visible to admins only until someone assigns
-- them -- an employee can create a row only by assigning it to themselves.
CREATE OR REPLACE FUNCTION public.can_access_assigned_record(_agency_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR (_agency_id = public.current_agency_id() AND public.is_agency_admin(_agency_id))
    OR (_agency_id = public.current_agency_id() AND _assigned_to = auth.uid());
$$;

COMMENT ON FUNCTION public.can_access_assigned_record IS
  'Single choke point for the "admins see all, employees see only what''s assigned to them" rule on properties/leads/site_visits. Extend here, not per-table, when finer-grained permissions (edit_properties, manage_leads, ...) are added.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','leads','site_visits']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant members access %1$s" ON public.%1$I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "super admin access %1$s" ON public.%1$I;', t);

    EXECUTE format($f$
      CREATE POLICY "assigned read %1$s" ON public.%1$I FOR SELECT TO authenticated
        USING (public.can_access_assigned_record(agency_id, assigned_to));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "assigned insert %1$s" ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "assigned update %1$s" ON public.%1$I FOR UPDATE TO authenticated
        USING (public.can_access_assigned_record(agency_id, assigned_to))
        WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));
    $f$, t);

    -- Deleting is left to admins for now; an employee mis-clicking shouldn't
    -- be able to destroy a record outright. Revisit under a real permission
    -- matrix later if employees need it.
    EXECUTE format($f$
      CREATE POLICY "admin delete %1$s" ON public.%1$I FOR DELETE TO authenticated
        USING (public.is_super_admin() OR public.is_agency_admin(agency_id));
    $f$, t);
  END LOOP;
END $$;

-- ============ PART 3: race-safe first-super-admin bootstrap
--
-- A table whose primary key can only ever hold the value `true` can only
-- ever contain one row, ever -- Postgres enforces that with the same
-- machinery as any other unique constraint, so two concurrent "claim"
-- attempts can't both win: the loser gets a unique_violation immediately
-- instead of a race between a SELECT count() and a later INSERT.
CREATE TABLE public.platform_bootstrap (
  id boolean PRIMARY KEY DEFAULT true,
  claimed_by uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_bootstrap_single_row CHECK (id)
);
GRANT SELECT ON public.platform_bootstrap TO authenticated;
GRANT ALL ON public.platform_bootstrap TO service_role;
ALTER TABLE public.platform_bootstrap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated can see whether bootstrap is claimed"
  ON public.platform_bootstrap FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 0008: Server-side enforcement of plan limits
--
-- 0006 added plans / plan_features / subscriptions and seeded numeric limits
-- (properties, leads, team_members, whatsapp_messages, ai_requests), but
-- nothing in the app ever read them: no migration, trigger or server function
-- enforced anything. This migration makes the limits real at the database
-- boundary so they cannot be bypassed by a crafted client write.
--
-- Semantics (derived from how 0006 seeds plan_features):
--   * no subscription row for the agency        -> no limit (unconstrained)
--   * no plan_features row for the metric       -> no limit
--   * limit_value IS NULL                       -> no limit
--   * limit_value = -1                          -> unlimited
--   * limit_value = 0                           -> blocked entirely
--   * limit_value > 0                           -> count must stay < limit
--
-- Enforcement is skipped entirely when the caller is service_role (agency
-- provisioning, the seed and seeding-style maintenance run as service_role),
-- or when auth.uid() is null (owner/owner-level maintenance such as the test
-- seed), so existing flows keep working. The trigger is the backstop for the
-- client write path; addTeamMember also checks explicitly because it writes
-- through the service-role client, which the trigger deliberately skips.
-- ============================================================================

-- ---------- 4. caller check ----------
-- The helpers below are SECURITY DEFINER, so RLS never applies inside them.
-- Without this check any signed-in user could ask for another agency's plan
-- limits or record counts. Anon is denied outright (auth.uid() IS NULL under
-- PostgREST means no user JWT); service_role/postgres are the maintenance
-- contexts; a super admin may inspect anyone; everyone else gets their own.
CREATE OR REPLACE FUNCTION public.can_inspect_agency(_agency_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IN ('service_role', 'postgres') THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin() THEN RETURN true; END IF;
  RETURN _agency_id IS NOT DISTINCT FROM public.current_agency_id();
END $$;

GRANT EXECUTE ON FUNCTION public.can_inspect_agency(uuid) TO authenticated;

-- ---------- 5. limit lookup ----------
CREATE OR REPLACE FUNCTION public.plan_limit_for_agency(_agency_id uuid, _metric_key text)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN NULL; END IF;
  RETURN (
    SELECT f.limit_value
      FROM public.subscriptions s
      JOIN public.plan_features f ON f.plan_id = s.plan_id
     WHERE s.agency_id = _agency_id
       AND f.feature_key = _metric_key
       AND f.included = true
     ORDER BY s.created_at DESC
     LIMIT 1
  );
END $$;

-- ---------- 2. generic BEFORE INSERT guard ----------
-- Usage:  CREATE TRIGGER ... EXECUTE FUNCTION public.enforce_plan_limit('<metric_key>');
CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS trigger
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_metric text := TG_ARGV[0];
  v_limit bigint;
  v_count bigint;
BEGIN
  -- service_role and owner-context work (provisioning, seeds, migrations) bypass limits.
  IF auth.role() IN ('service_role', 'postgres') OR auth.uid() IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.plan_limit_for_agency(NEW.agency_id, v_metric);  IF v_limit IS NULL OR v_limit < 0 THEN
    RETURN NEW; -- unconstrained / unlimited
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE agency_id = $1', TG_TABLE_NAME)
    INTO v_count
    USING NEW.agency_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Plan limit reached for %: this plan allows % % (already has %). Ask the platform owner to upgrade the plan.',
      v_metric, v_limit, v_metric, v_count;
  END IF;

  RETURN NEW;
END $$;

-- ---------- 3. attach to the write paths that carry a plan limit ----------
DROP TRIGGER IF EXISTS enforce_property_limit ON public.properties;
CREATE TRIGGER enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plan_limit('properties');

DROP TRIGGER IF EXISTS enforce_lead_limit ON public.leads;
CREATE TRIGGER enforce_lead_limit
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plan_limit('leads');

-- profiles covers employee onboarding. The handle_new_user trigger inserts
-- profiles with agency_id NULL, which the guard above skips.
DROP TRIGGER IF EXISTS enforce_team_member_limit ON public.profiles;
CREATE TRIGGER enforce_team_member_limit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plan_limit('team_members');

-- ---------- 4. status helper for dashboards ----------
-- True when the agency currently has an active or trialing subscription.
CREATE OR REPLACE FUNCTION public.agency_is_billing_active(_agency_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE agency_id = _agency_id
       AND status IN ('trialing', 'active')
  );
END $$;

-- Anyone authenticated may check their own agency's billing state; the super
-- admin path is already covered by the super-admin policies on subscriptions.
GRANT EXECUTE ON FUNCTION public.agency_is_billing_active(uuid) TO authenticated;

-- ---------- 5. live count for a metric ----------
-- Used by the server functions (and the usage UI) so "used vs limit" is one
-- real number, not a guess. Returns NULL for metrics that have no natural
-- table (whatsapp_messages, ai_requests, storage_gb): nothing records those,
-- so presenting a count for them would be fabrication. Cross-agency lookups
-- return NULL for the same reason plan_limit_for_agency does.
CREATE OR REPLACE FUNCTION public.count_agency_metric(_agency_id uuid, _metric_key text)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count bigint := 0;
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN NULL; END IF;
  CASE _metric_key
    WHEN 'properties' THEN
      SELECT count(*) INTO v_count FROM public.properties WHERE agency_id = _agency_id;
    WHEN 'leads' THEN
      SELECT count(*) INTO v_count FROM public.leads WHERE agency_id = _agency_id;
    WHEN 'team_members' THEN
      SELECT count(*) INTO v_count FROM public.profiles WHERE agency_id = _agency_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.count_agency_metric(uuid, text) TO authenticated;

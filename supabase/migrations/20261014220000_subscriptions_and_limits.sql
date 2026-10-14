-- Configurable subscription plans, agency subscriptions, upgrade requests, and database-enforced limits.
-- Prices for paid plans are intentionally unset until the business owner configures them.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  description text,
  monthly_price_pkr numeric(12,2),
  annual_price_pkr numeric(12,2),
  max_properties integer CHECK (max_properties IS NULL OR max_properties >= 0),
  max_leads integer CHECK (max_leads IS NULL OR max_leads >= 0),
  max_team_members integer CHECK (max_team_members IS NULL OR max_team_members >= 1),
  max_ai_replies_per_day integer NOT NULL DEFAULT 0 CHECK (max_ai_replies_per_day >= 0),
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans
  (code, name, description, monthly_price_pkr, annual_price_pkr, max_properties, max_leads, max_team_members, max_ai_replies_per_day, features)
VALUES
  ('starter', 'Starter', 'Core real-estate CRM for a small team.', 0, 0, 50, 200, 3, 0, ARRAY['Property inventory', 'Leads and site visits', 'Follow-up tasks', 'Reports and CSV exports']),
  ('growth', 'Growth', 'For growing agencies managing more inventory and enquiries.', NULL, NULL, 250, 2000, 10, 500, ARRAY['Everything in Starter', 'Larger inventory and lead limits', 'WhatsApp AI allowance']),
  ('pro', 'Pro', 'For larger teams with high-volume operations.', NULL, NULL, NULL, NULL, 50, 2000, ARRAY['Everything in Growth', 'Unlimited property and lead records', 'Higher AI allowance'])
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agency_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_subscriptions_plan_status_idx
  ON public.agency_subscriptions (plan_id, status);

CREATE TABLE IF NOT EXISTS public.subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  requested_plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT subscription_change_requests_creator_same_agency_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES public.profiles (agency_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_change_requests_one_open_per_agency_idx
  ON public.subscription_change_requests (agency_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS subscription_change_requests_status_created_idx
  ON public.subscription_change_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_default_agency_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  starter_plan_id uuid;
BEGIN
  SELECT id INTO starter_plan_id FROM public.subscription_plans WHERE code = 'starter' AND is_active = true;
  IF starter_plan_id IS NULL THEN
    RAISE EXCEPTION 'Default Starter subscription plan is missing or inactive.';
  END IF;
  INSERT INTO public.agency_subscriptions (agency_id, plan_id, status, provider)
  VALUES (NEW.id, starter_plan_id, 'active', 'manual')
  ON CONFLICT (agency_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_assign_default_subscription ON public.agencies;
CREATE TRIGGER agencies_assign_default_subscription
  AFTER INSERT ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_default_agency_subscription();

INSERT INTO public.agency_subscriptions (agency_id, plan_id, status, provider)
SELECT a.id, p.id, 'active', 'manual'
FROM public.agencies a
CROSS JOIN public.subscription_plans p
WHERE p.code = 'starter'
ON CONFLICT (agency_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_agency_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_plan_id uuid;
  v_limit integer;
  v_count integer;
BEGIN
  v_agency_id := NEW.agency_id;
  IF v_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.plan_id INTO v_plan_id
  FROM public.agency_subscriptions s
  WHERE s.agency_id = v_agency_id
    AND s.status IN ('active', 'trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'PLAN_INACTIVE: the agency subscription is not active.';
  END IF;

  IF TG_TABLE_NAME = 'properties' THEN
    SELECT max_properties INTO v_limit FROM public.subscription_plans WHERE id = v_plan_id;
    SELECT count(*) INTO v_count FROM public.properties WHERE agency_id = v_agency_id;
    IF v_limit IS NOT NULL AND v_count >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED: property limit reached for this subscription.';
    END IF;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    SELECT max_leads INTO v_limit FROM public.subscription_plans WHERE id = v_plan_id;
    SELECT count(*) INTO v_count FROM public.leads WHERE agency_id = v_agency_id;
    IF v_limit IS NOT NULL AND v_count >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED: lead limit reached for this subscription.';
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    SELECT max_team_members INTO v_limit FROM public.subscription_plans WHERE id = v_plan_id;
    SELECT count(*) INTO v_count FROM public.profiles WHERE agency_id = v_agency_id AND status <> 'suspended';
    IF v_limit IS NOT NULL AND v_count >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED: team member limit reached for this subscription.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_property_plan_limit ON public.properties;
CREATE TRIGGER enforce_property_plan_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_plan_limit();
DROP TRIGGER IF EXISTS enforce_lead_plan_limit ON public.leads;
CREATE TRIGGER enforce_lead_plan_limit
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_plan_limit();
DROP TRIGGER IF EXISTS enforce_profile_plan_limit ON public.profiles;
CREATE TRIGGER enforce_profile_plan_limit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_plan_limit();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.agency_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.subscription_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT SELECT ON public.agency_subscriptions TO authenticated;
GRANT SELECT, INSERT ON public.subscription_change_requests TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
GRANT ALL ON public.agency_subscriptions TO service_role;
GRANT ALL ON public.subscription_change_requests TO service_role;

CREATE POLICY "authenticated users read active subscription plans" ON public.subscription_plans
  FOR SELECT TO authenticated USING (is_active = true OR public.is_super_admin());
CREATE POLICY "agency members read own subscription" ON public.agency_subscriptions
  FOR SELECT TO authenticated USING (agency_id = public.current_agency_id() OR public.is_super_admin());
CREATE POLICY "agency admins read own subscription requests" ON public.subscription_change_requests
  FOR SELECT TO authenticated USING (agency_id = public.current_agency_id() OR public.is_super_admin());
CREATE POLICY "agency admins request subscription changes" ON public.subscription_change_requests
  FOR INSERT TO authenticated WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_agency_admin(agency_id)
    AND created_by = auth.uid()
    AND status = 'open'
    AND resolved_by IS NULL
    AND resolved_at IS NULL
  );
CREATE POLICY "super admins manage subscription plans" ON public.subscription_plans
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super admins manage agency subscriptions" ON public.agency_subscriptions
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super admins manage subscription requests" ON public.subscription_change_requests
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP TRIGGER IF EXISTS set_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER set_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_agency_subscriptions_updated_at ON public.agency_subscriptions;
CREATE TRIGGER set_agency_subscriptions_updated_at
  BEFORE UPDATE ON public.agency_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 0006: Super Admin - Plans, Subscriptions, Usage, Audit Logs
-- ============================================================================

-- ---------- 1. Plans ----------
CREATE TYPE public.plan_interval AS ENUM ('monthly', 'yearly');

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_pkr numeric(16,2) NOT NULL DEFAULT 0,
  interval public.plan_interval NOT NULL DEFAULT 'monthly',
  trial_days int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  feature_value text,
  included boolean NOT NULL DEFAULT true,
  limit_value bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plan_features_plan_idx ON public.plan_features (plan_id);
GRANT SELECT ON public.plans TO authenticated, anon;
GRANT SELECT ON public.plan_features TO authenticated, anon;
GRANT ALL ON public.plans TO service_role;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read plans" ON public.plans FOR SELECT TO authenticated, anon USING (is_active = true);
CREATE POLICY "super admin manages plans" ON public.plans FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "public read plan_features" ON public.plan_features FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "super admin manages plan_features" ON public.plan_features FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------- 2. Subscriptions ----------
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  canceled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancel_reason text,
  payment_provider text,
  payment_provider_subscription_id text,
  payment_provider_customer_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id)
);

CREATE INDEX subscriptions_agency_idx ON public.subscriptions (agency_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions (status);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency admin reads own subscription" ON public.subscriptions FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id() AND public.is_agency_admin(agency_id));
CREATE POLICY "super admin reads all subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "super admin manages subscriptions" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------- 3. Usage ----------
CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  limit_value bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, metric_key, period_start)
);

CREATE INDEX usage_counters_agency_idx ON public.usage_counters (agency_id);
CREATE INDEX usage_counters_period_idx ON public.usage_counters (period_start, period_end);
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency admin reads own usage" ON public.usage_counters FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id() AND public.is_agency_admin(agency_id));
CREATE POLICY "super admin reads all usage" ON public.usage_counters FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "service role manages usage" ON public.usage_counters FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------- 4. Audit Logs ----------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role public.app_role,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id);
CREATE INDEX audit_logs_agency_idx ON public.audit_logs (agency_id);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_action_idx ON public.audit_logs (action);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin reads all audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "agency admin reads own agency audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id() AND public.is_agency_admin(agency_id));
CREATE POLICY "service role writes audit logs" ON public.audit_logs FOR INSERT TO service_role
  WITH CHECK (true);

-- ---------- 5. Seed Default Plans ----------
INSERT INTO public.plans (id, name, description, price_pkr, interval, trial_days, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Free', 'Basic features for small teams', 0, 'monthly', 0, 0),
  ('22222222-2222-2222-2222-222222222222', 'Professional', 'Full features for growing agencies', 50000, 'monthly', 14, 1),
  ('33333333-3333-3333-3333-333333333333', 'Enterprise', 'Unlimited scale with priority support', 150000, 'monthly', 30, 2);

INSERT INTO public.plan_features (plan_id, feature_key, feature_value, included, limit_value) VALUES
  -- Free plan
  ('11111111-1111-1111-1111-111111111111', 'properties', '5', true, 5),
  ('11111111-1111-1111-1111-111111111111', 'leads', '20', true, 20),
  ('11111111-1111-1111-1111-111111111111', 'team_members', '2', true, 2),
  ('11111111-1111-1111-1111-111111111111', 'whatsapp_messages', '100', true, 100),
  ('11111111-1111-1111-1111-111111111111', 'ai_requests', '50', true, 50),
  ('11111111-1111-1111-1111-111111111111', 'storage_gb', '1', true, 1),
  ('11111111-1111-1111-1111-111111111111', 'api_access', 'false', false, 0),
  ('11111111-1111-1111-1111-111111111111', 'priority_support', 'false', false, 0),
  -- Professional
  ('22222222-2222-2222-2222-222222222222', 'properties', 'unlimited', true, -1),
  ('22222222-2222-2222-2222-222222222222', 'leads', 'unlimited', true, -1),
  ('22222222-2222-2222-2222-222222222222', 'team_members', '10', true, 10),
  ('22222222-2222-2222-2222-222222222222', 'whatsapp_messages', '5000', true, 5000),
  ('22222222-2222-2222-2222-222222222222', 'ai_requests', '2000', true, 2000),
  ('22222222-2222-2222-2222-222222222222', 'storage_gb', '10', true, 10),
  ('22222222-2222-2222-2222-222222222222', 'api_access', 'true', true, 0),
  ('22222222-2222-2222-2222-222222222222', 'priority_support', 'true', true, 0),
  -- Enterprise
  ('33333333-3333-3333-3333-333333333333', 'properties', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'leads', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'team_members', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'whatsapp_messages', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'ai_requests', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'storage_gb', 'unlimited', true, -1),
  ('33333333-3333-3333-3333-333333333333', 'api_access', 'true', true, 0),
  ('33333333-3333-3333-3333-333333333333', 'priority_support', 'true', true, 0),
  ('33333333-3333-3333-3333-333333333333', 'dedicated_support', 'true', true, 0);

-- ---------- 6. updated_at triggers ----------
CREATE TRIGGER set_updated_at_plans BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_plan_features BEFORE UPDATE ON public.plan_features FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_subscriptions BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_usage_counters BEFORE UPDATE ON public.usage_counters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_audit_logs BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 7. Platform Bootstrap Cleanup (if needed) ----------
-- No changes needed for platform_bootstrap
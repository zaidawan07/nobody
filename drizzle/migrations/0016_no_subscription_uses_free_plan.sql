-- ============================================================================
-- 0016: no subscription row must behave as the Free plan, not as unlimited
--
-- Before this migration, plan_limit_for_agency() returned NULL when an agency
-- had no subscriptions row, and 0008 treats NULL as "unconstrained". That made
-- a freshly provisioned agency (provisionAgency creates no subscription) and
-- any agency whose subscription row was never written effectively unlimited.
--
-- After this migration:
--   * an agency WITH a subscription row -> unchanged (the subscribed plan's
--     plan_features value; a NULL limit_value still means "no limit");
--   * an agency with NO subscription row -> the Free plan's limits.
--
-- "The Free plan" is resolved deterministically as the active plan with
-- price_pkr = 0 and the lowest sort_order (tie-broken by created_at, then id).
-- That matches the seeded Free plan (price_pkr 0, sort_order 0). There is no
-- plans.code/slug column, so price + sort_order is the only available signal;
-- super admins should not add a second zero-priced plan.
--
-- Security: the can_inspect_agency() gate is unchanged and runs FIRST, so a
-- caller from another agency still gets NULL (see test T40). The function's
-- signature and return type are unchanged, so CREATE OR REPLACE keeps the
-- existing ACL from 0009 (authenticated + service_role; anon revoked).
--
-- OPERATIONAL RISK -- read before applying:
--   Agencies created before this migration have no subscription row. Once it is
--   applied they are Free-capped: properties 5, leads 20, team_members 2,
--   whatsapp_messages 100, ai_requests 50, storage_gb 1. Any existing agency
--   already above those numbers will start failing inserts that count against
--   the metric. Grandfather existing agencies (backfill a subscription to the
--   plan they should be on) BEFORE applying.
--
-- Out of scope (deliberate): a canceled/expired subscription still uses the
-- plan it was on. Only the "no row at all" case is changed here.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.plan_limit_for_agency(_agency_id uuid, _metric_key text)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit bigint;
  v_free_plan_id uuid;
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN NULL; END IF;

  -- 1) An agency WITH a subscription keeps the exact behaviour 0008 defined.
  IF EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.agency_id = _agency_id) THEN
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
  END IF;

  -- 2) No subscription row at all: behave as Free.
  SELECT p.id
    INTO v_free_plan_id
    FROM public.plans p
   WHERE p.is_active
     AND p.price_pkr = 0
   ORDER BY p.sort_order ASC, p.created_at ASC, p.id ASC
   LIMIT 1;

  -- No free-priced active plan exists (unexpected with the seed in place):
  -- keep the pre-0016 "unconstrained" behaviour rather than inventing a cap.
  IF v_free_plan_id IS NULL THEN RETURN NULL; END IF;

  RETURN (
    SELECT f.limit_value
      FROM public.plan_features f
     WHERE f.plan_id = v_free_plan_id
       AND f.feature_key = _metric_key
       AND f.included = true
     LIMIT 1
  );
END $$;

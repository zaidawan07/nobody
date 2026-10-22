-- Monthly usage metering for paid-cost features.
-- Outbound WhatsApp sends and AI calls are reserved by server code before the
-- provider request. Failed attempts count because they can still incur cost.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key IN ('whatsapp_messages', 'ai_requests')),
  event_key text NOT NULL,
  period_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_events_idempotency_unique UNIQUE (agency_id, metric_key, event_key)
);

CREATE INDEX IF NOT EXISTS usage_events_period_idx
  ON public.usage_events (agency_id, metric_key, period_start);

REVOKE ALL ON public.usage_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages usage events"
  ON public.usage_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- A billing period comes from the active subscription when it is defined;
-- agencies without one use the current UTC calendar month.
CREATE OR REPLACE FUNCTION public.agency_usage_period(_agency_id uuid)
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN; END IF;

  SELECT s.current_period_start, s.current_period_end
    INTO v_start, v_end
    FROM public.subscriptions s
   WHERE s.agency_id = _agency_id
     AND s.status IN ('trialing', 'active')
     AND (s.current_period_start IS NOT NULL OR s.current_period_end IS NOT NULL)
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start THEN
    v_start := date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC';
    v_end := ((v_start AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  END IF;

  RETURN QUERY SELECT v_start, v_end;
END $$;

REVOKE EXECUTE ON FUNCTION public.agency_usage_period(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_usage_period(uuid) TO service_role;

-- The same usage figures drive the subscription page and the server-side
-- reservation. Structural metrics keep their existing row-count behavior.
CREATE OR REPLACE FUNCTION public.count_agency_metric(_agency_id uuid, _metric_key text)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count bigint := 0;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN RETURN NULL; END IF;
  CASE _metric_key
    WHEN 'properties' THEN
      SELECT count(*) INTO v_count FROM public.properties WHERE agency_id = _agency_id;
    WHEN 'leads' THEN
      SELECT count(*) INTO v_count FROM public.leads WHERE agency_id = _agency_id;
    WHEN 'team_members' THEN
      SELECT count(*) INTO v_count FROM public.profiles WHERE agency_id = _agency_id;
    WHEN 'whatsapp_messages' THEN
      SELECT p.period_start, p.period_end INTO v_start, v_end
        FROM public.agency_usage_period(_agency_id) p;
      SELECT coalesce(sum(u.count), 0) INTO v_count
        FROM public.usage_counters u
       WHERE u.agency_id = _agency_id AND u.metric_key = _metric_key
         AND u.period_start = v_start AND u.period_end = v_end;
    WHEN 'ai_requests' THEN
      SELECT p.period_start, p.period_end INTO v_start, v_end
        FROM public.agency_usage_period(_agency_id) p;
      SELECT coalesce(sum(u.count), 0) INTO v_count
        FROM public.usage_counters u
       WHERE u.agency_id = _agency_id AND u.metric_key = _metric_key
         AND u.period_start = v_start AND u.period_end = v_end;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.count_agency_metric(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_agency_metric(uuid, text) TO authenticated, service_role;

-- Atomically reserves one or more metered actions. An advisory transaction
-- lock serializes reservations per agency/metric/period, while usage_events
-- makes retries idempotent. No partial metrics are charged if any requested
-- metric has reached its plan limit.
CREATE OR REPLACE FUNCTION public.reserve_agency_usage(
  _agency_id uuid,
  _metric_keys text[],
  _event_key text
) RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_metric text;
  v_count bigint;
  v_limit bigint;
  v_inserted integer;
BEGIN
  IF NOT public.can_inspect_agency(_agency_id) THEN
    RETURN QUERY SELECT false, 'Agency access denied.'::text;
    RETURN;
  END IF;
  IF coalesce(array_length(_metric_keys, 1), 0) = 0
     OR _event_key IS NULL OR length(trim(_event_key)) = 0 OR length(_event_key) > 200
     OR EXISTS (
       SELECT 1 FROM unnest(_metric_keys) requested(metric)
       WHERE requested.metric IS NULL
          OR requested.metric NOT IN ('whatsapp_messages', 'ai_requests')
     ) THEN
    RETURN QUERY SELECT false, 'Invalid usage reservation.'::text;
    RETURN;
  END IF;

  SELECT p.period_start, p.period_end INTO v_start, v_end
    FROM public.agency_usage_period(_agency_id) p;
  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN QUERY SELECT false, 'Could not determine the agency billing period.'::text;
    RETURN;
  END IF;

  FOR v_metric IN SELECT DISTINCT requested.metric
    FROM unnest(_metric_keys) requested(metric)
   ORDER BY requested.metric
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(_agency_id::text), hashtext(v_metric || v_start::text));
  END LOOP;

  -- Check every requested limit first so an AI reply cannot consume only one
  -- of its two quotas when the other is already full.
  FOR v_metric IN SELECT DISTINCT requested.metric
    FROM unnest(_metric_keys) requested(metric)
   ORDER BY requested.metric
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.usage_events e
       WHERE e.agency_id = _agency_id AND e.metric_key = v_metric AND e.event_key = _event_key
    ) THEN
      CONTINUE;
    END IF;

    SELECT coalesce(u.count, 0) INTO v_count
      FROM public.usage_counters u
     WHERE u.agency_id = _agency_id AND u.metric_key = v_metric
       AND u.period_start = v_start AND u.period_end = v_end;
    v_count := coalesce(v_count, 0);
    v_limit := public.plan_limit_for_agency(_agency_id, v_metric);
    IF v_limit IS NOT NULL AND v_limit >= 0 AND v_count >= v_limit THEN
      RETURN QUERY SELECT false, format('The agency has reached its %s plan limit.', v_metric);
      RETURN;
    END IF;
  END LOOP;

  FOR v_metric IN SELECT DISTINCT requested.metric
    FROM unnest(_metric_keys) requested(metric)
   ORDER BY requested.metric
  LOOP
    INSERT INTO public.usage_events (agency_id, metric_key, event_key, period_start)
    VALUES (_agency_id, v_metric, _event_key, v_start)
    ON CONFLICT (agency_id, metric_key, event_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 1 THEN
      v_limit := public.plan_limit_for_agency(_agency_id, v_metric);
      INSERT INTO public.usage_counters (
        agency_id, metric_key, period_start, period_end, count, limit_value, updated_at
      ) VALUES (_agency_id, v_metric, v_start, v_end, 1, v_limit, now())
      ON CONFLICT (agency_id, metric_key, period_start) DO UPDATE
        SET count = public.usage_counters.count + 1,
            period_end = excluded.period_end,
            limit_value = excluded.limit_value,
            updated_at = now();
    END IF;
  END LOOP;

  RETURN QUERY SELECT true, NULL::text;
END $$;

REVOKE EXECUTE ON FUNCTION public.reserve_agency_usage(uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agency_usage(uuid, text[], text) TO service_role;

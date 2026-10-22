\set ON_ERROR_STOP off
\pset pager off

\echo '--- T100: service role reserves one WhatsApp send and one AI request atomically ---'
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
DO $$
DECLARE
  v_allowed boolean;
  v_reason text;
  v_agency uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  SELECT allowed, reason INTO v_allowed, v_reason
    FROM public.reserve_agency_usage(v_agency, ARRAY['whatsapp_messages', 'ai_requests'], 't100-event');
  IF NOT v_allowed THEN RAISE EXCEPTION 'FAIL T100: reservation denied: %', v_reason; END IF;
  RAISE NOTICE 'PASS T100: both usage metrics reserved';
END $$;

\echo '--- T101: retrying the same idempotency key does not increment counters ---'
DO $$
DECLARE
  v_allowed boolean;
  v_count bigint;
BEGIN
  SELECT allowed INTO v_allowed
    FROM public.reserve_agency_usage(
      '10000000-0000-0000-0000-000000000001',
      ARRAY['whatsapp_messages', 'ai_requests'],
      't100-event'
    );
  SELECT count INTO v_count FROM public.usage_counters
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND metric_key = 'whatsapp_messages';
  IF NOT v_allowed OR v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL T101: repeat reservation returned %, usage count %', v_allowed, v_count;
  END IF;
  RAISE NOTICE 'PASS T101: duplicate event is idempotent';
END $$;

\echo '--- T102: a full AI quota denies the entire AI reply reservation ---'
DO $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_allowed boolean;
  v_count bigint;
BEGIN
  SELECT period_start, period_end INTO v_start, v_end
    FROM public.agency_usage_period('10000000-0000-0000-0000-000000000001');
  UPDATE public.usage_counters
     SET count = 50
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND metric_key = 'ai_requests' AND period_start = v_start;
  SELECT allowed INTO v_allowed
    FROM public.reserve_agency_usage(
      '10000000-0000-0000-0000-000000000001',
      ARRAY['whatsapp_messages', 'ai_requests'],
      't102-event'
    );
  SELECT count INTO v_count FROM public.usage_counters
   WHERE agency_id = '10000000-0000-0000-0000-000000000001'
     AND metric_key = 'whatsapp_messages' AND period_start = v_start;
  IF v_allowed OR v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL T102: denial was %, WhatsApp count is %', v_allowed, v_count;
  END IF;
  RAISE NOTICE 'PASS T102: AI limit denies the whole batch without charging a WhatsApp send';
END $$;
RESET ROLE;

\echo '--- T103: an authenticated caller cannot execute the service-only reservation (expect ERROR) ---'
SELECT test_login('00000000-0000-0000-0000-0000000000a1');
SELECT * FROM public.reserve_agency_usage(
  '10000000-0000-0000-0000-000000000001',
  ARRAY['whatsapp_messages'],
  't103-event'
);
SELECT test_logout();

\echo '--- T104: usage event rows are private and the reservation is service-only ---'
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.usage_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL T104: anon can read usage events';
  END IF;
  IF has_table_privilege('authenticated', 'public.usage_events', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL T104: authenticated can read usage events directly';
  END IF;
  IF has_table_privilege('service_role', 'public.usage_events', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T104: service_role cannot record usage events';
  END IF;
  IF has_function_privilege('authenticated',
      'public.reserve_agency_usage(uuid, text[], text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T104: authenticated can call the reservation function';
  END IF;
  IF has_function_privilege('service_role',
      'public.reserve_agency_usage(uuid, text[], text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T104: service_role cannot call the reservation function';
  END IF;
  RAISE NOTICE 'PASS T104: usage events and reservation stay server-only';
END $$;

\echo '=== USAGE METERING BATTERY DONE ==='

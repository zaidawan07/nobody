-- 0024 regression: the trigger-only status guard has a fixed search_path.
\set ON_ERROR_STOP off

\echo '--- T81: property status trigger search_path is pinned ---'
DO $$
DECLARE v_config text[];
BEGIN
  SELECT p.proconfig INTO v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'guard_property_status_transition'
     AND p.pronargs = 0;

  IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'FAIL T81: guard_property_status_transition search_path is not pinned: %', v_config;
  END IF;

  IF has_function_privilege('anon', 'public.guard_property_status_transition()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T81: anon can execute trigger-only guard';
  END IF;

  IF has_function_privilege('authenticated', 'public.guard_property_status_transition()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T81: authenticated can execute trigger-only guard';
  END IF;

  RAISE NOTICE 'PASS T81: fixed search_path and no client EXECUTE grants';
END $$;

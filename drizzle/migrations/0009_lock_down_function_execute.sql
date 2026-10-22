-- 0009: Stop anonymous callers from executing SECURITY DEFINER helpers over the
-- public API, and stop signed-in users from calling trigger-only/internal ones.
--
-- Kept for signed-in users (needed by RLS policies or called by the app):
--   is_super_admin, is_agency_admin, current_agency_id, can_access_assigned_record,
--   has_role, count_agency_metric, plan_limit_for_agency, agency_is_billing_active,
--   validate_tenant_link (called by invoker-rights validate_*_links triggers).
-- Revoked from signed-in users (trigger functions / internal helper only):
--   enforce_plan_limit, handle_new_user, protect_profile_privileged_columns,
--   can_inspect_agency. Trigger functions are not permission-checked at fire time,
--   and can_inspect_agency is only called from SECURITY DEFINER functions.

REVOKE EXECUTE ON FUNCTION public.agency_is_billing_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_assigned_record(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_inspect_agency(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_agency_metric(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_agency_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_agency_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plan_limit_for_agency(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_tenant_link(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;

-- Re-state the grants that must survive, explicitly.
GRANT EXECUTE ON FUNCTION public.agency_is_billing_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_assigned_record(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_inspect_agency(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_agency_metric(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_agency_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_plan_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_agency_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_limit_for_agency(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_privileged_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_tenant_link(uuid, uuid, uuid, uuid) TO authenticated, service_role;

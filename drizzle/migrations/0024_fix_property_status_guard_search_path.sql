-- 0024: pin the property-status trigger's search_path.
--
-- This trigger function does not need dynamic name resolution. Keeping a fixed
-- search_path prevents objects created in a caller-controlled schema from
-- shadowing names if the function is ever extended. The function is trigger-only;
-- its existing EXECUTE lockdown remains in force.
ALTER FUNCTION public.guard_property_status_transition()
  SET search_path = public;

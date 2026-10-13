-- ============================================================================
-- 0010: Property status transition guard
--
-- Availability was previously decided in at least six UI places with literals
-- like `status === "available"`, and the only write path (setPropertyStatus)
-- accepted any target status, so a sold or rented property could be flipped back
-- to a live listing by a stale client, an edit form, or the inline status picker.
-- The database is the only boundary that catches all of them, so the guarded
-- rule lives there.
--
-- Design: one deliberate, recorded path back -- reopen_property(). Everything
-- else that would return a sold/rented property to available/reserved is
-- refused by the trigger. Ordinary corrections (sold -> inactive, sold ->
-- unavailable, and so on) are deliberately NOT guarded, so an admin can still
-- fix a status that was set by mistake.
-- ============================================================================

CREATE TABLE public.property_reopen_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  reopened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  from_status public.property_status NOT NULL,
  to_status public.property_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_reopen_log_reason_not_blank CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX property_reopen_log_property_idx ON public.property_reopen_log (property_id, created_at DESC);
CREATE INDEX property_reopen_log_agency_idx ON public.property_reopen_log (agency_id, created_at DESC);

GRANT SELECT ON public.property_reopen_log TO authenticated;
GRANT ALL ON public.property_reopen_log TO service_role;
ALTER TABLE public.property_reopen_log ENABLE ROW LEVEL SECURITY;

-- The audit trail: acting admin, agency, reason, time and both statuses. An
-- agency admin reads their own agency's rows; a super admin reads all.
DROP POLICY IF EXISTS "agency admin reads reopen log" ON public.property_reopen_log;
CREATE POLICY "agency admin reads reopen log" ON public.property_reopen_log
  FOR SELECT TO authenticated
  USING (
    agency_id = public.current_agency_id()
    AND public.is_agency_admin(agency_id)
  );

DROP POLICY IF EXISTS "super admin reads all reopen logs" ON public.property_reopen_log;
CREATE POLICY "super admin reads all reopen logs" ON public.property_reopen_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Writes are service-role only: the row is written by reopen_property(),
-- which checks the caller's privileges itself before inserting.
DROP POLICY IF EXISTS "service role writes reopen log" ON public.property_reopen_log;
CREATE POLICY "service role writes reopen log" ON public.property_reopen_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- The guard. Deliberately narrow in what it refuses (the two guarded pairs
-- only) and open about everything else, so no legitimate correction is
-- blocked.
CREATE OR REPLACE FUNCTION public.guard_property_status_transition()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_allow boolean;
BEGIN
  IF OLD.status IN ('sold', 'rented') AND NEW.status IN ('available', 'reserved') THEN
    -- reopen_property() opens the gate, transaction-locally, and only after
    -- its own privilege check has passed.
    v_allow := coalesce(current_setting('property.allow_reopen', true), 'off') = 'on';
    IF NOT v_allow THEN
      RAISE EXCEPTION
        'A % property cannot go back to % by an ordinary status change. Use reopen_property() instead.',
        OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_property_status_transition ON public.properties;
CREATE TRIGGER guard_property_status_transition
  BEFORE UPDATE OF status ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_property_status_transition();

-- The deliberate path back.
--
-- SECURITY DEFINER so the log row can be written through the service-role
-- grant regardless of the caller's own table privileges. The privilege check
-- runs before the GUC is opened, so the guard can never be unlocked through a
-- plain status update.
CREATE OR REPLACE FUNCTION public.reopen_property(_property_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_property public.properties;
BEGIN
  IF coalesce(length(btrim(_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required to reopen a property.';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = _property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found.';
  END IF;

  IF v_property.status NOT IN ('sold', 'rented') THEN
    RAISE EXCEPTION 'Only a sold or rented property can be reopened.';
  END IF;

  -- An agency admin may reopen their own agency's property; a super admin may
  -- reopen any. Crossing an agency boundary is refused.
  IF NOT (
    v_property.agency_id = public.current_agency_id()
    AND public.is_agency_admin(v_property.agency_id)
  ) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'You do not have permission to reopen this property.';
  END IF;

  INSERT INTO public.property_reopen_log
    (property_id, agency_id, reopened_by, reason, from_status, to_status)
  VALUES
    (v_property.id, v_property.agency_id, auth.uid(), btrim(_reason), v_property.status, 'available');

  PERFORM set_config('property.allow_reopen', 'on', true);
  UPDATE public.properties SET status = 'available' WHERE id = v_property.id;
END $$;

GRANT EXECUTE ON FUNCTION public.reopen_property(uuid, text) TO authenticated;

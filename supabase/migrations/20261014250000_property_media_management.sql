-- Atomic, tenant-scoped photo ordering. The function never accepts an agency ID
-- from the client; it derives tenancy from the authenticated profile.
CREATE OR REPLACE FUNCTION public.reorder_property_media(_media_id uuid, _direction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid := public.current_agency_id();
  v_property_id uuid;
  v_sort_order integer;
  v_neighbor_id uuid;
  v_neighbor_sort_order integer;
BEGIN
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'An active agency membership is required';
  END IF;
  IF _direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Direction must be up or down';
  END IF;

  SELECT property_id, sort_order
    INTO v_property_id, v_sort_order
  FROM public.property_media
  WHERE id = _media_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photo not found in your agency';
  END IF;

  IF _direction = 'up' THEN
    SELECT id, sort_order INTO v_neighbor_id, v_neighbor_sort_order
    FROM public.property_media
    WHERE agency_id = v_agency_id
      AND property_id = v_property_id
      AND sort_order < v_sort_order
    ORDER BY sort_order DESC, id
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT id, sort_order INTO v_neighbor_id, v_neighbor_sort_order
    FROM public.property_media
    WHERE agency_id = v_agency_id
      AND property_id = v_property_id
      AND sort_order > v_sort_order
    ORDER BY sort_order ASC, id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_neighbor_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.property_media
  SET sort_order = v_neighbor_sort_order
  WHERE id = _media_id AND agency_id = v_agency_id;

  UPDATE public.property_media
  SET sort_order = v_sort_order
  WHERE id = v_neighbor_id AND agency_id = v_agency_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_property_media(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_property_media(uuid, text) TO authenticated;

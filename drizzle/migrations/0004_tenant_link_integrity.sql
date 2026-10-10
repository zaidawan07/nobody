-- ============================================================================
-- 0004: Cross-tenant link integrity. RLS decides WHO can see rows; it does
-- not stop a caller from writing a row in their own agency that REFERENCES
-- another agency's row (leads/properties/messages referencing someone else's
-- lead_id/property_id). The row itself stays readable only by the writer's
-- agency, but the silent cross-tenant foreign key is an integrity hole and
-- makes media policies (which subquery the referenced property)
-- inconsistent. These triggers reject any reference that doesn't belong to
-- the row's own agency.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_tenant_link(
  _agency_id uuid,
  _lead_id uuid DEFAULT NULL,
  _property_id uuid DEFAULT NULL,
  _conversation_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = _lead_id AND agency_id = _agency_id
  ) THEN
    RAISE EXCEPTION 'Referenced lead does not belong to this agency.' USING ERRCODE = '23514';
  END IF;

  IF _property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = _property_id AND agency_id = _agency_id
  ) THEN
    RAISE EXCEPTION 'Referenced property does not belong to this agency.' USING ERRCODE = '23514';
  END IF;

  IF _conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations WHERE id = _conversation_id AND agency_id = _agency_id
  ) THEN
    RAISE EXCEPTION 'Referenced conversation does not belong to this agency.' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_site_visit_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_tenant_link(NEW.agency_id, NEW.lead_id, NEW.property_id, NULL);
  RETURN NEW;
END; $$;

CREATE TRIGGER site_visits_validate_links
BEFORE INSERT OR UPDATE ON public.site_visits
FOR EACH ROW EXECUTE FUNCTION public.validate_site_visit_links();

CREATE OR REPLACE FUNCTION public.validate_conversation_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_tenant_link(NEW.agency_id, NEW.lead_id, NULL, NULL);
  RETURN NEW;
END; $$;

CREATE TRIGGER conversations_validate_links
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_links();

CREATE OR REPLACE FUNCTION public.validate_message_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_tenant_link(NEW.agency_id, NULL, NEW.referenced_property_id, NEW.conversation_id);
  RETURN NEW;
END; $$;

CREATE TRIGGER conversation_messages_validate_links
BEFORE INSERT OR UPDATE ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_links();

CREATE OR REPLACE FUNCTION public.validate_media_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_tenant_link(NEW.agency_id, NULL, NEW.property_id, NULL);
  RETURN NEW;
END; $$;

CREATE TRIGGER property_media_validate_links
BEFORE INSERT OR UPDATE ON public.property_media
FOR EACH ROW EXECUTE FUNCTION public.validate_media_links();

CREATE OR REPLACE FUNCTION public.validate_checkin_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_tenant_link(NEW.agency_id, NULL, NEW.property_id, NULL);
  RETURN NEW;
END; $$;

CREATE TRIGGER property_checkins_validate_links
BEFORE INSERT OR UPDATE ON public.property_checkins
FOR EACH ROW EXECUTE FUNCTION public.validate_checkin_links();

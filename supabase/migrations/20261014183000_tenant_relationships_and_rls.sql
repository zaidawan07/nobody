-- Enforce same-agency relationships and least-privilege tenant access.
-- Run against a disposable/staging database first. The preflight intentionally
-- aborts if existing rows reference records from another agency; repair those
-- rows explicitly rather than silently reassigning customer/property data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.property_media pm
    JOIN public.properties p ON p.id = pm.property_id
    WHERE pm.agency_id <> p.agency_id
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: property_media contains cross-agency property references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.properties p
    JOIN public.profiles pr ON pr.id = p.assigned_to
    WHERE p.assigned_to IS NOT NULL AND pr.agency_id IS DISTINCT FROM p.agency_id
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: properties contain cross-agency assignees';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles pr ON pr.id = l.assigned_to
    WHERE l.assigned_to IS NOT NULL AND pr.agency_id IS DISTINCT FROM l.agency_id
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: leads contain cross-agency assignees';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.site_visits v
    LEFT JOIN public.leads l ON l.id = v.lead_id
    LEFT JOIN public.properties p ON p.id = v.property_id
    LEFT JOIN public.profiles pr ON pr.id = v.assigned_to
    WHERE (v.lead_id IS NOT NULL AND (l.id IS NULL OR l.agency_id <> v.agency_id))
       OR (v.property_id IS NOT NULL AND (p.id IS NULL OR p.agency_id <> v.agency_id))
       OR (v.assigned_to IS NOT NULL AND (pr.id IS NULL OR pr.agency_id IS DISTINCT FROM v.agency_id))
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: site_visits contains cross-agency references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.leads l ON l.id = c.lead_id
    WHERE c.lead_id IS NOT NULL AND l.agency_id <> c.agency_id
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: conversations contain cross-agency lead references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversation_messages m
    LEFT JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.properties p ON p.id = m.referenced_property_id
    WHERE c.id IS NULL OR c.agency_id <> m.agency_id
       OR (m.referenced_property_id IS NOT NULL AND (p.id IS NULL OR p.agency_id <> m.agency_id))
  ) THEN
    RAISE EXCEPTION 'Tenant security migration blocked: conversation_messages contains cross-agency references';
  END IF;
END $$;

-- Composite unique indexes provide valid targets for same-tenant foreign keys.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_agency_id_id_uidx
  ON public.profiles (agency_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS properties_agency_id_id_uidx
  ON public.properties (agency_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_agency_id_id_uidx
  ON public.leads (agency_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_agency_id_id_uidx
  ON public.conversations (agency_id, id);

-- New writes/updates can no longer link tenant-owned records across agencies.
ALTER TABLE public.property_media
  ADD CONSTRAINT property_media_same_agency_property_fk
  FOREIGN KEY (agency_id, property_id)
  REFERENCES public.properties (agency_id, id);

ALTER TABLE public.properties
  ADD CONSTRAINT properties_same_agency_assignee_fk
  FOREIGN KEY (agency_id, assigned_to)
  REFERENCES public.profiles (agency_id, id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_same_agency_assignee_fk
  FOREIGN KEY (agency_id, assigned_to)
  REFERENCES public.profiles (agency_id, id);

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_same_agency_lead_fk
  FOREIGN KEY (agency_id, lead_id)
  REFERENCES public.leads (agency_id, id);

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_same_agency_property_fk
  FOREIGN KEY (agency_id, property_id)
  REFERENCES public.properties (agency_id, id);

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_same_agency_assignee_fk
  FOREIGN KEY (agency_id, assigned_to)
  REFERENCES public.profiles (agency_id, id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_same_agency_lead_fk
  FOREIGN KEY (agency_id, lead_id)
  REFERENCES public.leads (agency_id, id);

ALTER TABLE public.conversation_messages
  ADD CONSTRAINT conversation_messages_same_agency_conversation_fk
  FOREIGN KEY (agency_id, conversation_id)
  REFERENCES public.conversations (agency_id, id);

ALTER TABLE public.conversation_messages
  ADD CONSTRAINT conversation_messages_same_agency_property_fk
  FOREIGN KEY (agency_id, referenced_property_id)
  REFERENCES public.properties (agency_id, id);

-- Replace broad FOR ALL tenant policies with explicit capabilities.
-- Super-admin policies remain in place and are independently constrained by
-- the is_super_admin() helper; the following policies govern agency members.
DROP POLICY IF EXISTS "tenant members access properties" ON public.properties;
CREATE POLICY "agency members read properties" ON public.properties
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());
CREATE POLICY "agency members create properties" ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency members update properties" ON public.properties
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency admins delete properties" ON public.properties
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

DROP POLICY IF EXISTS "tenant members access property_media" ON public.property_media;
CREATE POLICY "agency members read property media" ON public.property_media
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());
CREATE POLICY "agency members create property media" ON public.property_media
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency members update property media" ON public.property_media
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency admins delete property media" ON public.property_media
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

DROP POLICY IF EXISTS "tenant members access leads" ON public.leads;
CREATE POLICY "agency members read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());
CREATE POLICY "agency members create leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency members update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency admins delete leads" ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

DROP POLICY IF EXISTS "tenant members access site_visits" ON public.site_visits;
CREATE POLICY "agency members read site visits" ON public.site_visits
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());
CREATE POLICY "agency members create site visits" ON public.site_visits
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency members update site visits" ON public.site_visits
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY "agency admins delete site visits" ON public.site_visits
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

DROP POLICY IF EXISTS "tenant members access conversations" ON public.conversations;
CREATE POLICY "agency members read conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());
CREATE POLICY "agency members update conversation handoff" ON public.conversations
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());

DROP POLICY IF EXISTS "tenant members access conversation_messages" ON public.conversation_messages;
CREATE POLICY "agency members read conversation messages" ON public.conversation_messages
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());

-- RLS controls rows; column privileges constrain what a browser may change.
-- Customer opt-out, message-window timestamps, provider status, and message
-- bodies remain writable only by trusted server code using service_role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.conversation_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conversation_messages TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
GRANT UPDATE (state, handoff_requested) ON TABLE public.conversations TO authenticated;

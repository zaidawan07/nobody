-- ============================================================================
-- 0003: Close the remaining employee-scoping gaps. Before this migration,
-- conversations, conversation_messages, property_media, and whatsapp_configs
-- still used the agency-wide policies from 0000, so an employee could read
-- (and write) every row in the agency -- including chats and media assigned
-- to another employee. These tables now follow the same rule as
-- properties/leads/site_visits: admins see the whole agency, employees only
-- what's assigned to them.
-- ============================================================================

-- ---------- conversations ----------
DROP POLICY IF EXISTS "tenant members access conversations" ON public.conversations;
DROP POLICY IF EXISTS "super admin access conversations" ON public.conversations;

CREATE POLICY "assigned read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (public.can_access_assigned_record(agency_id, assigned_to));
CREATE POLICY "assigned insert conversations" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));
CREATE POLICY "assigned update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (public.can_access_assigned_record(agency_id, assigned_to))
  WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));
CREATE POLICY "admin delete conversations" ON public.conversations FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id));

-- ---------- conversation_messages ----------
-- Messages carry agency_id denormalized but not assigned_to, so scope them
-- through their parent conversation (same pattern the property-media
-- storage policy in 0002 uses through properties).
DROP POLICY IF EXISTS "tenant members access conversation_messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "super admin access conversation_messages" ON public.conversation_messages;

CREATE POLICY "assigned read conversation_messages" ON public.conversation_messages FOR SELECT TO authenticated
  USING (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.conversations WHERE id = conversation_id)
    )
  );
CREATE POLICY "assigned insert conversation_messages" ON public.conversation_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.conversations WHERE id = conversation_id)
    )
  );
CREATE POLICY "assigned update conversation_messages" ON public.conversation_messages FOR UPDATE TO authenticated
  USING (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.conversations WHERE id = conversation_id)
    )
  )
  WITH CHECK (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.conversations WHERE id = conversation_id)
    )
  );
CREATE POLICY "admin delete conversation_messages" ON public.conversation_messages FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id));

-- ---------- property_media ----------
DROP POLICY IF EXISTS "tenant members access property_media" ON public.property_media;
DROP POLICY IF EXISTS "super admin access property_media" ON public.property_media;

CREATE POLICY "assigned read property_media" ON public.property_media FOR SELECT TO authenticated
  USING (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.properties WHERE id = property_id)
    )
  );
CREATE POLICY "assigned insert property_media" ON public.property_media FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.properties WHERE id = property_id)
    )
  );
CREATE POLICY "assigned update property_media" ON public.property_media FOR UPDATE TO authenticated
  USING (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.properties WHERE id = property_id)
    )
  )
  WITH CHECK (
    public.can_access_assigned_record(
      agency_id,
      (SELECT assigned_to FROM public.properties WHERE id = property_id)
    )
  );
CREATE POLICY "admin delete property_media" ON public.property_media FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id));

-- ---------- whatsapp_configs ----------
-- Agency-wide settings contain the agency's WhatsApp number and AI prompts;
-- employees have no business editing or even reading them. Admins and the
-- platform owner only.
DROP POLICY IF EXISTS "tenant members access whatsapp_configs" ON public.whatsapp_configs;
DROP POLICY IF EXISTS "super admin access whatsapp_configs" ON public.whatsapp_configs;

CREATE POLICY "admin read whatsapp_configs" ON public.whatsapp_configs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id));
CREATE POLICY "admin insert whatsapp_configs" ON public.whatsapp_configs FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.is_agency_admin(agency_id));
CREATE POLICY "admin update whatsapp_configs" ON public.whatsapp_configs FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id))
  WITH CHECK (public.is_super_admin() OR public.is_agency_admin(agency_id));
CREATE POLICY "admin delete whatsapp_configs" ON public.whatsapp_configs FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.is_agency_admin(agency_id));

-- ============================================================================
-- 0012: Super admin gets no access to private conversations
--
-- The product rule is that a super admin manages the platform -- agencies,
-- plans, subscriptions, usage -- but does not automatically get access to
-- private agency/customer conversations. Today that rule is broken twice over:
--
--   * can_access_assigned_record() begins with `is_super_admin() OR ...` and is
--     the USING/CHECK expression of every 'assigned' policy on both
--     conversations and conversation_messages, so a super admin reads, inserts,
--     updates and deletes them;
--   * 'admin delete' uses `is_super_admin() OR is_agency_admin(agency_id)`.
--
-- Fix: the shared helper keeps its super-admin branch, because properties,
-- leads, site_visits and the media/checkin links legitimately let a platform
-- owner correct a misassigned record. These two tables get their own helper
-- with no super-admin branch at all, and their policies are re-expressed
-- against it. The shared helper is what still gives a super admin the
-- administrative access they are supposed to have everywhere else.
--
-- The helper takes the conversation row's own assigned_to, so a conversation
-- assigned to nobody is visible to the agency's admins (the existing
-- 'unassigned conversation' case), and one assigned to an employee is visible
-- to that employee plus the agency's admins.
-- ============================================================================

-- ---------- 1. tenant-scoped access check for conversations ----------
-- Same shape as can_access_assigned_record (agency + assignee pair, SECURITY
-- DEFINER so it can read the sibling conversation row without needing a grant
-- on it), but with no is_super_admin() term anywhere.
CREATE OR REPLACE FUNCTION public.can_access_assigned_conversation(_agency_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_assigned_to uuid;
BEGIN
  IF _agency_id IS NULL OR _conversation_id IS NULL THEN RETURN false; END IF;

  SELECT c.assigned_to INTO v_assigned_to
    FROM public.conversations c
   WHERE c.id = _conversation_id;

  -- Not this agency's conversation at all.
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
                 WHERE c.id = _conversation_id AND c.agency_id = _agency_id) THEN
    RETURN false;
  END IF;

  -- Assigned to nobody: the agency's admins own it.
  IF v_assigned_to IS NULL THEN
    RETURN public.is_agency_admin(_agency_id);
  END IF;

  -- Assigned to an employee: that employee, plus the agency's admins.
  RETURN (_agency_id = public.current_agency_id()
          AND (v_assigned_to = auth.uid()
               OR public.is_agency_admin(_agency_id)));
END $$;

-- Signed-in users may call it; anon may not. service_role needs it for the
-- trigger-side checks, matching how 0009 treats the sibling helpers.
REVOKE EXECUTE ON FUNCTION public.can_access_assigned_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_assigned_conversation(uuid, uuid) TO authenticated, service_role;

-- ---------- 2. re-express every conversation policy ----------
DROP POLICY IF EXISTS "assigned read conversations" ON public.conversations;
CREATE POLICY "assigned read conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.can_access_assigned_conversation(agency_id, id));

DROP POLICY IF EXISTS "assigned insert conversations" ON public.conversations;
CREATE POLICY "assigned insert conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_conversation(agency_id, id));

DROP POLICY IF EXISTS "assigned update conversations" ON public.conversations;
CREATE POLICY "assigned update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.can_access_assigned_conversation(agency_id, id))
  WITH CHECK (public.can_access_assigned_conversation(agency_id, id));

-- 'admin delete' lost its is_super_admin() term too: deleting a customer's
-- conversation history is an agency decision, not a platform one.
DROP POLICY IF EXISTS "admin delete conversations" ON public.conversations;
CREATE POLICY "admin delete conversations" ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

-- ---------- 3. re-express every conversation_messages policy ----------
DROP POLICY IF EXISTS "assigned read conversation_messages" ON public.conversation_messages;
CREATE POLICY "assigned read conversation_messages" ON public.conversation_messages
  FOR SELECT TO authenticated
  USING (public.can_access_assigned_conversation(agency_id, conversation_id));

DROP POLICY IF EXISTS "assigned insert conversation_messages" ON public.conversation_messages;
CREATE POLICY "assigned insert conversation_messages" ON public.conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_conversation(agency_id, conversation_id));

DROP POLICY IF EXISTS "assigned update conversation_messages" ON public.conversation_messages;
CREATE POLICY "assigned update conversation_messages" ON public.conversation_messages
  FOR UPDATE TO authenticated
  USING (public.can_access_assigned_conversation(agency_id, conversation_id))
  WITH CHECK (public.can_access_assigned_conversation(agency_id, conversation_id));

DROP POLICY IF EXISTS "admin delete conversation_messages" ON public.conversation_messages;
CREATE POLICY "admin delete conversation_messages" ON public.conversation_messages
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

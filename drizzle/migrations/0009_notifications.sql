-- ============================================================================
-- 0009: In-app notifications
--
-- The app had no notification mechanism at all: no table, no route, no
-- component, no unread count. This adds one.
--
-- Design constraints:
--   * a user must never read or modify another user's notifications, so every
--     policy keys off user_id = auth.uid() and the anon role gets nothing
--   * writes are service-role only. Client code inserts through server
--     functions that own the actor identity, never from the browser with a
--     caller-supplied user_id
--   * an agency admin may read agency notifications for auditing, but cannot
--     mark them read -- marking is strictly the owner's action
-- ============================================================================

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_not_blank CHECK (length(btrim(type)) > 0),
  CONSTRAINT notifications_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;

GRANT SELECT ON public.notifications TO authenticated;
GRANT INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read: strictly the owner.
DROP POLICY IF EXISTS "user reads own notifications" ON public.notifications;
CREATE POLICY "user reads own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Read: agency admin auditing their agency's notifications. Read-only: there
-- is deliberately no UPDATE policy for them, so they cannot mark another
-- user's notifications read.
DROP POLICY IF EXISTS "agency admin reads agency notifications" ON public.notifications;
CREATE POLICY "agency admin reads agency notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    agency_id = public.current_agency_id()
    AND public.is_agency_admin(agency_id)
  );

-- Mark read: strictly the owner. WITH CHECK stops a user from handing the row
-- to someone else while they are touching it.
DROP POLICY IF EXISTS "user marks own notifications read" ON public.notifications;
CREATE POLICY "user marks own notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Writes: service role only. Server functions create notifications with a
-- trusted actor, never from a caller-supplied user_id.
DROP POLICY IF EXISTS "service role inserts notifications" ON public.notifications;
CREATE POLICY "service role inserts notifications" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Agency-owned follow-up tasks for CRM workflows.
-- Tenant relationships are enforced in the database, not only in the UI.

CREATE TABLE IF NOT EXISTS public.agency_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  assigned_to uuid,
  lead_id uuid,
  property_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_tasks_assignee_same_agency_fk
    FOREIGN KEY (agency_id, assigned_to) REFERENCES public.profiles (agency_id, id),
  CONSTRAINT agency_tasks_lead_same_agency_fk
    FOREIGN KEY (agency_id, lead_id) REFERENCES public.leads (agency_id, id),
  CONSTRAINT agency_tasks_property_same_agency_fk
    FOREIGN KEY (agency_id, property_id) REFERENCES public.properties (agency_id, id),
  CONSTRAINT agency_tasks_creator_same_agency_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES public.profiles (agency_id, id)
);

CREATE INDEX IF NOT EXISTS agency_tasks_agency_status_due_idx
  ON public.agency_tasks (agency_id, status, due_at);
CREATE INDEX IF NOT EXISTS agency_tasks_assignee_status_idx
  ON public.agency_tasks (assigned_to, status, due_at);

DROP TRIGGER IF EXISTS set_agency_tasks_updated_at ON public.agency_tasks;
CREATE TRIGGER set_agency_tasks_updated_at
  BEFORE UPDATE ON public.agency_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agency_tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_tasks TO authenticated;
GRANT ALL ON public.agency_tasks TO service_role;

CREATE POLICY "agency members read tasks" ON public.agency_tasks
  FOR SELECT TO authenticated
  USING (agency_id = public.current_agency_id());

CREATE POLICY "agency members create tasks" ON public.agency_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id = public.current_agency_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "agency members update tasks" ON public.agency_tasks
  FOR UPDATE TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id());

CREATE POLICY "agency admins delete tasks" ON public.agency_tasks
  FOR DELETE TO authenticated
  USING (public.is_agency_admin(agency_id));

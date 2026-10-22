-- ============================================================================
-- 0002: Property-level contacts (owner/tenant/realtor), a check-in funnel
-- for periodic review/condition follow-ups, and real Storage for photos and
-- videos (property_media.storage_path has existed since 0000 but had no
-- bucket behind it).
-- ============================================================================

-- ============ PART 1: contacts on properties
ALTER TABLE public.properties
  ADD COLUMN owner_name text,
  ADD COLUMN owner_phone text,
  ADD COLUMN tenant_name text,
  ADD COLUMN tenant_phone text,
  ADD COLUMN realtor_name text,
  ADD COLUMN realtor_phone text;

-- ============ PART 2: the check-in funnel
CREATE TYPE public.checkin_contact_type AS ENUM ('owner', 'tenant', 'realtor');
CREATE TYPE public.checkin_channel AS ENUM ('whatsapp', 'sms');
CREATE TYPE public.checkin_status AS ENUM ('scheduled', 'sent', 'responded', 'failed', 'skipped');

CREATE TABLE public.property_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalized from properties at creation time (agency_id, assigned_to),
  -- same pattern conversation_messages already uses -- it lets RLS reuse
  -- can_access_assigned_record() directly with no join to properties.
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_type public.checkin_contact_type NOT NULL,
  contact_name text,
  contact_phone text NOT NULL,
  channel public.checkin_channel NOT NULL DEFAULT 'whatsapp',
  scheduled_for timestamptz NOT NULL,
  status public.checkin_status NOT NULL DEFAULT 'scheduled',
  sent_at timestamptz,
  response_text text,
  property_condition text,
  is_vacant boolean,
  provider_error text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_checkins_due_idx ON public.property_checkins (status, scheduled_for);
CREATE INDEX property_checkins_property_idx ON public.property_checkins (property_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.property_checkins TO authenticated;
GRANT ALL ON public.property_checkins TO service_role;
ALTER TABLE public.property_checkins ENABLE ROW LEVEL SECURITY;

-- Same assigned-scoping rule as properties/leads/site_visits: admins see the
-- whole agency, an employee only what's assigned to them. Deleting a
-- check-in record isn't exposed to anyone from the client for now.
CREATE POLICY "assigned read property_checkins" ON public.property_checkins FOR SELECT TO authenticated
  USING (public.can_access_assigned_record(agency_id, assigned_to));
CREATE POLICY "assigned insert property_checkins" ON public.property_checkins FOR INSERT TO authenticated
  WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));
CREATE POLICY "assigned update property_checkins" ON public.property_checkins FOR UPDATE TO authenticated
  USING (public.can_access_assigned_record(agency_id, assigned_to))
  WITH CHECK (public.can_access_assigned_record(agency_id, assigned_to));

-- ============ PART 3: real Storage for property photos/videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-media', 'property-media', false)
ON CONFLICT (id) DO NOTHING;

-- Object paths are written by the app as "<agency_id>/<property_id>/<file>",
-- so the first path segment is the tenant boundary -- same rule as every
-- other tenant table, just read out of the path instead of a column.
CREATE POLICY "assigned read property-media objects" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-media'
    AND public.can_access_assigned_record(
      (storage.foldername(name))[1]::uuid,
      (SELECT assigned_to FROM public.properties WHERE id = (storage.foldername(name))[2]::uuid)
    )
  );
CREATE POLICY "assigned upload property-media objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-media'
    AND public.can_access_assigned_record(
      (storage.foldername(name))[1]::uuid,
      (SELECT assigned_to FROM public.properties WHERE id = (storage.foldername(name))[2]::uuid)
    )
  );
CREATE POLICY "assigned delete property-media objects" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-media'
    AND (
      public.is_super_admin()
      OR public.is_agency_admin((storage.foldername(name))[1]::uuid)
    )
  );

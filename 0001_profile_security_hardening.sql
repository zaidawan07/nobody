-- Security hardening for the multi-tenant real-estate foundation.
-- Apply only after reviewing the target database and confirming migration history.
-- This file is additive; do not rewrite the original foundation migration.
--
-- Fail explicitly instead of silently choosing an owner if duplicate platform
-- owners already exist. Resolve duplicates through an approved process first.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.user_roles
    WHERE role = 'super_admin'
  ) > 1 THEN
    RAISE EXCEPTION
      'Cannot enforce single super admin: multiple super_admin role assignments already exist. Resolve them before applying this migration.';
  END IF;
END
$$;

-- Suspended accounts and agencies must stop matching tenant RLS policies.
-- SECURITY DEFINER lets the helper inspect the profile/agency state without
-- depending on the caller's row visibility.
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.agency_id
  FROM public.profiles p
  JOIN public.agencies a ON a.id = p.agency_id
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND a.status = 'active';
$$;

-- Agency administrators may edit descriptive fields, but cannot reactivate
-- a suspended agency by directly changing its status through PostgREST.
-- Trusted server-side platform-owner functions use the service-role client.
REVOKE UPDATE ON TABLE public.agencies FROM PUBLIC, authenticated;
GRANT UPDATE (
  name, slug, logo_url, phone, whatsapp_number, email, office_address,
  cities_served, description, working_hours
) ON TABLE public.agencies TO authenticated;

-- Authenticated clients can edit only safe self-profile fields. Row policies
-- continue to decide which profile can be updated.
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, authenticated;
GRANT UPDATE (full_name, phone, job_title)
  ON TABLE public.profiles TO authenticated;

-- Database-level invariant for the first-owner bootstrap race.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_super_admin_idx
  ON public.user_roles (role)
  WHERE role = 'super_admin';

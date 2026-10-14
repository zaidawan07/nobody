-- Security hardening for the multi-tenant real-estate foundation.
-- Apply only after reviewing the target database and confirming the migration runner.
-- This file is intentionally additive; do not rewrite the original foundation migration.
--
-- Preflight: fail explicitly rather than silently choosing a winner if more than one
-- platform owner already exists. Resolve duplicate role assignments through an
-- approved operational process before applying this migration.
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

-- Column-level grants stop authenticated users from changing tenant membership,
-- account status, IDs, or timestamps through direct PostgREST updates. The row
-- policies still decide WHICH profile can be updated; these grants decide WHICH
-- fields authenticated clients may change.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, job_title)
  ON TABLE public.profiles TO authenticated;

-- Enforce the bootstrap invariant in the database, where it is safe under
-- concurrent requests. Only one row can have role = 'super_admin'.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_super_admin_idx
  ON public.user_roles (role)
  WHERE role = 'super_admin';

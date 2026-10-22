-- Atomic invitation revocation.
-- The invitation status transition and removal of the pre-provisioned role must
-- commit together. Otherwise a failed role cleanup could leave an active role
-- behind a revoked invitation, or a failed status update could strand a pending
-- invite without its role.
CREATE OR REPLACE FUNCTION public.revoke_agency_invitation(
  _invitation_id uuid,
  _agency_id uuid,
  _revoked_by uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_role public.invited_role;
BEGIN
  SELECT i.email, i.role
    INTO v_email, v_role
    FROM public.agency_invitations i
   WHERE i.id = _invitation_id
     AND i.agency_id = _agency_id
     AND i.status = 'pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.agency_invitations
     SET status = 'revoked',
         revoked_by = _revoked_by
   WHERE id = _invitation_id
     AND agency_id = _agency_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_roles ur
   USING public.profiles p
   WHERE ur.user_id = p.id
     AND p.agency_id = _agency_id
     AND lower(p.email) = lower(v_email)
     AND ur.agency_id = _agency_id
     AND ur.role::text = v_role::text;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_agency_invitation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_agency_invitation(uuid, uuid, uuid)
  TO service_role;

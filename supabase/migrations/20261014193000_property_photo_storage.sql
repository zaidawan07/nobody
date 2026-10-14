-- Private property-photo storage with agency-scoped object paths.
-- Expected object key format: <agency UUID>/<property UUID>/<safe filename>.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-media',
  'property-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "agency members read property photos" ON storage.objects;
CREATE POLICY "agency members read property photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-media'
    AND (
      split_part(name, '/', 1) = public.current_agency_id()::text
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "agency members upload property photos" ON storage.objects;
CREATE POLICY "agency members upload property photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-media'
    AND split_part(name, '/', 1) = public.current_agency_id()::text
  );

DROP POLICY IF EXISTS "agency members update property photos" ON storage.objects;
CREATE POLICY "agency members update property photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-media'
    AND split_part(name, '/', 1) = public.current_agency_id()::text
  )
  WITH CHECK (
    bucket_id = 'property-media'
    AND split_part(name, '/', 1) = public.current_agency_id()::text
  );

DROP POLICY IF EXISTS "agency admins delete property photos" ON storage.objects;
CREATE POLICY "agency admins delete property photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-media'
    AND split_part(name, '/', 1) = public.current_agency_id()::text
    AND public.is_agency_admin(public.current_agency_id())
  );

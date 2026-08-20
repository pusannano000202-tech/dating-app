BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'photos';

DROP POLICY IF EXISTS public_read ON storage.objects;

COMMENT ON TABLE public.photos IS
  'Profile photo metadata. Photo objects are private and delivered through short-lived signed URLs.';

COMMIT;

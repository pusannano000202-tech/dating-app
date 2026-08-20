-- Profile photos are stored in a public bucket because the current scoring
-- service consumes public URLs. Writes remain restricted to each user's folder.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'photos',
  'photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS profile_photos_select_own ON storage.objects;
CREATE POLICY profile_photos_select_own
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS profile_photos_insert_own ON storage.objects;
CREATE POLICY profile_photos_insert_own
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS profile_photos_update_own ON storage.objects;
CREATE POLICY profile_photos_update_own
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS profile_photos_delete_own ON storage.objects;
CREATE POLICY profile_photos_delete_own
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

BEGIN;

-- The web and mobile clients now upload through /api/profile/photos, where the
-- server validates MIME signatures, decodes the image, strips metadata and
-- writes with the service role. Authenticated clients retain read access only.
DROP POLICY IF EXISTS "owner_rw" ON public.photos;
DROP POLICY IF EXISTS photos_select_own ON public.photos;

CREATE POLICY photos_select_own
  ON public.photos
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.photos FROM authenticated;
GRANT SELECT ON TABLE public.photos TO authenticated;
REVOKE ALL ON TABLE public.photos FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.photos TO service_role;

WITH ranked_photo_slots AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, sort_order
      ORDER BY uploaded_at DESC NULLS LAST, id DESC
    ) AS slot_rank
  FROM public.photos
)
DELETE FROM public.photos AS photo
USING ranked_photo_slots AS ranked
WHERE photo.id = ranked.id
  AND ranked.slot_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS photos_user_sort_order_unique
  ON public.photos (user_id, sort_order);

DROP POLICY IF EXISTS profile_photos_insert_own ON storage.objects;
DROP POLICY IF EXISTS profile_photos_update_own ON storage.objects;
DROP POLICY IF EXISTS profile_photos_delete_own ON storage.objects;

-- The current server path creates new object names, signs reads, and removes
-- objects. It does not upsert or mutate existing object metadata.
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT SELECT ON TABLE storage.buckets TO service_role;
REVOKE UPDATE ON TABLE storage.objects FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE storage.objects TO service_role;

COMMENT ON TABLE public.photos IS
  'Private profile photo metadata. Client reads are owner-scoped; all writes pass through the validated application server endpoint.';

COMMIT;

BEGIN;

-- Photo changes must invalidate the previous analysis inside the database.
-- The browser invalidation endpoint remains a redundant defence, but this
-- trigger closes the gap if that request is interrupted after storage writes.
CREATE OR REPLACE FUNCTION public.invalidate_private_appearance_score_on_photo_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  INSERT INTO public.private_appearance_scores (
    user_id,
    photo_revision,
    analyzed_photo_revision,
    status,
    lease_expires_at,
    request_id,
    attempt_count,
    provider,
    model_version,
    prompt_version,
    anchor_version,
    score_raw,
    score_normalized,
    confidence_0_1,
    appearance_type,
    error_code,
    analyzed_at,
    updated_at
  )
  VALUES (
    v_user_id,
    pg_catalog.gen_random_uuid(),
    NULL,
    'stale',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id) DO UPDATE
  SET photo_revision = pg_catalog.gen_random_uuid(),
      analyzed_photo_revision = NULL,
      status = 'stale',
      lease_expires_at = NULL,
      request_id = NULL,
      attempt_count = 0,
      provider = NULL,
      model_version = NULL,
      prompt_version = NULL,
      anchor_version = NULL,
      score_raw = NULL,
      score_normalized = NULL,
      confidence_0_1 = NULL,
      appearance_type = NULL,
      error_code = NULL,
      analyzed_at = NULL,
      updated_at = CURRENT_TIMESTAMP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invalidate_private_appearance_score_after_photo_change
  ON public.photos;
CREATE TRIGGER invalidate_private_appearance_score_after_photo_change
AFTER INSERT OR DELETE OR UPDATE OF storage_path, sort_order
ON public.photos
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_private_appearance_score_on_photo_change();

REVOKE ALL ON FUNCTION public.invalidate_private_appearance_score_on_photo_change()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.invalidate_private_appearance_score_on_photo_change() IS
  'Invalidates private appearance analysis whenever a user photo row changes.';

-- Legacy clients may overwrite a fixed object path without changing the
-- public.photos row. Invalidate from the storage object itself so a previous
-- analysis can never survive changed bytes.
CREATE OR REPLACE FUNCTION public.invalidate_private_appearance_score_on_storage_object_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_folders TEXT[] := ARRAY[]::TEXT[];
  v_owner_folder TEXT;
  v_user_id UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.bucket_id = 'photos' THEN
    v_owner_folders := pg_catalog.array_append(
      v_owner_folders,
      (storage.foldername(OLD.name))[1]
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.bucket_id = 'photos' THEN
    v_owner_folders := pg_catalog.array_append(
      v_owner_folders,
      (storage.foldername(NEW.name))[1]
    );
  END IF;

  FOR v_owner_folder IN
    SELECT DISTINCT owner_folder
    FROM pg_catalog.unnest(v_owner_folders) AS folder(owner_folder)
    WHERE owner_folder IS NOT NULL
  LOOP
    BEGIN
      v_user_id := v_owner_folder::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;

    INSERT INTO public.private_appearance_scores (
      user_id,
      photo_revision,
      analyzed_photo_revision,
      status,
      lease_expires_at,
      request_id,
      attempt_count,
      provider,
      model_version,
      prompt_version,
      anchor_version,
      score_raw,
      score_normalized,
      confidence_0_1,
      appearance_type,
      error_code,
      analyzed_at,
      updated_at
    )
    VALUES (
      v_user_id,
      pg_catalog.gen_random_uuid(),
      NULL,
      'stale',
      NULL,
      NULL,
      0,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id) DO UPDATE
    SET photo_revision = pg_catalog.gen_random_uuid(),
        analyzed_photo_revision = NULL,
        status = 'stale',
        lease_expires_at = NULL,
        request_id = NULL,
        attempt_count = 0,
        provider = NULL,
        model_version = NULL,
        prompt_version = NULL,
        anchor_version = NULL,
        score_raw = NULL,
        score_normalized = NULL,
        confidence_0_1 = NULL,
        appearance_type = NULL,
        error_code = NULL,
        analyzed_at = NULL,
        updated_at = CURRENT_TIMESTAMP;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_private_appearance_score_after_storage_change
  ON storage.objects;
CREATE TRIGGER invalidate_private_appearance_score_after_storage_change
AFTER UPDATE OR DELETE ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_private_appearance_score_on_storage_object_change();

REVOKE ALL ON FUNCTION public.invalidate_private_appearance_score_on_storage_object_change()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.invalidate_private_appearance_score_on_storage_object_change() IS
  'Invalidates private appearance analysis when bytes at a user-owned photo object change.';

COMMIT;

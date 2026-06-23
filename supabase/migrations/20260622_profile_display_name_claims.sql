-- Migration: enforce unique profile display names through normalized claims.
-- Date: 2026-06-22
--
-- Why not a simple UNIQUE index on profiles.display_name?
-- Existing data may already contain duplicates. This table backfills one owner
-- per normalized name, then enforces future claims without failing on old rows.

CREATE OR REPLACE FUNCTION public.normalize_profile_display_name(
  p_display_name TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(p_display_name, '')), '\s+', ' ', 'g'));
$$;

CREATE TABLE IF NOT EXISTS public.profile_display_name_claims (
  normalized_name TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(public.normalize_profile_display_name(display_name)) BETWEEN 2 AND 20),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profile_display_name_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_display_name_claims_select_self
  ON public.profile_display_name_claims;

CREATE POLICY profile_display_name_claims_select_self
  ON public.profile_display_name_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.profile_display_name_claims (
  normalized_name,
  user_id,
  display_name
)
SELECT normalized_name, user_id, display_name
FROM (
  SELECT
    p.user_id,
    p.display_name,
    public.normalize_profile_display_name(p.display_name) AS normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY public.normalize_profile_display_name(p.display_name)
      ORDER BY p.updated_at DESC NULLS LAST, p.user_id
    ) AS row_number
  FROM public.profiles p
  WHERE p.display_name IS NOT NULL
    AND char_length(public.normalize_profile_display_name(p.display_name)) BETWEEN 2 AND 20
) ranked
WHERE row_number = 1
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_profile_display_name_claim_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_display_name_claims_touch_updated_at
  ON public.profile_display_name_claims;

CREATE TRIGGER trg_profile_display_name_claims_touch_updated_at
  BEFORE UPDATE ON public.profile_display_name_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_profile_display_name_claim_updated_at();

CREATE OR REPLACE FUNCTION public.guard_profile_display_name_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := public.normalize_profile_display_name(NEW.display_name);

  IF v_normalized = '' THEN
    DELETE FROM public.profile_display_name_claims
     WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  IF char_length(v_normalized) < 2 OR char_length(v_normalized) > 20 THEN
    RAISE EXCEPTION 'invalid_nickname';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profile_display_name_claims c
     WHERE c.normalized_name = v_normalized
       AND c.user_id <> NEW.user_id
  ) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  DELETE FROM public.profile_display_name_claims
   WHERE user_id = NEW.user_id
     AND public.profile_display_name_claims.normalized_name <> v_normalized;

  INSERT INTO public.profile_display_name_claims (
    normalized_name,
    user_id,
    display_name
  )
  VALUES (
    v_normalized,
    NEW.user_id,
    btrim(NEW.display_name)
  )
  ON CONFLICT ON CONSTRAINT profile_display_name_claims_pkey DO UPDATE
    SET user_id = EXCLUDED.user_id,
        display_name = EXCLUDED.display_name
    WHERE public.profile_display_name_claims.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  NEW.display_name := btrim(NEW.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_display_name_claim
  ON public.profiles;

CREATE TRIGGER trg_profiles_guard_display_name_claim
  BEFORE INSERT OR UPDATE OF display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_display_name_claim();

CREATE OR REPLACE FUNCTION public.is_profile_display_name_available(
  p_display_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_normalized TEXT;
BEGIN
  v_caller := auth.uid();
  v_normalized := public.normalize_profile_display_name(p_display_name);

  IF char_length(v_normalized) < 2 OR char_length(v_normalized) > 20 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM public.profile_display_name_claims c
     WHERE c.normalized_name = v_normalized
       AND (v_caller IS NULL OR c.user_id <> v_caller)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_profile_display_name(
  p_display_name TEXT
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := public.normalize_profile_display_name(p_display_name);

  RETURN QUERY
  SELECT c.user_id, c.display_name
    FROM public.profile_display_name_claims c
   WHERE c.normalized_name = v_normalized
   LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_profile_display_name(
  p_display_name TEXT
)
RETURNS TABLE (
  display_name TEXT,
  normalized_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_display_name TEXT;
  v_normalized TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_display_name := btrim(COALESCE(p_display_name, ''));
  v_normalized := public.normalize_profile_display_name(v_display_name);

  IF char_length(v_normalized) < 2 OR char_length(v_normalized) > 20 THEN
    RAISE EXCEPTION 'invalid_nickname';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profile_display_name_claims c
     WHERE c.normalized_name = v_normalized
       AND c.user_id <> v_caller
  ) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  DELETE FROM public.profile_display_name_claims
   WHERE user_id = v_caller
     AND public.profile_display_name_claims.normalized_name <> v_normalized;

  INSERT INTO public.profile_display_name_claims (
    normalized_name,
    user_id,
    display_name
  )
  VALUES (
    v_normalized,
    v_caller,
    v_display_name
  )
  ON CONFLICT ON CONSTRAINT profile_display_name_claims_pkey DO UPDATE
    SET user_id = EXCLUDED.user_id,
        display_name = EXCLUDED.display_name
    WHERE public.profile_display_name_claims.user_id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  UPDATE public.profiles
     SET display_name = v_display_name
   WHERE user_id = v_caller;

  RETURN QUERY
  SELECT c.display_name, c.normalized_name
    FROM public.profile_display_name_claims c
   WHERE c.user_id = v_caller;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_profile_display_name_available(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_profile_display_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_profile_display_name(TEXT) TO authenticated;

COMMENT ON TABLE public.profile_display_name_claims IS
  'Unique normalized display-name claims for nickname search and friend requests.';
COMMENT ON FUNCTION public.claim_profile_display_name(TEXT) IS
  'Claims a unique normalized display name for the authenticated user and syncs profiles.display_name when present.';

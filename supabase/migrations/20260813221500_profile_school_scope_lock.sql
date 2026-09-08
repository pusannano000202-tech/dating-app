BEGIN;

CREATE TABLE IF NOT EXISTS private.profile_school_scopes (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE private.profile_school_scopes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.profile_school_scopes TO service_role;

INSERT INTO private.profile_school_scopes (user_id, school)
SELECT profile.user_id, profile.school
FROM public.profiles AS profile
WHERE profile.school IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.current_request_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_claims_text TEXT := NULLIF(
    pg_catalog.current_setting('request.jwt.claims', TRUE),
    ''
  );
  v_claims_role TEXT;
  v_auth_role TEXT;
BEGIN
  IF v_claims_text IS NOT NULL THEN
    BEGIN
      v_claims_role := v_claims_text::jsonb ->> 'role';
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_claims_role := NULL;
    END;
  END IF;

  BEGIN
    v_auth_role := NULLIF(auth.role(), '');
  EXCEPTION
    WHEN OTHERS THEN
      v_auth_role := NULL;
  END;

  RETURN COALESCE(NULLIF(v_claims_role, ''), v_auth_role);
END;
$$;

REVOKE ALL ON FUNCTION private.current_request_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_request_role() TO service_role;

-- Community visibility is scoped by profiles.school. Once the user has chosen
-- a school, browser-authenticated writes cannot switch that authorization
-- boundary. Trusted service-role maintenance can still correct it after review.
CREATE FUNCTION private.guard_profile_school_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_school TEXT;
  v_request_role TEXT := private.current_request_role();
BEGIN
  SELECT scope.school
    INTO locked_school
    FROM private.profile_school_scopes AS scope
   WHERE scope.user_id = NEW.user_id
   FOR UPDATE;

  IF locked_school IS NOT NULL
     AND NEW.school IS DISTINCT FROM locked_school
     AND v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'school_scope_locked';
  END IF;

  INSERT INTO private.profile_school_scopes (user_id, school, updated_at)
  VALUES (NEW.user_id, NEW.school, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET school = CASE
      WHEN v_request_role = 'service_role' THEN EXCLUDED.school
      ELSE private.profile_school_scopes.school
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_profile_school_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_profile_school_scope() TO service_role;

DROP TRIGGER IF EXISTS profiles_guard_school_scope ON public.profiles;
CREATE TRIGGER profiles_guard_school_scope
  BEFORE INSERT OR UPDATE OF school ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_profile_school_scope();

REVOKE INSERT, DELETE ON TABLE public.profiles FROM authenticated;

COMMENT ON FUNCTION private.guard_profile_school_scope() IS
  'Persists a school authorization scope independently of the profile row and rejects authenticated scope switching.';

COMMIT;

BEGIN;

CREATE FUNCTION private.guard_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role TEXT := private.current_request_role();
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role'
     AND (
       NEW.gender IS DISTINCT FROM OLD.gender
       OR NEW.age IS DISTINCT FROM OLD.age
       OR NEW.height IS DISTINCT FROM OLD.height
       OR NEW.body_type IS DISTINCT FROM OLD.body_type
       OR NEW.hair_density IS DISTINCT FROM OLD.hair_density
       OR NEW.is_profile_complete IS DISTINCT FROM OLD.is_profile_complete
       OR NEW.appearance_score_normalized IS DISTINCT FROM OLD.appearance_score_normalized
       OR NEW.self_appearance_score IS DISTINCT FROM OLD.self_appearance_score
       OR NEW.self_appearance_score_auto IS DISTINCT FROM OLD.self_appearance_score_auto
       OR NEW.self_appearance_score_override IS DISTINCT FROM OLD.self_appearance_score_override
       OR NEW.self_appearance_score_source IS DISTINCT FROM OLD.self_appearance_score_source
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'profile_sensitive_fields_server_only';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_profile_sensitive_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_profile_sensitive_fields() TO service_role;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_fields ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_profile_sensitive_fields();

REVOKE INSERT, DELETE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;

COMMENT ON FUNCTION private.guard_profile_sensitive_fields() IS
  'Rejects direct authenticated edits to identity, completion, and appearance score fields. Trusted APIs use service_role after validation.';

COMMENT ON TABLE public.users IS
  'Private account contact row. Browser clients may read their RLS-scoped row; all writes pass through authenticated server endpoints.';

COMMIT;

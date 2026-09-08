BEGIN;

CREATE OR REPLACE FUNCTION public.set_app_config(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'on', TRUE);
  INSERT INTO public.app_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, CURRENT_TIMESTAMP)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = v_caller,
        updated_at = CURRENT_TIMESTAMP;
  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'off', TRUE);

  RETURN p_value;
END;
$$;

REVOKE ALL ON FUNCTION public.set_app_config(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_app_config(TEXT, JSONB) TO authenticated;

COMMIT;

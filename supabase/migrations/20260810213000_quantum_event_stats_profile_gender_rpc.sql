BEGIN;

CREATE OR REPLACE FUNCTION public.get_quantum_event_profile_genders(
  p_user_ids UUID[]
)
RETURNS TABLE(user_id UUID, gender TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.user_id, profile.gender::TEXT
  FROM public.profiles AS profile
  WHERE profile.user_id = ANY(COALESCE(p_user_ids, ARRAY[]::UUID[]));
$$;

REVOKE ALL ON FUNCTION public.get_quantum_event_profile_genders(UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quantum_event_profile_genders(UUID[])
  TO service_role;

COMMENT ON FUNCTION public.get_quantum_event_profile_genders(UUID[]) IS
  'Server-only minimal profile lookup for aggregate Quantum event applicant statistics.';

COMMIT;

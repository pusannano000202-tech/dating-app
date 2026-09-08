BEGIN;

-- Friend requests now use request_friend_by_display_name, which performs the
-- lookup and insert atomically without returning the target account UUID.
REVOKE ALL ON FUNCTION public.resolve_profile_display_name(TEXT)
  FROM PUBLIC, anon, authenticated;

COMMIT;

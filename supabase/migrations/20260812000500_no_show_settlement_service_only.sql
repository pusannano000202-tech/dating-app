BEGIN;

-- A participant report must not be able to finalize attendance or move money.
-- Evidence review and settlement are performed by trusted server automation.
REVOKE ALL ON FUNCTION public.finalize_no_show(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_no_show(UUID)
  TO service_role;

COMMENT ON FUNCTION public.finalize_no_show(UUID) IS
  'Service-only no-show settlement. Participant reports must be reviewed before this function is called.';

COMMIT;

BEGIN;

-- These maintenance RPCs are reserved for trusted server automation.
REVOKE ALL ON FUNCTION public.batch_finalize_no_shows()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_no_show_admin(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.batch_finalize_no_shows()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_no_show_admin(UUID)
  TO service_role;

-- Direct Data API access remains closed to users. These grants cover only
-- trusted server routes that already authenticate and validate their caller.
GRANT SELECT, INSERT, UPDATE ON TABLE public.users
  TO service_role;
GRANT INSERT ON TABLE public.school_email_verification_codes
  TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.deposits
  TO service_role;

GRANT SELECT ON TABLE public.attendances
  TO service_role;
GRANT SELECT ON TABLE public.deposit_refund_requests
  TO service_role;
GRANT SELECT ON TABLE public.match_meetings
  TO service_role;
GRANT SELECT ON TABLE public.venues
  TO service_role;

COMMIT;

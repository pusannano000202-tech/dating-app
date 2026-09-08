BEGIN;

-- Notification reads and writes remain RPC-only for browser roles. Trusted
-- settlement and scheduler code needs direct INSERT to fan out notifications.
GRANT INSERT ON TABLE public.notifications TO service_role;

COMMIT;

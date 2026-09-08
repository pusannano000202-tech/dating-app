BEGIN;

-- Notification access is RPC-only for browser sessions. The service client
-- only needs direct INSERT for trusted settlement and scheduler fan-out.
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated, service_role;
GRANT INSERT ON TABLE public.notifications TO service_role;

COMMIT;

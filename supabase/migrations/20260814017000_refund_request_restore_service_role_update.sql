BEGIN;

-- finalize_refund_request is SECURITY INVOKER and runs only through the
-- trusted service client. It needs UPDATE to mark a prepared request processed.
GRANT UPDATE ON TABLE public.deposit_refund_requests TO service_role;

COMMIT;

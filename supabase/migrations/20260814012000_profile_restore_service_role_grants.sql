BEGIN;

-- The security cutover removes browser writes. Keep validated server APIs able
-- to create and maintain account/profile rows through the service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

COMMIT;

BEGIN;

-- Browser writes stay revoked. These grants restore the private server client's
-- ability to validate deposits, run matching administration, and clean up
-- tightly tagged release QA fixtures.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.matches TO service_role;

COMMIT;

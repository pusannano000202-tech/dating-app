BEGIN;

-- The operational exception page introduced in 20260903001200 returns a
-- bounded, identity-free index and hydrates contact details for one explicitly
-- selected exception. Retire the earlier round-wide identity reader so a
-- privileged client cannot accidentally download every manual-review phone
-- number in a large round.
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_manual_deposits(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.super_admin_list_tonight_manual_deposits(UUID);

COMMIT;

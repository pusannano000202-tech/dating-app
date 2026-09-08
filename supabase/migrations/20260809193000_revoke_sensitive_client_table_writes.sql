-- Keep settlement, attendance, and contact-state mutations behind server-owned
-- RPCs or the service role. RLS is not a substitute for removing Data API
-- write privileges from these sensitive tables.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.attendances,
  public.connections,
  public.deposit_refund_requests,
  public.deposits
FROM authenticated;

DROP POLICY IF EXISTS attendances_self_write ON public.attendances;
DROP POLICY IF EXISTS attendances_self_update ON public.attendances;

DROP POLICY IF EXISTS connections_self ON public.connections;
CREATE POLICY connections_select_participant
  ON public.connections
  FOR SELECT
  TO authenticated
  USING (
    user_a_id = (SELECT auth.uid())
    OR user_b_id = (SELECT auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS drr_self ON public.deposit_refund_requests;
CREATE POLICY deposit_refund_requests_select_self
  ON public.deposit_refund_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS deposits_self ON public.deposits;
CREATE POLICY deposits_select_self
  ON public.deposits
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
  );

COMMIT;

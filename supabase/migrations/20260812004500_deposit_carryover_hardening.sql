-- Close trigger/helper execution and add covering indexes reported by the
-- post-apply Supabase advisors.

REVOKE ALL ON FUNCTION public.guard_refund_against_carryover() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_refund_against_carryover() FROM anon;
REVOKE ALL ON FUNCTION public.guard_refund_against_carryover() FROM authenticated;

-- Refund preparation now cancels an unused carryover atomically. Keep the old
-- helper unavailable to clients so there is only one state transition path.
REVOKE ALL ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) TO service_role;

CREATE INDEX IF NOT EXISTS deposit_carryovers_source_match_idx
  ON public.deposit_carryovers (source_match_id);

CREATE INDEX IF NOT EXISTS deposit_carryovers_target_match_idx
  ON public.deposit_carryovers (target_match_id)
  WHERE target_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deposit_carryovers_target_group_idx
  ON public.deposit_carryovers (target_group_id)
  WHERE target_group_id IS NOT NULL;

BEGIN;

-- Group completion closes active memberships. Settlement must therefore use
-- historical membership plus the caller-owned deposit, not an active row.
CREATE OR REPLACE FUNCTION public.choose_deposit_carryover(p_match_id UUID)
RETURNS TABLE (
  carryover_id UUID,
  deposit_id UUID,
  source_match_id UUID,
  carryover_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_carryover public.deposit_carryovers%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
      AND gm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = v_caller
    AND d.status IN ('paid', 'held')
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.deposits AS d
      WHERE d.match_id = p_match_id
        AND d.user_id = v_caller
        AND d.status = 'forfeited'
    ) THEN
      RAISE EXCEPTION 'no_show_cannot_carryover';
    END IF;
    RAISE EXCEPTION 'deposit_not_available_for_carryover';
  END IF;
  IF v_deposit.amount <> 10000 THEN
    RAISE EXCEPTION 'deposit_amount_not_carryable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.deposit_refund_requests AS r
    WHERE r.deposit_id = v_deposit.id
      AND r.status IN ('pending', 'processed')
  ) THEN
    RAISE EXCEPTION 'refund_already_requested';
  END IF;

  SELECT * INTO v_carryover
  FROM public.deposit_carryovers AS c
  WHERE c.deposit_id = v_deposit.id
    AND c.source_match_id = p_match_id
  FOR UPDATE;

  IF v_carryover.id IS NOT NULL AND v_carryover.status = 'available' THEN
    RETURN QUERY SELECT v_carryover.id, v_carryover.deposit_id,
      v_carryover.source_match_id, v_carryover.status;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deposit_carryovers AS c
    WHERE c.user_id = v_caller
      AND c.status = 'available'
  ) THEN
    RAISE EXCEPTION 'carryover_already_available';
  END IF;

  IF v_carryover.id IS NOT NULL AND v_carryover.status = 'cancelled' THEN
    UPDATE public.deposit_carryovers AS c
    SET status = 'available'
    WHERE c.id = v_carryover.id
    RETURNING * INTO v_carryover;
  ELSE
    INSERT INTO public.deposit_carryovers (
      deposit_id, user_id, source_match_id, status
    ) VALUES (
      v_deposit.id, v_caller, p_match_id, 'available'
    )
    RETURNING * INTO v_carryover;
  END IF;

  UPDATE public.deposits AS d
  SET status = 'held',
      updated_at = NOW(),
      notes = concat_ws(E'\n', NULLIF(d.notes, ''),
        'carryover_available:' || v_carryover.id::TEXT)
  WHERE d.id = v_deposit.id;

  RETURN QUERY SELECT v_carryover.id, v_carryover.deposit_id,
    v_carryover.source_match_id, v_carryover.status;
END;
$$;

REVOKE ALL ON FUNCTION public.choose_deposit_carryover(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_deposit_carryover(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_refund_request(
  p_match_id UUID,
  p_refund_amount INT,
  p_zero_refund_reasons TEXT[] DEFAULT NULL,
  p_zero_refund_comment TEXT DEFAULT NULL
)
RETURNS TABLE (
  refund_request_id UUID,
  deposit_id UUID,
  requested_refund_amount INT,
  deposit_amount INT,
  app_revenue INT,
  request_status TEXT,
  settlement_version INT,
  settlement_provider TEXT,
  settlement_provider_status TEXT,
  settled_refund_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_request public.deposit_refund_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_refund_amount IS NULL OR p_refund_amount < 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount';
  END IF;

  SELECT * INTO v_request
  FROM public.deposit_refund_requests AS r
  WHERE r.match_id = p_match_id
    AND r.user_id = v_caller
  FOR UPDATE;

  IF FOUND AND v_request.status IN ('pending', 'processed') THEN
    SELECT * INTO v_deposit
    FROM public.deposits AS d
    WHERE d.id = v_request.deposit_id
      AND d.match_id = v_request.match_id
      AND d.user_id = v_request.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'deposit_match_mismatch';
    END IF;
    IF v_request.requested_refund_amount <> p_refund_amount THEN
      RAISE EXCEPTION 'refund_request_conflict';
    END IF;
    IF v_request.status = 'processed'
       AND COALESCE(v_request.provider, 'legacy_unverified') = 'legacy_unverified' THEN
      RAISE EXCEPTION 'legacy_refund_verification_required';
    END IF;

    RETURN QUERY SELECT
      v_request.id,
      v_request.deposit_id,
      v_request.requested_refund_amount,
      v_deposit.amount,
      v_deposit.amount - v_request.requested_refund_amount,
      v_request.status,
      v_request.settlement_version,
      v_request.provider,
      v_request.provider_status,
      v_request.settled_refund_amount;
    RETURN;
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
      AND gm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = v_caller
    AND d.status IN ('paid', 'held')
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.deposits AS d
      WHERE d.match_id = p_match_id
        AND d.user_id = v_caller
        AND d.status = 'forfeited'
    ) THEN
      RAISE EXCEPTION 'no_show_cannot_refund';
    END IF;
    RAISE EXCEPTION 'deposit_not_found_or_already_refunded';
  END IF;
  IF p_refund_amount > v_deposit.amount THEN
    RAISE EXCEPTION 'refund_exceeds_deposit';
  END IF;

  UPDATE public.deposit_carryovers AS c
  SET status = 'cancelled'
  WHERE c.deposit_id = v_deposit.id
    AND c.user_id = v_caller
    AND c.source_match_id = p_match_id
    AND c.status = 'available';

  INSERT INTO public.deposit_refund_requests (
    match_id, user_id, deposit_id, requested_refund_amount,
    zero_refund_reasons, zero_refund_comment, status, processed_at
  ) VALUES (
    p_match_id, v_caller, v_deposit.id, p_refund_amount,
    COALESCE(p_zero_refund_reasons, '{}'::TEXT[]), p_zero_refund_comment,
    'pending', NULL
  )
  ON CONFLICT (match_id, user_id) DO UPDATE
  SET deposit_id = EXCLUDED.deposit_id,
      requested_refund_amount = EXCLUDED.requested_refund_amount,
      zero_refund_reasons = EXCLUDED.zero_refund_reasons,
      zero_refund_comment = EXCLUDED.zero_refund_comment,
      status = 'pending',
      processed_at = NULL,
      settlement_version = public.deposit_refund_requests.settlement_version + 1,
      provider = NULL,
      provider_status = NULL,
      settlement_key = NULL,
      provider_request_key = NULL,
      provider_payment_key = NULL,
      provider_order_id = NULL,
      settled_refund_amount = NULL
  WHERE public.deposit_refund_requests.status = 'cancelled'
  RETURNING * INTO v_request;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'refund_request_conflict';
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_deposit.id,
    v_request.requested_refund_amount,
    v_deposit.amount,
    v_deposit.amount - v_request.requested_refund_amount,
    v_request.status,
    v_request.settlement_version,
    v_request.provider,
    v_request.provider_status,
    v_request.settled_refund_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_refund_request(UUID, INT, TEXT[], TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_refund_request(UUID, INT, TEXT[], TEXT)
  TO authenticated;

-- Release QA cleanup is deliberately narrower than granting DELETE on payment
-- tables. It accepts only tagged QA matches whose members all belong to the
-- same tagged run and remains callable by service_role only.
CREATE OR REPLACE FUNCTION public.cleanup_deposit_settlement_qa_fixture(p_run_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := COALESCE(
    auth.jwt() ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', TRUE),
    ''
  );
  v_result JSONB;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_run_id IS NULL OR p_run_id !~ '^qa-release-[a-z0-9-]{8,80}$' THEN
    RAISE EXCEPTION 'invalid_qa_run_id';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.raw_user_meta_data ->> 'qa_run_id' = p_run_id
      AND u.raw_user_meta_data ->> 'qa_suite' = 'deposit-settlement'
  ) THEN
    RAISE EXCEPTION 'qa_accounts_not_found';
  END IF;
  IF EXISTS (
    WITH qa_matches AS (
      SELECT m.group_a_id, m.group_b_id
      FROM public.matches AS m
      WHERE m.score_breakdown ->> 'source' = 'release_qa'
        AND m.score_breakdown ->> 'qa_run_id' = p_run_id
    ), qa_groups AS (
      SELECT group_a_id AS id FROM qa_matches
      UNION
      SELECT group_b_id AS id FROM qa_matches
    )
    SELECT 1
    FROM public.group_members AS gm
    JOIN auth.users AS u ON u.id = gm.user_id
    WHERE gm.group_id IN (SELECT id FROM qa_groups)
      AND (
        u.raw_user_meta_data ->> 'qa_run_id' IS DISTINCT FROM p_run_id
        OR u.raw_user_meta_data ->> 'qa_suite' IS DISTINCT FROM 'deposit-settlement'
      )
  ) THEN
    RAISE EXCEPTION 'unsafe_qa_fixture_membership';
  END IF;

  WITH qa_matches AS MATERIALIZED (
    SELECT m.id, m.group_a_id, m.group_b_id
    FROM public.matches AS m
    WHERE m.score_breakdown ->> 'source' = 'release_qa'
      AND m.score_breakdown ->> 'qa_run_id' = p_run_id
  ), qa_groups AS MATERIALIZED (
    SELECT group_a_id AS id FROM qa_matches
    UNION
    SELECT group_b_id AS id FROM qa_matches
  ), deleted_refunds AS (
    DELETE FROM public.deposit_refund_requests
    WHERE match_id IN (SELECT id FROM qa_matches)
    RETURNING id
  ), deleted_carryovers AS (
    DELETE FROM public.deposit_carryovers
    WHERE source_match_id IN (SELECT id FROM qa_matches)
       OR target_match_id IN (SELECT id FROM qa_matches)
    RETURNING id
  ), deleted_deposits AS (
    DELETE FROM public.deposits
    WHERE match_id IN (SELECT id FROM qa_matches)
      AND (SELECT count(*) FROM deleted_carryovers) >= 0
    RETURNING id
  ), deleted_matches AS (
    DELETE FROM public.matches
    WHERE id IN (SELECT id FROM qa_matches)
      AND (SELECT count(*) FROM deleted_deposits) >= 0
    RETURNING id
  ), deleted_groups AS (
    DELETE FROM public.groups
    WHERE id IN (SELECT id FROM qa_groups)
      AND (SELECT count(*) FROM deleted_matches) >= 0
    RETURNING id
  )
  SELECT jsonb_build_object(
    'refunds', (SELECT count(*) FROM deleted_refunds),
    'carryovers', (SELECT count(*) FROM deleted_carryovers),
    'deposits', (SELECT count(*) FROM deleted_deposits),
    'matches', (SELECT count(*) FROM deleted_matches),
    'groups', (SELECT count(*) FROM deleted_groups)
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_deposit_settlement_qa_fixture(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_deposit_settlement_qa_fixture(TEXT)
  TO service_role;

COMMIT;

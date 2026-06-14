-- Phase 4 DB lint cleanup.
-- Scope: fix plpgsql ambiguous column/variable references in legacy RPCs.
-- Production note: validated only against disposable local Supabase before merge.
-- Do not include z54 daily card changes or cross-branch venues/match_meetings fixtures.

CREATE OR REPLACE FUNCTION public.accept_friend_request(
  p_request_id UUID
)
RETURNS TABLE (
  request_id UUID,
  user_id UUID,
  friend_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_request friend_requests%ROWTYPE;
  v_user UUID;
  v_friend UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_request
    FROM friend_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  IF v_request.expires_at <= NOW() THEN
    UPDATE friend_requests
       SET status = 'expired'
     WHERE id = p_request_id;
    RAISE EXCEPTION 'request_expired';
  END IF;

  IF v_request.receiver_user_id IS NOT NULL THEN
    IF v_request.receiver_user_id <> v_caller THEN
      RAISE EXCEPTION 'not_receiver';
    END IF;
  ELSIF v_request.receiver_phone IS NOT NULL THEN
    IF v_request.receiver_phone <> (SELECT u.phone FROM public.users AS u WHERE u.id = v_caller) THEN
      RAISE EXCEPTION 'not_receiver';
    END IF;
  ELSE
    RAISE EXCEPTION 'request_no_receiver';
  END IF;

  IF v_request.receiver_user_id IS NULL THEN
    UPDATE friend_requests
       SET receiver_user_id = v_caller,
           status = 'accepted',
           responded_at = NOW()
     WHERE id = p_request_id;
  ELSE
    UPDATE friend_requests
       SET status = 'accepted',
           responded_at = NOW()
     WHERE id = p_request_id;
  END IF;

  IF v_request.sender_user_id < v_caller THEN
    v_user := v_request.sender_user_id;
    v_friend := v_caller;
  ELSE
    v_user := v_caller;
    v_friend := v_request.sender_user_id;
  END IF;

  PERFORM set_config('app.bypass_friendships_guard', 'on', TRUE);
  INSERT INTO friendships (user_id, friend_user_id, status, created_from_request_id)
  VALUES (v_user, v_friend, 'active', p_request_id)
  ON CONFLICT ON CONSTRAINT friendships_pkey DO NOTHING;
  PERFORM set_config('app.bypass_friendships_guard', 'off', TRUE);

  RETURN QUERY
  SELECT p_request_id, v_user, v_friend;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;

COMMENT ON FUNCTION public.accept_friend_request(UUID) IS
  'Receiver accepts a pending friend request and creates the normalized friendships row.';

CREATE OR REPLACE FUNCTION public.mock_pay_deposit(
  p_group_id UUID,
  p_amount INT
)
RETURNS TABLE (
  deposit_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_active BOOLEAN;
  v_existing UUID;
  v_deposit_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT TRUE INTO v_active
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  SELECT d.id INTO v_existing
    FROM deposits AS d
   WHERE d.group_id = p_group_id
     AND d.user_id = v_caller
     AND d.status IN ('paid', 'held', 'pending')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'deposit_already_exists';
  END IF;

  INSERT INTO deposits (
    user_id, group_id, amount, status,
    toss_payment_key, toss_order_id, paid_at
  )
  VALUES (
    v_caller, p_group_id, p_amount, 'paid',
    'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    NOW()
  )
  RETURNING id INTO v_deposit_id;

  RETURN QUERY
  SELECT v_deposit_id, 'paid'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mock_pay_deposit(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.mock_pay_deposit(UUID, INT) IS
  'Temporary mock deposit payment for local/test payment flow.';

CREATE OR REPLACE FUNCTION public.leave_group(
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  member_user_id UUID,
  left_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_member group_members%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id = v_caller THEN
    RAISE EXCEPTION 'leader_cannot_leave';
  END IF;

  SELECT *
    INTO v_member
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_active_member';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  UPDATE group_members AS gm
     SET left_at = v_now
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups AS g
       SET status = 'forming'
     WHERE g.id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, v_caller, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.leave_group(UUID) IS
  'Non-leader active member leaves a forming/ready group; ready group queue state is cancelled.';

CREATE OR REPLACE FUNCTION public.disband_group(
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);
  END IF;

  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
  UPDATE groups AS g
     SET status = 'disbanded'
   WHERE g.id = p_group_id;
  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);

  RETURN QUERY SELECT p_group_id, 'disbanded'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disband_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.disband_group(UUID) IS
  'Leader disbands a forming/ready group; ready group queue state is cancelled first.';

CREATE OR REPLACE FUNCTION public.get_friend_request_summaries()
RETURNS TABLE (
  request_id UUID,
  sender_user_id UUID,
  receiver_user_id UUID,
  receiver_phone TEXT,
  sender_display_name TEXT,
  receiver_display_name TEXT,
  status TEXT,
  message TEXT,
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_sender BOOLEAN,
  is_receiver BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_phone TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT u.phone INTO v_phone FROM public.users AS u WHERE u.id = v_caller;

  UPDATE friend_requests AS fr
     SET status = 'expired'
   WHERE fr.status = 'pending'
     AND fr.expires_at IS NOT NULL
     AND fr.expires_at < NOW()
     AND (
       fr.sender_user_id = v_caller
       OR fr.receiver_user_id = v_caller
       OR (
         fr.receiver_user_id IS NULL
         AND v_phone IS NOT NULL
         AND fr.receiver_phone = v_phone
       )
     );

  RETURN QUERY
  SELECT
    fr.id,
    fr.sender_user_id,
    fr.receiver_user_id,
    fr.receiver_phone,
    ps.display_name AS sender_display_name,
    pr.display_name AS receiver_display_name,
    fr.status::TEXT,
    fr.message,
    fr.expires_at,
    fr.responded_at,
    fr.created_at,
    (fr.sender_user_id = v_caller) AS is_sender,
    (
      fr.receiver_user_id = v_caller
      OR (fr.receiver_user_id IS NULL AND v_phone IS NOT NULL AND fr.receiver_phone = v_phone)
    ) AS is_receiver
  FROM friend_requests AS fr
  LEFT JOIN profiles AS ps ON ps.user_id = fr.sender_user_id
  LEFT JOIN profiles AS pr ON pr.user_id = fr.receiver_user_id
  WHERE
    fr.sender_user_id = v_caller
    OR fr.receiver_user_id = v_caller
    OR (
      fr.receiver_user_id IS NULL
      AND v_phone IS NOT NULL
      AND fr.receiver_phone = v_phone
    )
  ORDER BY fr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_request_summaries() TO authenticated;

COMMENT ON FUNCTION public.get_friend_request_summaries() IS
  'Returns caller-related friend requests with sender/receiver display names and lazy expiry.';

CREATE OR REPLACE FUNCTION public.transfer_group_leadership(
  p_group_id UUID,
  p_new_leader_user_id UUID
)
RETURNS TABLE (
  group_id UUID,
  new_leader_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_target_active BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_new_leader_user_id IS NULL THEN
    RAISE EXCEPTION 'new_leader_required';
  END IF;

  IF p_new_leader_user_id = v_caller THEN
    RAISE EXCEPTION 'new_leader_is_caller';
  END IF;

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM group_members AS gm
     WHERE gm.group_id = p_group_id
       AND gm.user_id = p_new_leader_user_id
       AND gm.left_at IS NULL
  ) INTO v_target_active;

  IF NOT v_target_active THEN
    RAISE EXCEPTION 'new_leader_not_member';
  END IF;

  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
  UPDATE groups AS g
     SET leader_user_id = p_new_leader_user_id
   WHERE g.id = p_group_id;
  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);

  RETURN QUERY SELECT p_group_id, p_new_leader_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_group_leadership(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.transfer_group_leadership(UUID, UUID) IS
  'Leader transfers leadership to another active member while group is forming/ready.';

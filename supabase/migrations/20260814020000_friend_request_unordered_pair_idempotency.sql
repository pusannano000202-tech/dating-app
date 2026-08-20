BEGIN;

-- Expired rows must stop occupying the one-pending-request-per-pair slot.
UPDATE public.friend_requests
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at <= now();

-- Keep only the newest pending request for each unordered user pair before
-- adding the invariant. Phone-only invitations are outside this constraint.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        LEAST(sender_user_id, receiver_user_id),
        GREATEST(sender_user_id, receiver_user_id)
      ORDER BY created_at DESC, id DESC
    ) AS pair_rank
  FROM public.friend_requests
  WHERE status = 'pending'
    AND receiver_user_id IS NOT NULL
)
UPDATE public.friend_requests AS request
SET status = 'cancelled'
FROM ranked
WHERE request.id = ranked.id
  AND ranked.pair_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending_user_pair
ON public.friend_requests (
  LEAST(sender_user_id, receiver_user_id),
  GREATEST(sender_user_id, receiver_user_id)
)
WHERE status = 'pending'
  AND receiver_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_friend_by_display_name(
  p_display_name TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  request_status TEXT,
  duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_normalized TEXT;
  v_receiver UUID;
  v_message TEXT;
  v_count INTEGER;
  v_request public.friend_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_normalized := public.normalize_profile_display_name(p_display_name);
  v_message := NULLIF(LEFT(BTRIM(COALESCE(p_message, '')), 200), '');
  IF char_length(v_normalized) < 2 OR char_length(v_normalized) > 20 THEN
    RAISE EXCEPTION 'invalid_nickname';
  END IF;

  INSERT INTO private.friend_request_lookup_rate_limits (
    user_id, window_started_at, attempt_count
  ) VALUES (
    v_caller, now(), 1
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN private.friend_request_lookup_rate_limits.window_started_at <= now() - interval '10 minutes'
        THEN now()
      ELSE private.friend_request_lookup_rate_limits.window_started_at
    END,
    attempt_count = CASE
      WHEN private.friend_request_lookup_rate_limits.window_started_at <= now() - interval '10 minutes'
        THEN 1
      ELSE least(private.friend_request_lookup_rate_limits.attempt_count + 1, 13)
    END
  RETURNING attempt_count INTO v_count;

  IF v_count > 12 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT claim.user_id INTO v_receiver
  FROM public.profile_display_name_claims AS claim
  WHERE claim.normalized_name = v_normalized
  LIMIT 1;

  IF v_receiver IS NULL OR v_receiver = v_caller THEN
    RETURN QUERY SELECT NULL::UUID, 'unavailable'::TEXT, false;
    RETURN;
  END IF;

  -- Serialize both A-to-B and B-to-A requests on the same advisory key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(v_caller, v_receiver)::TEXT || ':' || GREATEST(v_caller, v_receiver)::TEXT,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.user_id = LEAST(v_caller, v_receiver)
      AND friendship.friend_user_id = GREATEST(v_caller, v_receiver)
      AND friendship.status = 'active'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, 'unavailable'::TEXT, false;
    RETURN;
  END IF;

  UPDATE public.friend_requests AS expired
  SET status = 'expired'
  WHERE expired.status = 'pending'
    AND expired.expires_at <= now()
    AND expired.receiver_user_id IS NOT NULL
    AND LEAST(expired.sender_user_id, expired.receiver_user_id) = LEAST(v_caller, v_receiver)
    AND GREATEST(expired.sender_user_id, expired.receiver_user_id) = GREATEST(v_caller, v_receiver);

  SELECT request.* INTO v_request
  FROM public.friend_requests AS request
  WHERE request.status = 'pending'
    AND request.receiver_user_id IS NOT NULL
    AND LEAST(request.sender_user_id, request.receiver_user_id) = LEAST(v_caller, v_receiver)
    AND GREATEST(request.sender_user_id, request.receiver_user_id) = GREATEST(v_caller, v_receiver)
  ORDER BY request.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_request.id IS NOT NULL THEN
    RETURN QUERY SELECT v_request.id, v_request.status, true;
    RETURN;
  END IF;

  INSERT INTO public.friend_requests (
    sender_user_id,
    receiver_user_id,
    receiver_phone,
    token,
    status,
    message,
    expires_at
  ) VALUES (
    v_caller,
    v_receiver,
    NULL,
    replace(gen_random_uuid()::TEXT, '-', ''),
    'pending',
    v_message,
    now() + interval '14 days'
  )
  RETURNING * INTO v_request;

  RETURN QUERY SELECT v_request.id, v_request.status, false;
END;
$$;

REVOKE ALL ON FUNCTION public.request_friend_by_display_name(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_friend_by_display_name(TEXT, TEXT)
  TO authenticated;

COMMIT;

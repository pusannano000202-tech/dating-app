BEGIN;

CREATE TABLE IF NOT EXISTS private.friend_request_lookup_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1)
);

REVOKE ALL ON TABLE private.friend_request_lookup_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

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

  -- Serialize requests for the same sender and normalized display name so that
  -- concurrent retries cannot create more than one pending request.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_caller::TEXT || ':' || v_normalized, 0)
  );

  SELECT c.user_id INTO v_receiver
  FROM public.profile_display_name_claims AS c
  WHERE c.normalized_name = v_normalized
  LIMIT 1;

  -- Return the same result for missing, self, and existing-friend lookups.
  -- Besides avoiding account enumeration, returning instead of raising keeps
  -- the rate-limit mutation committed for unsuccessful lookups.
  IF v_receiver IS NULL OR v_receiver = v_caller THEN
    RETURN QUERY SELECT NULL::UUID, 'unavailable'::TEXT, false;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.friendships AS f
    WHERE f.user_id = LEAST(v_caller, v_receiver)
      AND f.friend_user_id = GREATEST(v_caller, v_receiver)
      AND f.status = 'active'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, 'unavailable'::TEXT, false;
    RETURN;
  END IF;

  SELECT * INTO v_request
  FROM public.friend_requests AS r
  WHERE r.sender_user_id = v_caller
    AND r.receiver_user_id = v_receiver
    AND r.status = 'pending'
    AND r.expires_at > now()
  ORDER BY r.created_at DESC
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

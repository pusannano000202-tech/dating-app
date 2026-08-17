-- Private one-to-one date proposals between active Quantum friends.
-- Table rows are RPC-only so clients cannot bypass friendship or ownership checks.

BEGIN;

CREATE TABLE public.friend_date_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friendship_user_id UUID NOT NULL,
  friendship_friend_user_id UUID NOT NULL,
  proposer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('meal', 'cafe', 'walk', 'custom')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friend_date_proposals_friendship_fk
    FOREIGN KEY (friendship_user_id, friendship_friend_user_id)
    REFERENCES public.friendships(user_id, friend_user_id)
    ON DELETE CASCADE,
  CHECK (friendship_user_id < friendship_friend_user_id),
  CHECK (proposer_user_id <> recipient_user_id),
  CHECK (friendship_user_id = LEAST(proposer_user_id, recipient_user_id)),
  CHECK (friendship_friend_user_id = GREATEST(proposer_user_id, recipient_user_id)),
  CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 300),
  CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

CREATE INDEX friend_date_proposals_proposer_idx
  ON public.friend_date_proposals (proposer_user_id, created_at DESC);

CREATE INDEX friend_date_proposals_recipient_idx
  ON public.friend_date_proposals (recipient_user_id, created_at DESC);

CREATE UNIQUE INDEX friend_date_proposals_one_pending_pair_idx
  ON public.friend_date_proposals (friendship_user_id, friendship_friend_user_id)
  WHERE status = 'pending';

ALTER TABLE public.friend_date_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_date_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_date_proposals TO service_role;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed',
    'attendance_confirmed', 'no_show_confirmed',
    'daily_card_available', 'campus_seven_guide',
    'friend_date_proposal', 'friend_date_response'
  ));

CREATE OR REPLACE FUNCTION public.create_friend_date_proposal(
  p_recipient_user_id UUID,
  p_kind TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_friendship_user_id UUID;
  v_friendship_friend_user_id UUID;
  v_message TEXT;
  v_proposal_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_recipient_user_id IS NULL OR p_recipient_user_id = v_caller THEN
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF p_kind NOT IN ('meal', 'cafe', 'walk', 'custom') THEN
    RAISE EXCEPTION 'invalid_proposal_kind';
  END IF;

  v_message := NULLIF(btrim(COALESCE(p_message, '')), '');
  IF v_message IS NOT NULL AND char_length(v_message) > 300 THEN
    RAISE EXCEPTION 'proposal_message_too_long';
  END IF;

  v_friendship_user_id := LEAST(v_caller, p_recipient_user_id);
  v_friendship_friend_user_id := GREATEST(v_caller, p_recipient_user_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS f
    WHERE f.user_id = v_friendship_user_id
      AND f.friend_user_id = v_friendship_friend_user_id
      AND f.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required';
  END IF;

  BEGIN
    INSERT INTO public.friend_date_proposals (
      friendship_user_id,
      friendship_friend_user_id,
      proposer_user_id,
      recipient_user_id,
      kind,
      message
    ) VALUES (
      v_friendship_user_id,
      v_friendship_friend_user_id,
      v_caller,
      p_recipient_user_id,
      p_kind,
      v_message
    )
    RETURNING id INTO v_proposal_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'proposal_already_pending';
  END;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    p_recipient_user_id,
    'friend_date_proposal',
    jsonb_build_object(
      'proposal_id', v_proposal_id,
      'proposer_user_id', v_caller,
      'kind', p_kind
    )
  );
  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_proposal_id;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_date_proposal(
  p_proposal_id UUID,
  p_accept BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_proposer_user_id UUID;
  v_status TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_proposal_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION 'invalid_proposal_response';
  END IF;

  UPDATE public.friend_date_proposals AS proposal
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         responded_at = NOW()
   WHERE proposal.id = p_proposal_id
     AND proposal.recipient_user_id = v_caller
     AND proposal.status = 'pending'
     AND EXISTS (
       SELECT 1
       FROM public.friendships AS f
       WHERE f.user_id = proposal.friendship_user_id
         AND f.friend_user_id = proposal.friendship_friend_user_id
         AND f.status = 'active'
     )
  RETURNING proposal.proposer_user_id, proposal.status
  INTO v_proposer_user_id, v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'proposal_not_pending_or_forbidden';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    v_proposer_user_id,
    'friend_date_response',
    jsonb_build_object(
      'proposal_id', p_proposal_id,
      'responder_user_id', v_caller,
      'status', v_status
    )
  );
  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_status;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_date_proposal(
  p_proposal_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.friend_date_proposals
     SET status = 'cancelled',
         responded_at = NOW()
   WHERE id = p_proposal_id
     AND proposer_user_id = v_caller
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_not_pending_or_forbidden';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_date_proposals(
  p_other_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  proposer_user_id UUID,
  recipient_user_id UUID,
  other_user_id UUID,
  other_display_name TEXT,
  kind TEXT,
  message TEXT,
  status TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    proposal.id,
    proposal.proposer_user_id,
    proposal.recipient_user_id,
    CASE
      WHEN proposal.proposer_user_id = auth.uid() THEN proposal.recipient_user_id
      ELSE proposal.proposer_user_id
    END AS other_user_id,
    profile.display_name AS other_display_name,
    proposal.kind,
    proposal.message,
    proposal.status,
    proposal.responded_at,
    proposal.created_at
  FROM public.friend_date_proposals AS proposal
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = CASE
      WHEN proposal.proposer_user_id = auth.uid() THEN proposal.recipient_user_id
      ELSE proposal.proposer_user_id
    END
  WHERE auth.uid() IS NOT NULL
    AND auth.uid() IN (proposal.proposer_user_id, proposal.recipient_user_id)
    AND (
      p_other_user_id IS NULL
      OR p_other_user_id = CASE
        WHEN proposal.proposer_user_id = auth.uid() THEN proposal.recipient_user_id
        ELSE proposal.proposer_user_id
      END
    )
  ORDER BY proposal.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.create_friend_date_proposal(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_date_proposal(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_friend_date_proposal(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friend_date_proposals(UUID, INT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_friend_date_proposal(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_date_proposal(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_date_proposal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_date_proposals(UUID, INT) TO authenticated;

COMMIT;

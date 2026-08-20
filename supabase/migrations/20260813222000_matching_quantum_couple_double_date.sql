BEGIN;

CREATE TABLE public.quantum_couple_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL DEFAULT 'scheduled-couple-double-date'
    CHECK (event_id = 'scheduled-couple-double-date'),
  leader_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_partner'
    CHECK (status IN ('pending_partner', 'ready', 'matched', 'completed', 'cancelled')),
  invite_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (leader_user_id <> partner_user_id)
);

CREATE TABLE public.quantum_couple_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_a_id UUID NOT NULL UNIQUE REFERENCES public.quantum_couple_parties(id) ON DELETE CASCADE,
  pair_b_id UUID NOT NULL UNIQUE REFERENCES public.quantum_couple_parties(id) ON DELETE CASCADE,
  participant_count SMALLINT NOT NULL DEFAULT 4 CHECK (participant_count = 4),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  location_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pair_a_id <> pair_b_id)
);

CREATE INDEX quantum_couple_parties_member_status_idx
  ON public.quantum_couple_parties(leader_user_id, partner_user_id, status, created_at DESC);
CREATE INDEX quantum_couple_parties_ready_idx
  ON public.quantum_couple_parties(school_scope, created_at ASC)
  WHERE status = 'ready';

ALTER TABLE public.quantum_couple_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quantum_couple_matches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.quantum_couple_parties FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.quantum_couple_matches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.quantum_couple_parties TO service_role;
GRANT ALL ON TABLE public.quantum_couple_matches TO service_role;

CREATE OR REPLACE FUNCTION private.release_quantum_couple_counterparty_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.quantum_couple_parties AS counterpart
  SET status = 'cancelled',
      cancelled_at = COALESCE(counterpart.cancelled_at, now()),
      updated_at = now()
  WHERE counterpart.id <> OLD.id
    AND OLD.status = 'matched'
    AND counterpart.status = 'matched'
    AND EXISTS (
      SELECT 1
      FROM public.quantum_couple_matches AS matched_pair
      WHERE (matched_pair.pair_a_id = OLD.id AND matched_pair.pair_b_id = counterpart.id)
         OR (matched_pair.pair_b_id = OLD.id AND matched_pair.pair_a_id = counterpart.id)
    );

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.release_quantum_couple_counterparty_before_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS release_quantum_couple_counterparty_before_delete
  ON public.quantum_couple_parties;
CREATE TRIGGER release_quantum_couple_counterparty_before_delete
BEFORE DELETE ON public.quantum_couple_parties
FOR EACH ROW EXECUTE FUNCTION private.release_quantum_couple_counterparty_before_delete();

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
    'friend_date_proposal', 'friend_date_response',
    'couple_party_invite', 'couple_party_accepted',
    'couple_party_matched', 'couple_party_completed'
  ));

CREATE OR REPLACE FUNCTION private.next_quantum_couple_date_start()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')
    + interval '5 days 16 hours'
    + CASE
        WHEN now() AT TIME ZONE 'Asia/Seoul' >= date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') + interval '5 days 14 hours'
          THEN interval '7 days'
        ELSE interval '0 days'
      END
  ) AT TIME ZONE 'Asia/Seoul';
$$;

REVOKE ALL ON FUNCTION private.next_quantum_couple_date_start() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.next_quantum_couple_date_start() TO service_role;

CREATE OR REPLACE FUNCTION private.expire_quantum_couple_parties(
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER := 0;
BEGIN
  UPDATE public.quantum_couple_parties
  SET status = 'cancelled', cancelled_at = p_now, updated_at = p_now
  WHERE status = 'pending_partner'
    AND expires_at <= p_now;
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_quantum_couple_parties(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.expire_quantum_couple_parties(TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_due_quantum_couple_matches(
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match public.quantum_couple_matches%ROWTYPE;
  v_completed INTEGER := 0;
  v_previous_friendships_guard TEXT :=
    pg_catalog.current_setting('app.bypass_friendships_guard', TRUE);
  v_previous_notifications_guard TEXT :=
    pg_catalog.current_setting('app.bypass_notifications_guard', TRUE);
BEGIN
  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'on', TRUE);
  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);

  FOR v_match IN
    SELECT candidate.*
    FROM public.quantum_couple_matches AS candidate
    WHERE candidate.status = 'confirmed'
      AND candidate.starts_at + interval '150 minutes' <= p_now
    ORDER BY candidate.starts_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.quantum_couple_matches
    SET status = 'completed', completed_at = p_now
    WHERE id = v_match.id;

    UPDATE public.quantum_couple_parties
    SET status = 'completed', updated_at = p_now
    WHERE id IN (v_match.pair_a_id, v_match.pair_b_id);

    WITH members AS (
      SELECT party.leader_user_id AS user_id
      FROM public.quantum_couple_parties AS party
      WHERE party.id IN (v_match.pair_a_id, v_match.pair_b_id)
      UNION
      SELECT party.partner_user_id
      FROM public.quantum_couple_parties AS party
      WHERE party.id IN (v_match.pair_a_id, v_match.pair_b_id)
    )
    INSERT INTO public.friendships (
      user_id,
      friend_user_id,
      status,
      created_from_request_id,
      blocked_by,
      blocked_at,
      source_match_id
    )
    SELECT
      left_member.user_id,
      right_member.user_id,
      'active',
      NULL,
      NULL,
      NULL,
      NULL
    FROM members AS left_member
    JOIN members AS right_member ON right_member.user_id > left_member.user_id
    ON CONFLICT ON CONSTRAINT friendships_pkey DO NOTHING;

    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT member.user_id,
           'couple_party_completed',
           jsonb_build_object('couple_match_id', v_match.id, 'event_id', 'scheduled-couple-double-date')
    FROM (
      SELECT party.leader_user_id AS user_id
      FROM public.quantum_couple_parties AS party
      WHERE party.id IN (v_match.pair_a_id, v_match.pair_b_id)
      UNION
      SELECT party.partner_user_id
      FROM public.quantum_couple_parties AS party
      WHERE party.id IN (v_match.pair_a_id, v_match.pair_b_id)
    ) AS member;

    v_completed := v_completed + 1;
  END LOOP;

  PERFORM pg_catalog.set_config(
    'app.bypass_notifications_guard',
    COALESCE(v_previous_notifications_guard, ''),
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'app.bypass_friendships_guard',
    COALESCE(v_previous_friendships_guard, ''),
    TRUE
  );
  RETURN v_completed;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.bypass_notifications_guard',
      COALESCE(v_previous_notifications_guard, ''),
      TRUE
    );
    PERFORM pg_catalog.set_config(
      'app.bypass_friendships_guard',
      COALESCE(v_previous_friendships_guard, ''),
      TRUE
    );
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_due_quantum_couple_matches(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_due_quantum_couple_matches(TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_quantum_couple_state(
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER;
  v_completed INTEGER;
BEGIN
  v_expired := private.expire_quantum_couple_parties(p_now);
  v_completed := public.complete_due_quantum_couple_matches(p_now);

  RETURN jsonb_build_object(
    'expired_parties', v_expired,
    'completed_matches', v_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_quantum_couple_state(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_quantum_couple_state(TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_quantum_couple_party()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_party public.quantum_couple_parties%ROWTYPE;
  v_match public.quantum_couple_matches%ROWTYPE;
  v_role TEXT;
  v_partner_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT * INTO v_party
  FROM public.quantum_couple_parties AS party
  WHERE (party.leader_user_id = v_user_id OR party.partner_user_id = v_user_id)
    AND party.status IN ('pending_partner', 'ready', 'matched', 'completed')
    AND (party.status <> 'pending_partner' OR party.expires_at > now())
  ORDER BY party.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_role := CASE WHEN v_party.leader_user_id = v_user_id THEN 'leader' ELSE 'partner' END;
  SELECT profile.display_name INTO v_partner_name
  FROM public.profiles AS profile
  WHERE profile.user_id = CASE
    WHEN v_role = 'leader' THEN v_party.partner_user_id
    ELSE v_party.leader_user_id
  END;

  IF v_party.status IN ('matched', 'completed') THEN
    SELECT * INTO v_match
    FROM public.quantum_couple_matches AS candidate
    WHERE candidate.pair_a_id = v_party.id OR candidate.pair_b_id = v_party.id
    ORDER BY candidate.created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'party_id', v_party.id,
    'event_id', v_party.event_id,
    'role', v_role,
    'partner_display_name', coalesce(v_partner_name, '내 파트너'),
    'status', v_party.status,
    'completed', v_party.status = 'completed',
    'expires_at', v_party.expires_at,
    'matched', v_match.id IS NOT NULL,
    'participant_count', CASE
      WHEN v_match.id IS NOT NULL THEN v_match.participant_count
      WHEN v_party.status = 'pending_partner' THEN 1
      ELSE 2
    END,
    'starts_at', v_match.starts_at,
    'location_name', v_match.location_name,
    'completed_at', v_match.completed_at,
    'opponent_couple_ready', v_match.id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_quantum_couple_party(p_partner_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_party public.quantum_couple_parties%ROWTYPE;
  v_leader_school TEXT;
  v_partner_school TEXT;
  v_previous_notifications_guard TEXT :=
    pg_catalog.current_setting('app.bypass_notifications_guard', TRUE);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF p_partner_user_id IS NULL OR p_partner_user_id = v_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_partner';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(least(v_user_id::text, p_partner_user_id::text), 71));
  PERFORM pg_advisory_xact_lock(hashtextextended(greatest(v_user_id::text, p_partner_user_id::text), 71));

  SELECT leader.school, partner.school
  INTO v_leader_school, v_partner_school
  FROM public.profiles AS leader
  JOIN public.profiles AS partner ON partner.user_id = p_partner_user_id
  WHERE leader.user_id = v_user_id;

  IF v_leader_school IS NULL
     OR v_partner_school IS NULL
     OR v_leader_school IS DISTINCT FROM v_partner_school THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'school_scope_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships AS friendship
    WHERE friendship.status = 'active'
      AND (
        (friendship.user_id = v_user_id AND friendship.friend_user_id = p_partner_user_id)
        OR (friendship.user_id = p_partner_user_id AND friendship.friend_user_id = v_user_id)
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active_friendship_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quantum_couple_parties AS party
    WHERE (
      (party.status = 'pending_partner' AND party.expires_at > now())
      OR party.status IN ('ready', 'matched')
    )
      AND (party.leader_user_id IN (v_user_id, p_partner_user_id)
        OR party.partner_user_id IN (v_user_id, p_partner_user_id))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'active_couple_party_exists';
  END IF;

  INSERT INTO public.quantum_couple_parties(
    leader_user_id,
    partner_user_id,
    school_scope
  )
  VALUES (v_user_id, p_partner_user_id, v_leader_school)
  RETURNING * INTO v_party;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (
    p_partner_user_id,
    'couple_party_invite',
    jsonb_build_object('party_id', v_party.id, 'event_id', v_party.event_id)
  );
  PERFORM pg_catalog.set_config(
    'app.bypass_notifications_guard',
    COALESCE(v_previous_notifications_guard, ''),
    TRUE
  );

  RETURN jsonb_build_object(
    'party_id', v_party.id,
    'event_id', v_party.event_id,
    'role', 'leader',
    'status', v_party.status,
    'expires_at', v_party.expires_at,
    'matched', false,
    'participant_count', 1,
    'opponent_couple_ready', false,
    'message', 'partner_consent_required'
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.bypass_notifications_guard',
      COALESCE(v_previous_notifications_guard, ''),
      TRUE
    );
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_quantum_couple_party(p_party_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_party public.quantum_couple_parties%ROWTYPE;
  v_other public.quantum_couple_parties%ROWTYPE;
  v_match public.quantum_couple_matches%ROWTYPE;
  v_previous_notifications_guard TEXT :=
    pg_catalog.current_setting('app.bypass_notifications_guard', TRUE);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT * INTO v_party
  FROM public.quantum_couple_parties AS party
  WHERE party.id = p_party_id
    AND party.partner_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'couple_invite_not_found';
  END IF;
  IF v_party.status <> 'pending_partner' OR v_party.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'couple_invite_not_active';
  END IF;

  UPDATE public.quantum_couple_parties
  SET status = 'ready', accepted_at = now(), updated_at = now()
  WHERE id = v_party.id
  RETURNING * INTO v_party;

  PERFORM pg_advisory_xact_lock(hashtextextended('quantum-couple-ready-queue', 72));

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (
    v_party.leader_user_id,
    'couple_party_accepted',
    jsonb_build_object('party_id', v_party.id, 'event_id', v_party.event_id)
  );

  SELECT * INTO v_other
  FROM public.quantum_couple_parties AS candidate
  WHERE candidate.status = 'ready'
    AND candidate.id <> v_party.id
    AND candidate.school_scope = v_party.school_scope
    AND candidate.leader_user_id NOT IN (v_party.leader_user_id, v_party.partner_user_id)
    AND candidate.partner_user_id NOT IN (v_party.leader_user_id, v_party.partner_user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.friendships AS friendship
      CROSS JOIN LATERAL (
        VALUES (candidate.leader_user_id), (candidate.partner_user_id)
      ) AS other_member(user_id)
      CROSS JOIN LATERAL (
        VALUES (v_party.leader_user_id), (v_party.partner_user_id)
      ) AS my_member(user_id)
      WHERE friendship.user_id = LEAST(other_member.user_id, my_member.user_id)
        AND friendship.friend_user_id = GREATEST(other_member.user_id, my_member.user_id)
        AND friendship.status = 'blocked'
    )
  ORDER BY candidate.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.quantum_couple_matches(
      pair_a_id,
      pair_b_id,
      participant_count,
      starts_at,
      location_name
    ) VALUES (
      v_other.id,
      v_party.id,
      4,
      private.next_quantum_couple_date_start(),
      '부산대 앞 보드게임 카페'
    )
    RETURNING * INTO v_match;

    UPDATE public.quantum_couple_parties
    SET status = 'matched', updated_at = now()
    WHERE id IN (v_other.id, v_party.id);

    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT member.user_id,
           'couple_party_matched',
           jsonb_build_object('party_id', member.party_id, 'event_id', 'scheduled-couple-double-date')
    FROM (
      VALUES
        (v_other.id, v_other.leader_user_id),
        (v_other.id, v_other.partner_user_id),
        (v_party.id, v_party.leader_user_id),
        (v_party.id, v_party.partner_user_id)
    ) AS member(party_id, user_id);
  END IF;

  PERFORM pg_catalog.set_config(
    'app.bypass_notifications_guard',
    COALESCE(v_previous_notifications_guard, ''),
    TRUE
  );
  RETURN public.get_my_quantum_couple_party();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.bypass_notifications_guard',
      COALESCE(v_previous_notifications_guard, ''),
      TRUE
    );
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_quantum_couple_party()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_party public.quantum_couple_parties%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT * INTO v_party
  FROM public.quantum_couple_parties AS party
  WHERE (party.leader_user_id = v_user_id OR party.partner_user_id = v_user_id)
    AND party.status IN ('pending_partner', 'ready', 'matched')
  ORDER BY party.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('cancelled', false); END IF;
  IF v_party.status = 'matched' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'couple_match_locked';
  END IF;

  UPDATE public.quantum_couple_parties
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = v_party.id;

  RETURN jsonb_build_object('cancelled', true, 'party_id', v_party.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_quantum_couple_party() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_quantum_couple_party(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_quantum_couple_party(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_quantum_couple_party() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_couple_party() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quantum_couple_party(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quantum_couple_party(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_quantum_couple_party() TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'quantum-couple-complete-due-matches';

    PERFORM cron.schedule(
      'quantum-couple-complete-due-matches',
      '*/5 * * * *',
      'SELECT public.cleanup_quantum_couple_state();'
    );
  END IF;
END
$$;

COMMIT;

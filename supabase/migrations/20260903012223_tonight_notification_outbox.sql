-- Durable, privacy-minimized notifications for the short Tonight journey gates.
-- Web Push is disabled at the application layer until an operator configures
-- TONIGHT_NOTIFICATIONS_ENABLED and VAPID. Campus Seven consent is not reused.

BEGIN;

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
    'couple_party_matched', 'couple_party_completed',
    'tonight_journey'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_tonight_journey_payload_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_tonight_journey_payload_check
  CHECK (
    kind <> 'tonight_journey'
    OR (
      NULLIF(payload ->> 'round_id', '') IS NOT NULL
      AND NULLIF(payload ->> 'event_type', '') IS NOT NULL
      AND NULLIF(payload ->> 'event_key', '') IS NOT NULL
      AND payload ->> 'audience' IN ('participant', 'partner')
      AND NOT (payload ?| ARRAY[
        'address', 'road_address', 'phone', 'display_name',
        'department', 'venue_name', 'latitude', 'longitude'
      ])
    )
  ) NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_tonight_journey_payload_check;

CREATE UNIQUE INDEX notifications_tonight_journey_event_unique_idx
  ON public.notifications (user_id, kind, (payload ->> 'event_key'))
  WHERE kind = 'tonight_journey';

CREATE TABLE public.tonight_notification_outbox (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('participant', 'partner')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'allocation_published', 'deposit_due', 'partner_acceptance_due',
    'venue_revealed', 'arrival_due'
  )),
  event_key TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(event_key)) BETWEEN 1 AND 240
  ),
  round_id UUID NOT NULL REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'delivered', 'failed', 'cancelled')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  notification_id UUID UNIQUE REFERENCES public.notifications(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR pg_catalog.length(last_error_code) <= 120
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipient_user_id, event_key),
  CONSTRAINT tonight_notification_outbox_delivery_state CHECK (
    (status = 'delivered' AND notification_id IS NOT NULL AND delivered_at IS NOT NULL AND locked_at IS NULL)
    OR (status = 'processing' AND locked_at IS NOT NULL AND notification_id IS NULL AND delivered_at IS NULL)
    OR (status IN ('pending', 'failed', 'cancelled') AND locked_at IS NULL AND delivered_at IS NULL)
  )
);

CREATE INDEX tonight_notification_outbox_claim_idx
  ON public.tonight_notification_outbox (available_at, scheduled_for, created_at)
  WHERE status IN ('pending', 'processing');

CREATE TABLE public.tonight_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (pg_catalog.length(endpoint) BETWEEN 32 AND 2048),
  p256dh TEXT NOT NULL CHECK (pg_catalog.length(p256dh) BETWEEN 32 AND 256),
  auth_secret TEXT NOT NULL CHECK (pg_catalog.length(auth_secret) BETWEEN 16 AND 128),
  consent_version TEXT NOT NULL CHECK (consent_version = '2026-09-03-tonight-v1'),
  consented_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT CHECK (user_agent IS NULL OR pg_catalog.length(user_agent) <= 512),
  last_success_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT CHECK (revoked_reason IS NULL OR pg_catalog.length(revoked_reason) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX tonight_push_subscriptions_active_user_idx
  ON public.tonight_push_subscriptions (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.tonight_push_deliveries (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.tonight_push_subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR pg_catalog.length(last_error_code) <= 120
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (notification_id, subscription_id),
  CONSTRAINT tonight_push_deliveries_state CHECK (
    (status = 'sent' AND sent_at IS NOT NULL AND locked_at IS NULL)
    OR (status = 'processing' AND locked_at IS NOT NULL AND sent_at IS NULL)
    OR (status IN ('pending', 'failed', 'cancelled') AND locked_at IS NULL AND sent_at IS NULL)
  )
);

CREATE INDEX tonight_push_deliveries_claim_idx
  ON public.tonight_push_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.tonight_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tonight_notification_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tonight_push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tonight_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tonight_notification_outbox TO service_role;
GRANT ALL ON TABLE public.tonight_push_subscriptions TO service_role;
GRANT ALL ON TABLE public.tonight_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_tonight_push_readiness()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.tonight_applications AS application
        JOIN public.tonight_rounds AS round_row ON round_row.id = application.round_id
        WHERE application.user_id = auth.uid()
          AND application.status IN ('submitted', 'allocated')
          AND round_row.status NOT IN ('completed', 'cancelled')
      )
      OR EXISTS (
        SELECT 1
        FROM public.venue_partner_memberships AS membership
        WHERE membership.user_id = auth.uid()
          AND membership.revoked_at IS NULL
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_tonight_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth_secret TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_consent_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_existing public.tonight_push_subscriptions%ROWTYPE;
  v_subscription_id UUID;
  v_active_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_consent_version IS DISTINCT FROM '2026-09-03-tonight-v1' THEN
    RAISE EXCEPTION 'explicit_tonight_consent_required';
  END IF;
  IF public.get_my_tonight_push_readiness() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'tonight_access_required';
  END IF;
  IF p_endpoint !~ '^https://'
    OR pg_catalog.length(p_endpoint) NOT BETWEEN 32 AND 2048
    OR pg_catalog.length(p_p256dh) NOT BETWEEN 32 AND 256
    OR pg_catalog.length(p_auth_secret) NOT BETWEEN 16 AND 128
    OR pg_catalog.length(COALESCE(p_user_agent, '')) > 512
  THEN
    RAISE EXCEPTION 'invalid_push_subscription';
  END IF;
  IF p_endpoint !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' THEN
    RAISE EXCEPTION 'unsupported_push_service';
  END IF;

  -- Serialize both the caller's slot count and ownership of this endpoint.
  -- This prevents concurrent registrations from bypassing the per-user cap or
  -- stealing an active endpoint from another account at ON CONFLICT time.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight_push_user:' || v_caller::TEXT, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight_push_endpoint:' || p_endpoint, 0)
  );

  SELECT subscription.* INTO v_existing
  FROM public.tonight_push_subscriptions AS subscription
  WHERE subscription.endpoint = p_endpoint
  FOR UPDATE;

  IF FOUND AND v_existing.user_id <> v_caller AND v_existing.revoked_at IS NULL THEN
    RAISE EXCEPTION 'subscription_owned_by_another_user';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER INTO v_active_count
  FROM public.tonight_push_subscriptions AS subscription
  WHERE subscription.user_id = v_caller
    AND subscription.revoked_at IS NULL
    AND subscription.endpoint <> p_endpoint;
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'tonight_push_subscription_limit_reached';
  END IF;

  INSERT INTO public.tonight_push_subscriptions (
    user_id, endpoint, p256dh, auth_secret, consent_version,
    consented_at, user_agent
  ) VALUES (
    v_caller, p_endpoint, p_p256dh, p_auth_secret, p_consent_version,
    CURRENT_TIMESTAMP, NULLIF(pg_catalog.btrim(p_user_agent), '')
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth_secret = EXCLUDED.auth_secret,
      consent_version = EXCLUDED.consent_version,
      consented_at = CURRENT_TIMESTAMP,
      user_agent = EXCLUDED.user_agent,
      revoked_at = NULL,
      revoked_reason = NULL,
      updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_subscription_id;

  RETURN v_subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_tonight_push_subscription(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INTEGER;
  v_subscription_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT subscription.id INTO v_subscription_id
  FROM public.tonight_push_subscriptions AS subscription
  WHERE subscription.user_id = v_caller
    AND subscription.endpoint = p_endpoint;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-push-subscription-delivery:' || v_subscription_id::TEXT,
      0
    )
  );

  WITH cancellable AS MATERIALIZED (
    SELECT delivery.id, delivery.revision
    FROM public.tonight_push_deliveries AS delivery
    WHERE delivery.subscription_id = v_subscription_id
      AND delivery.status IN ('pending', 'processing')
    ORDER BY delivery.created_at, delivery.id
    FOR UPDATE OF delivery
  )
  UPDATE public.tonight_push_deliveries AS delivery
  SET status = 'cancelled', locked_at = NULL, updated_at = CURRENT_TIMESTAMP
  FROM cancellable
  WHERE delivery.id = cancellable.id
    AND delivery.revision = cancellable.revision;

  UPDATE public.tonight_push_subscriptions AS subscription
  SET revoked_at = CURRENT_TIMESTAMP,
      revoked_reason = 'user_unsubscribed',
      updated_at = CURRENT_TIMESTAMP
  WHERE subscription.id = v_subscription_id
    AND subscription.user_id = v_caller
    AND subscription.revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_due_tonight_notifications(
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  WITH due_events AS (
    SELECT
      member.user_id AS recipient_user_id,
      'participant'::TEXT AS audience,
      'allocation_published'::TEXT AS event_type,
      'round:' || round_row.id::TEXT || ':team:' || team.id::TEXT || ':allocation_published' AS event_key,
      round_row.id AS round_id,
      team.id AS team_id,
      round_row.allocation_publish_at AS scheduled_for
    FROM public.tonight_team_members AS member
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
    WHERE round_row.allocation_publish_at <= p_now
      AND p_now < round_row.deposit_due_at
      AND round_row.status NOT IN ('completed', 'cancelled')
      AND team.status <> 'cancelled'
      AND member.member_status <> 'cancelled'

    UNION ALL

    SELECT
      member.user_id,
      'participant'::TEXT,
      'deposit_due'::TEXT,
      'round:' || round_row.id::TEXT || ':team:' || team.id::TEXT || ':user:' || member.user_id::TEXT || ':deposit_due',
      round_row.id,
      team.id,
      round_row.deposit_due_at - INTERVAL '5 minutes'
    FROM public.tonight_team_members AS member
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
    JOIN public.tonight_deposits AS deposit
      ON deposit.application_id = member.application_id
     AND deposit.user_id = member.user_id
    WHERE round_row.deposit_due_at - INTERVAL '5 minutes' <= p_now
      AND p_now < round_row.deposit_due_at
      AND round_row.status NOT IN ('completed', 'cancelled')
      AND team.status = 'deposit_pending'
      AND deposit.status IN ('initiated', 'pending')
      AND member.member_status <> 'cancelled'

    UNION ALL

    SELECT
      membership.user_id,
      'partner'::TEXT,
      'partner_acceptance_due'::TEXT,
      'round:' || round_row.id::TEXT || ':team:' || team.id::TEXT || ':venue:' || capacity.venue_id::TEXT || ':partner_acceptance_due',
      round_row.id,
      team.id,
      GREATEST(round_row.deposit_due_at - INTERVAL '5 minutes', team.updated_at)
    FROM public.tonight_teams AS team
    JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
    JOIN public.tonight_venue_capacities AS capacity ON capacity.id = team.venue_capacity_id
    JOIN public.venue_partner_memberships AS membership
      ON membership.venue_id = capacity.venue_id
     AND membership.revoked_at IS NULL
    WHERE team.status = 'partner_pending'
      AND p_now < round_row.partner_acceptance_due_at
      AND round_row.status NOT IN ('completed', 'cancelled')

    UNION ALL

    SELECT
      member.user_id,
      'participant'::TEXT,
      'venue_revealed'::TEXT,
      'round:' || round_row.id::TEXT || ':team:' || team.id::TEXT || ':venue_revealed',
      round_row.id,
      team.id,
      round_row.reveal_at
    FROM public.tonight_team_members AS member
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
    WHERE round_row.reveal_at <= p_now
      AND p_now <= round_row.starts_at
      AND round_row.status NOT IN ('completed', 'cancelled')
      AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
      AND member.member_status <> 'cancelled'

    UNION ALL

    SELECT
      member.user_id,
      'participant'::TEXT,
      'arrival_due'::TEXT,
      'round:' || round_row.id::TEXT || ':team:' || team.id::TEXT || ':arrival_due',
      round_row.id,
      team.id,
      round_row.arrival_at - INTERVAL '10 minutes'
    FROM public.tonight_team_members AS member
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
    WHERE round_row.arrival_at - INTERVAL '10 minutes' <= p_now
      AND p_now <= round_row.starts_at
      AND round_row.status NOT IN ('completed', 'cancelled')
      AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
      AND member.member_status <> 'cancelled'
  ), inserted AS (
    INSERT INTO public.tonight_notification_outbox (
      recipient_user_id, audience, event_type, event_key,
      round_id, team_id, scheduled_for, available_at
    )
    SELECT
      event.recipient_user_id, event.audience, event.event_type, event.event_key,
      event.round_id, event.team_id, event.scheduled_for,
      GREATEST(event.scheduled_for, p_now)
    FROM due_events AS event
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tonight_notification_outbox(
  p_limit INTEGER DEFAULT 100,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
  outbox_id UUID,
  outbox_revision INTEGER,
  recipient_user_id UUID,
  event_type TEXT,
  event_key TEXT,
  round_id UUID,
  team_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.id, outbox.revision
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.attempt_count < 8
      AND (
        (outbox.status = 'pending' AND outbox.available_at <= p_now)
        OR (outbox.status = 'processing' AND outbox.locked_at < p_now - INTERVAL '5 minutes')
      )
    ORDER BY outbox.available_at, outbox.scheduled_for, outbox.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
  ), claimed AS (
    UPDATE public.tonight_notification_outbox AS outbox
    SET status = 'processing',
        attempt_count = outbox.attempt_count + 1,
        locked_at = p_now,
        updated_at = p_now
    FROM candidates
    WHERE outbox.id = candidates.id
      AND outbox.revision = candidates.revision
    RETURNING outbox.*
  )
  SELECT claimed.id, claimed.revision, claimed.recipient_user_id, claimed.event_type,
         claimed.event_key, claimed.round_id, claimed.team_id
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tonight_notification_outbox(
  p_outbox_id UUID,
  p_expected_revision INTEGER,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outbox public.tonight_notification_outbox%ROWTYPE;
  v_notification_id UUID;
  v_updated INTEGER;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'invalid_notification_claim_revision';
  END IF;

  SELECT outbox.* INTO v_outbox
  FROM public.tonight_notification_outbox AS outbox
  WHERE outbox.id = p_outbox_id
    AND outbox.status = 'processing'
    AND outbox.revision = p_expected_revision
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'stale_notification_claim'; END IF;

  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    v_outbox.recipient_user_id,
    'tonight_journey',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'round_id', v_outbox.round_id,
      'team_id', v_outbox.team_id,
      'event_type', v_outbox.event_type,
      'event_key', v_outbox.event_key,
      'audience', v_outbox.audience,
      'scheduled_at', v_outbox.scheduled_for
    ))
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notification_id;

  IF v_notification_id IS NULL THEN
    SELECT notification.id INTO v_notification_id
    FROM public.notifications AS notification
    WHERE notification.user_id = v_outbox.recipient_user_id
      AND notification.kind = 'tonight_journey'
      AND notification.payload ->> 'event_key' = v_outbox.event_key;
  END IF;

  IF v_notification_id IS NULL THEN RAISE EXCEPTION 'tonight_notification_insert_failed'; END IF;

  INSERT INTO public.tonight_push_deliveries (
    notification_id, subscription_id, user_id, available_at
  )
  SELECT v_notification_id, subscription.id, v_outbox.recipient_user_id, p_now
  FROM public.tonight_push_subscriptions AS subscription
  WHERE subscription.user_id = v_outbox.recipient_user_id
    AND subscription.revoked_at IS NULL
  ON CONFLICT DO NOTHING;

  UPDATE public.tonight_notification_outbox AS outbox
  SET status = 'delivered', notification_id = v_notification_id,
      delivered_at = p_now, locked_at = NULL, last_error_code = NULL,
      updated_at = p_now
  WHERE outbox.id = p_outbox_id
    AND outbox.status = 'processing'
    AND outbox.revision = p_expected_revision;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN RAISE EXCEPTION 'stale_notification_claim'; END IF;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_tonight_notification_outbox(
  p_outbox_id UUID,
  p_expected_revision INTEGER,
  p_error_code TEXT DEFAULT NULL,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'invalid_notification_claim_revision';
  END IF;

  UPDATE public.tonight_notification_outbox AS outbox
  SET status = CASE WHEN outbox.attempt_count >= 8 THEN 'failed' ELSE 'pending' END,
      available_at = CASE
        WHEN outbox.attempt_count >= 8 THEN outbox.available_at
        ELSE p_now + INTERVAL '1 minute' * LEAST(
          pg_catalog.power(2, GREATEST(outbox.attempt_count - 1, 0)),
          30
        )
      END,
      locked_at = NULL,
      last_error_code = pg_catalog.left(COALESCE(p_error_code, 'delivery_failed'), 120),
      updated_at = p_now
  WHERE outbox.id = p_outbox_id
    AND outbox.status = 'processing'
    AND outbox.revision = p_expected_revision;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN RAISE EXCEPTION 'stale_notification_claim'; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tonight_notification_outbox_batch(
  p_outbox_ids UUID[],
  p_expected_revisions INTEGER[],
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_completed INTEGER := 0;
  v_claimed INTEGER := 0;
BEGIN
  IF p_outbox_ids IS NULL OR pg_catalog.cardinality(p_outbox_ids) = 0 THEN RETURN 0; END IF;
  IF p_expected_revisions IS NULL
     OR pg_catalog.cardinality(p_expected_revisions) <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'invalid_notification_claim_tokens';
  END IF;
  IF pg_catalog.cardinality(p_outbox_ids) > 1000 THEN
    RAISE EXCEPTION 'tonight_outbox_batch_too_large';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_expected_revisions) AS token(revision)
    WHERE token.revision IS NULL OR token.revision < 1
  ) OR (
    SELECT pg_catalog.count(DISTINCT claim_id)
    FROM pg_catalog.unnest(p_outbox_ids) AS input(claim_id)
  ) <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'invalid_notification_claim_tokens';
  END IF;

  PERFORM outbox.id
  FROM public.tonight_notification_outbox AS outbox
  JOIN pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
    ON outbox.id = p_outbox_ids[claim.position]
   AND outbox.revision = p_expected_revisions[claim.position]
  WHERE outbox.status = 'processing'
  ORDER BY outbox.created_at, outbox.id
  FOR UPDATE OF outbox;

  SELECT pg_catalog.count(*)::INTEGER INTO v_claimed
  FROM public.tonight_notification_outbox AS outbox
  JOIN pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
    ON outbox.id = p_outbox_ids[claim.position]
   AND outbox.revision = p_expected_revisions[claim.position]
  WHERE outbox.status = 'processing';
  IF v_claimed <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'stale_notification_claim';
  END IF;

  WITH locked AS MATERIALIZED (
    SELECT outbox.*
    FROM public.tonight_notification_outbox AS outbox
    JOIN pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
      ON outbox.id = p_outbox_ids[claim.position]
     AND outbox.revision = p_expected_revisions[claim.position]
    WHERE outbox.status = 'processing'
    ORDER BY outbox.created_at, outbox.id
    FOR UPDATE
  ), inserted AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT
      outbox.recipient_user_id,
      'tonight_journey',
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'round_id', outbox.round_id,
        'team_id', outbox.team_id,
        'event_type', outbox.event_type,
        'event_key', outbox.event_key,
        'audience', outbox.audience,
        'scheduled_at', outbox.scheduled_for
      ))
    FROM locked AS outbox
    ON CONFLICT DO NOTHING
    RETURNING id, user_id, payload
  ), notification_map AS MATERIALIZED (
    SELECT outbox.id AS outbox_id, inserted.id AS notification_id,
           outbox.recipient_user_id, outbox.revision AS expected_revision
    FROM locked AS outbox
    JOIN inserted
      ON inserted.user_id = outbox.recipient_user_id
     AND inserted.payload ->> 'event_key' = outbox.event_key

    UNION ALL

    SELECT outbox.id, notification.id, outbox.recipient_user_id, outbox.revision
    FROM locked AS outbox
    JOIN public.notifications AS notification
      ON notification.user_id = outbox.recipient_user_id
     AND notification.kind = 'tonight_journey'
     AND notification.payload ->> 'event_key' = outbox.event_key
    WHERE NOT EXISTS (
      SELECT 1
      FROM inserted
      WHERE inserted.user_id = outbox.recipient_user_id
        AND inserted.payload ->> 'event_key' = outbox.event_key
    )
  ), push_queued AS (
    INSERT INTO public.tonight_push_deliveries (
      notification_id, subscription_id, user_id, available_at
    )
    SELECT map.notification_id, subscription.id, map.recipient_user_id, p_now
    FROM notification_map AS map
    JOIN public.tonight_push_subscriptions AS subscription
      ON subscription.user_id = map.recipient_user_id
     AND subscription.revoked_at IS NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  ), completed AS (
    UPDATE public.tonight_notification_outbox AS outbox
    SET status = 'delivered', notification_id = map.notification_id,
        delivered_at = p_now, locked_at = NULL, last_error_code = NULL,
        updated_at = p_now
    FROM notification_map AS map
    WHERE outbox.id = map.outbox_id
      AND outbox.status = 'processing'
      AND outbox.revision = map.expected_revision
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_completed FROM completed;

  IF v_completed <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'stale_notification_claim';
  END IF;

  RETURN v_completed;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_tonight_notification_outbox_batch(
  p_outbox_ids UUID[],
  p_expected_revisions INTEGER[],
  p_error_code TEXT DEFAULT NULL,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_claimed INTEGER := 0;
BEGIN
  IF p_outbox_ids IS NULL OR pg_catalog.cardinality(p_outbox_ids) = 0 THEN RETURN 0; END IF;
  IF p_expected_revisions IS NULL
     OR pg_catalog.cardinality(p_expected_revisions) <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'invalid_notification_claim_tokens';
  END IF;
  IF pg_catalog.cardinality(p_outbox_ids) > 1000 THEN
    RAISE EXCEPTION 'tonight_outbox_batch_too_large';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_expected_revisions) AS token(revision)
    WHERE token.revision IS NULL OR token.revision < 1
  ) OR (
    SELECT pg_catalog.count(DISTINCT claim_id)
    FROM pg_catalog.unnest(p_outbox_ids) AS input(claim_id)
  ) <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'invalid_notification_claim_tokens';
  END IF;

  PERFORM outbox.id
  FROM public.tonight_notification_outbox AS outbox
  JOIN pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
    ON outbox.id = p_outbox_ids[claim.position]
   AND outbox.revision = p_expected_revisions[claim.position]
  WHERE outbox.status = 'processing'
  ORDER BY outbox.created_at, outbox.id
  FOR UPDATE OF outbox;

  SELECT pg_catalog.count(*)::INTEGER INTO v_claimed
  FROM public.tonight_notification_outbox AS outbox
  JOIN pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
    ON outbox.id = p_outbox_ids[claim.position]
   AND outbox.revision = p_expected_revisions[claim.position]
  WHERE outbox.status = 'processing';
  IF v_claimed <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'stale_notification_claim';
  END IF;

  UPDATE public.tonight_notification_outbox AS outbox
  SET status = CASE WHEN outbox.attempt_count >= 8 THEN 'failed' ELSE 'pending' END,
      available_at = CASE
        WHEN outbox.attempt_count >= 8 THEN outbox.available_at
        ELSE p_now + INTERVAL '1 minute' * LEAST(
          pg_catalog.power(2, GREATEST(outbox.attempt_count - 1, 0)),
          30
        )
      END,
      locked_at = NULL,
      last_error_code = pg_catalog.left(COALESCE(p_error_code, 'delivery_failed'), 120),
      updated_at = p_now
  FROM pg_catalog.generate_subscripts(p_outbox_ids, 1) AS claim(position)
  WHERE outbox.id = p_outbox_ids[claim.position]
    AND outbox.status = 'processing'
    AND outbox.revision = p_expected_revisions[claim.position];
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> pg_catalog.cardinality(p_outbox_ids) THEN
    RAISE EXCEPTION 'stale_notification_claim';
  END IF;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tonight_push_deliveries(
  p_limit INTEGER DEFAULT 50,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
  delivery_id UUID,
  delivery_revision INTEGER,
  subscription_id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth_secret TEXT,
  notification_id UUID,
  event_type TEXT,
  audience TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id, delivery.revision
    FROM public.tonight_push_deliveries AS delivery
    JOIN public.tonight_push_subscriptions AS subscription
      ON subscription.id = delivery.subscription_id
     AND subscription.revoked_at IS NULL
    WHERE delivery.attempt_count < 5
      AND (
        (delivery.status = 'pending' AND delivery.available_at <= p_now)
        OR (delivery.status = 'processing' AND delivery.locked_at < p_now - INTERVAL '5 minutes')
      )
    ORDER BY delivery.available_at, delivery.created_at
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
  ), claimed AS (
    UPDATE public.tonight_push_deliveries AS delivery
    SET status = 'processing', attempt_count = delivery.attempt_count + 1,
        locked_at = p_now, updated_at = p_now
    FROM candidates
    WHERE delivery.id = candidates.id
      AND delivery.revision = candidates.revision
    RETURNING delivery.*
  )
  SELECT claimed.id, claimed.revision, subscription.id, subscription.endpoint,
         subscription.p256dh, subscription.auth_secret,
         claimed.notification_id,
         notification.payload ->> 'event_type',
         notification.payload ->> 'audience'
  FROM claimed
  JOIN public.tonight_push_subscriptions AS subscription
    ON subscription.id = claimed.subscription_id
   AND subscription.revoked_at IS NULL
  JOIN public.notifications AS notification ON notification.id = claimed.notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tonight_push_delivery(
  p_delivery_id UUID,
  p_expected_revision INTEGER,
  p_succeeded BOOLEAN,
  p_error_code TEXT DEFAULT NULL,
  p_revoke_subscription BOOLEAN DEFAULT FALSE,
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.tonight_push_deliveries%ROWTYPE;
  v_updated INTEGER;
  v_subscription_id UUID;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'invalid_push_claim_revision';
  END IF;

  SELECT delivery.subscription_id INTO v_subscription_id
  FROM public.tonight_push_deliveries AS delivery
  WHERE delivery.id = p_delivery_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_push_claim'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-push-subscription-delivery:' || v_subscription_id::TEXT,
      0
    )
  );

  SELECT delivery.* INTO v_delivery
  FROM public.tonight_push_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
    AND delivery.status = 'processing'
    AND delivery.revision = p_expected_revision
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_push_claim'; END IF;

  IF COALESCE(p_succeeded, FALSE) THEN
    UPDATE public.tonight_push_deliveries AS delivery
    SET status = 'sent', sent_at = p_now, locked_at = NULL,
        last_error_code = NULL, updated_at = p_now
    WHERE delivery.id = p_delivery_id
      AND delivery.status = 'processing'
      AND delivery.revision = p_expected_revision;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN RAISE EXCEPTION 'stale_push_claim'; END IF;

    UPDATE public.tonight_push_subscriptions AS subscription
    SET last_success_at = p_now, updated_at = p_now
    WHERE subscription.id = v_delivery.subscription_id;
  ELSE
    UPDATE public.tonight_push_deliveries AS delivery
    SET status = CASE
          WHEN COALESCE(p_revoke_subscription, FALSE) OR delivery.attempt_count >= 5 THEN 'failed'
          ELSE 'pending'
        END,
        available_at = CASE
          WHEN COALESCE(p_revoke_subscription, FALSE) OR delivery.attempt_count >= 5 THEN delivery.available_at
          ELSE p_now + INTERVAL '1 minute' * LEAST(
            pg_catalog.power(2, GREATEST(delivery.attempt_count - 1, 0)),
            30
          )
        END,
        locked_at = NULL,
        last_error_code = pg_catalog.left(COALESCE(p_error_code, 'push_failed'), 120),
        updated_at = p_now
    WHERE delivery.id = p_delivery_id
      AND delivery.status = 'processing'
      AND delivery.revision = p_expected_revision;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN RAISE EXCEPTION 'stale_push_claim'; END IF;
  END IF;

  IF COALESCE(p_revoke_subscription, FALSE) THEN
    UPDATE public.tonight_push_subscriptions AS subscription
    SET revoked_at = p_now,
        revoked_reason = pg_catalog.left(COALESCE(p_error_code, 'push_endpoint_gone'), 120),
        updated_at = p_now
    WHERE subscription.id = v_delivery.subscription_id
      AND subscription.revoked_at IS NULL;

    WITH siblings AS MATERIALIZED (
      SELECT delivery.id, delivery.revision
      FROM public.tonight_push_deliveries AS delivery
      WHERE delivery.subscription_id = v_delivery.subscription_id
        AND delivery.status IN ('pending', 'processing')
        AND delivery.id <> p_delivery_id
      ORDER BY delivery.created_at, delivery.id
      FOR UPDATE OF delivery
    )
    UPDATE public.tonight_push_deliveries AS delivery
    SET status = 'cancelled', locked_at = NULL, updated_at = p_now
    FROM siblings
    WHERE delivery.id = siblings.id
      AND delivery.revision = siblings.revision;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tonight_push_readiness() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_my_tonight_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_tonight_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tonight_push_readiness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_tonight_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_tonight_push_subscription(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.enqueue_due_tonight_notifications(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_tonight_notification_outbox(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tonight_notification_outbox(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_tonight_notification_outbox(UUID, INTEGER, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tonight_notification_outbox_batch(UUID[], INTEGER[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_tonight_notification_outbox_batch(UUID[], INTEGER[], TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_tonight_push_deliveries(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tonight_push_delivery(UUID, INTEGER, BOOLEAN, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_tonight_notifications(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_tonight_notification_outbox(INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tonight_notification_outbox(UUID, INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_tonight_notification_outbox(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tonight_notification_outbox_batch(UUID[], INTEGER[], TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_tonight_notification_outbox_batch(UUID[], INTEGER[], TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_tonight_push_deliveries(INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tonight_push_delivery(UUID, INTEGER, BOOLEAN, TEXT, BOOLEAN, TIMESTAMPTZ) TO service_role;

COMMENT ON TABLE public.tonight_notification_outbox IS
  'Durable idempotent queue for Tonight participant and partner deadline notifications. Payload identifiers exclude venue and user PII.';
COMMENT ON TABLE public.tonight_push_subscriptions IS
  'Explicit Tonight-only Web Push consent. Campus Seven subscriptions are intentionally not inherited.';

COMMIT;

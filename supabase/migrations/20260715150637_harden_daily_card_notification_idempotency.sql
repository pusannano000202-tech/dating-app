-- Migration: harden daily-card notification idempotency
-- Purpose:
--   Keep GET /api/notifications read-only and make explicit daily-card syncs
--   safe under concurrent requests.

BEGIN;

LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM public.notifications
 WHERE kind = 'daily_card_available'
   AND (
     NULLIF(payload ->> 'match_id', '') IS NULL
     OR NULLIF(payload ->> 'day_offset', '') IS NULL
   );

WITH ranked_daily_card_notifications AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id,
                        payload ->> 'match_id',
                        payload ->> 'day_offset'
           ORDER BY (read_at IS NULL) DESC,
                    created_at DESC,
                    id DESC
         ) AS duplicate_rank
    FROM public.notifications
   WHERE kind = 'daily_card_available'
)
DELETE FROM public.notifications n
 USING ranked_daily_card_notifications ranked
 WHERE n.id = ranked.id
   AND ranked.duplicate_rank > 1;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_daily_card_payload_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_daily_card_payload_check
  CHECK (
    kind <> 'daily_card_available'
    OR (
      NULLIF(payload ->> 'match_id', '') IS NOT NULL
      AND NULLIF(payload ->> 'day_offset', '') IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_daily_card_payload_check;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_daily_card_available_unique_idx
  ON public.notifications (
    user_id,
    kind,
    (payload ->> 'match_id'),
    (payload ->> 'day_offset')
  )
  WHERE kind = 'daily_card_available';

CREATE OR REPLACE FUNCTION public.notify_available_daily_cards(
  p_match_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INT := 0;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF pg_catalog.to_regclass('public.match_daily_card_schedule') IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);

  WITH available_cards AS (
    SELECT DISTINCT
           s.match_id,
           s.viewer_group_id,
           s.day_offset,
           COALESCE(s.reveal_window_start, s.reveal_at) AS reveal_window_start,
           COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') AS reveal_window_end
      FROM public.match_daily_card_schedule s
     WHERE (p_match_id IS NULL OR s.match_id = p_match_id)
       AND s.selected_at IS NULL
       AND s.forfeited_at IS NULL
       AND COALESCE(s.reveal_window_start, s.reveal_at) <= pg_catalog.now()
       AND COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') >= pg_catalog.now()
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT gm.user_id,
           'daily_card_available',
           jsonb_build_object(
             'match_id', ac.match_id,
             'day_offset', ac.day_offset,
             'reveal_window_start', ac.reveal_window_start,
             'reveal_window_end', ac.reveal_window_end
           )
      FROM available_cards ac
      JOIN public.group_members gm
        ON gm.group_id = ac.viewer_group_id
       AND gm.left_at IS NULL
       AND gm.user_id = v_user_id
     WHERE TRUE
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_inserted;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_available_daily_cards(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_available_daily_cards(UUID) TO authenticated;

COMMENT ON FUNCTION public.notify_available_daily_cards(UUID) IS
  'Creates at most one daily_card_available notification for the current user, match, and day.';

COMMIT;

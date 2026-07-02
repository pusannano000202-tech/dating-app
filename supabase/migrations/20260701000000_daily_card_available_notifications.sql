-- Migration: daily-card availability notifications
-- Purpose:
--   Allow in-app notifications for the daily card draw window and provide a
--   safe per-user helper that can be called by the notifications API.
-- Notes:
--   This does not create a cron job by itself. A separate service-role
--   scheduler helper can be added later if global fan-out is needed.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed',
    'attendance_confirmed', 'no_show_confirmed',
    'daily_card_available'
  ));

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
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.notifications n
        WHERE n.user_id = gm.user_id
          AND n.kind = 'daily_card_available'
          AND n.payload ->> 'match_id' = ac.match_id::TEXT
          AND n.payload ->> 'day_offset' = ac.day_offset::TEXT
     )
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
  'Creates one in-app daily_card_available notification for the current user/match/day when the 16:00-20:00 card draw window is open.';

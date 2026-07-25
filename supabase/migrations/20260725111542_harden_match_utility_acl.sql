BEGIN;

-- Functions receive an implicit PUBLIC EXECUTE grant at creation time. Keep
-- future public functions closed until a migration deliberately grants access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- These helpers are reached by trusted database routines and triggers. They
-- must not remain callable through the Data API by arbitrary signed-in users.
REVOKE ALL ON FUNCTION public.get_match_meeting_info(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_match_scheduled_reveal_at(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lazy_complete_match(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_match_members(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

-- These jobs are invoked only by trusted cron or server-side automation.
REVOKE ALL ON FUNCTION public.enqueue_meeting_reminders()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_overdue_friend_requests()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_meeting_reminders()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_overdue_friend_requests()
  TO service_role;

-- Pair exclusions are an internal matching input, never a Data API resource.
REVOKE ALL ON TABLE public.excluded_pairs
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.excluded_pairs TO service_role;

-- The RLS predicate needs authenticated callers, but callers must not use it
-- to probe whether another user belongs to an arbitrary match.
CREATE OR REPLACE FUNCTION public.can_access_match_chat(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.matches AS match_row
      WHERE match_row.id = p_match_id
        AND match_row.status IN ('confirmed', 'completed')
        AND match_row.approval_status = 'approved'
        AND (
          EXISTS (
            SELECT 1
              FROM public.group_members AS group_member
             WHERE group_member.group_id = match_row.group_a_id
               AND group_member.user_id = p_user_id
               AND group_member.left_at IS NULL
          )
          OR EXISTS (
            SELECT 1
              FROM public.group_members AS group_member
             WHERE group_member.group_id = match_row.group_b_id
               AND group_member.user_id = p_user_id
               AND group_member.left_at IS NULL
          )
        )
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

ALTER FUNCTION public.can_access_match_chat(UUID, UUID)
  SET search_path = '';
REVOKE ALL ON FUNCTION public.can_access_match_chat(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_match_chat(UUID, UUID)
  TO authenticated;

COMMIT;

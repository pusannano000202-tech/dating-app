BEGIN;

CREATE OR REPLACE FUNCTION public.get_meeting_evidence_context(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  is_participant BOOLEAN,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role TEXT := COALESCE(
    auth.jwt() ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', TRUE),
    ''
  );
BEGIN
  IF v_request_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_match_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_meeting_evidence_context';
  END IF;

  RETURN QUERY
  SELECT
    match_row.id,
    match_row.group_a_id,
    match_row.group_b_id,
    EXISTS (
      SELECT 1
      FROM public.group_members AS member
      WHERE member.group_id IN (match_row.group_a_id, match_row.group_b_id)
        AND member.user_id = p_user_id
        AND member.left_at IS NULL
    ),
    meeting_row.scheduled_start,
    meeting_row.scheduled_end
  FROM public.matches AS match_row
  LEFT JOIN LATERAL (
    SELECT meeting.scheduled_start, meeting.scheduled_end
    FROM public.match_meetings AS meeting
    WHERE meeting.match_id = match_row.id
      AND meeting.status <> 'cancelled'
    ORDER BY meeting.scheduled_start DESC, meeting.id DESC
    LIMIT 1
  ) AS meeting_row ON TRUE
  WHERE match_row.id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meeting_evidence_context(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meeting_evidence_context(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.get_meeting_evidence_context(UUID, UUID) IS
  'Service-only participant and schedule lookup for private meeting evidence APIs.';

COMMIT;

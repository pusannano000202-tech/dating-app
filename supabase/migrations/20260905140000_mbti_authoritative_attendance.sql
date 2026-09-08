-- Minimal service-only projection used by the consent-gated MBTI attendance
-- snapshot. It exposes identifiers and attendance truth only; no roster alias,
-- contact field, venue detail, or free text crosses this boundary.

CREATE OR REPLACE FUNCTION public.service_list_authoritative_mbti_attendance(
  p_after_source_kind TEXT DEFAULT NULL,
  p_after_occurrence_id UUID DEFAULT NULL,
  p_after_participant_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  source_kind TEXT,
  occurrence_id UUID,
  participant_user_id UUID,
  authoritative BOOLEAN,
  attended BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid_attendance_page_limit';
  END IF;
  IF (p_after_source_kind IS NULL) <> (p_after_occurrence_id IS NULL)
     OR (p_after_source_kind IS NULL) <> (p_after_participant_user_id IS NULL)
     OR (p_after_source_kind IS NOT NULL
       AND p_after_source_kind NOT IN ('continuation', 'tonight_team', 'weekly')) THEN
    RAISE EXCEPTION 'invalid_attendance_cursor';
  END IF;

  RETURN QUERY
  WITH valid_tonight_teams AS (
    SELECT team.id
    FROM public.tonight_teams AS team
    JOIN public.tonight_partner_service_confirmations AS confirmation
      ON confirmation.team_id = team.id
    WHERE team.status = 'completed'
      AND team.member_count IN (5, 6)
      AND confirmation.service_completed_at <= pg_catalog.statement_timestamp()
      AND (
        SELECT pg_catalog.count(*)
        FROM public.tonight_team_members AS member_count
        WHERE member_count.team_id = team.id
      ) = team.member_count
      AND (
        SELECT pg_catalog.count(*)
        FROM public.tonight_team_members AS member_with_attendance
        JOIN public.tonight_attendance AS attendance_count
          ON attendance_count.team_id = member_with_attendance.team_id
         AND attendance_count.application_id = member_with_attendance.application_id
        WHERE member_with_attendance.team_id = team.id
      ) = team.member_count
      AND NOT EXISTS (
        SELECT 1
        FROM public.tonight_attendance AS pending_attendance
        WHERE pending_attendance.team_id = team.id
          AND pending_attendance.status = 'pending'
      )
      AND confirmation.confirmed_attendee_count = (
        SELECT pg_catalog.count(*)::SMALLINT
        FROM public.tonight_attendance AS arrived_attendance
        WHERE arrived_attendance.team_id = team.id
          AND arrived_attendance.status = 'arrived'
      )
      AND confirmation.observed_arrived_count = (
        SELECT pg_catalog.count(*)::SMALLINT
        FROM public.tonight_attendance AS observed_attendance
        WHERE observed_attendance.team_id = team.id
          AND observed_attendance.status = 'arrived'
      )
  ), authoritative_attendance AS (
    SELECT
      'continuation'::TEXT AS source_kind,
      member.occurrence_id,
      member.participant_user_id,
      TRUE AS authoritative,
      TRUE AS attended
    FROM public.quantum_continuation_occurrence_members AS member
    JOIN public.quantum_continuation_occurrences AS occurrence
      ON occurrence.id = member.occurrence_id
    WHERE member.attendance_status = 'present'
      AND member.attendance_resolution_id IS NOT NULL
      AND occurrence.status IN ('confirmed', 'in_progress', 'completed')
      AND occurrence.starts_at <= pg_catalog.statement_timestamp()

    UNION ALL

    SELECT
      'tonight_team'::TEXT,
      member.team_id,
      member.user_id,
      TRUE,
      TRUE
    FROM valid_tonight_teams AS valid_team
    JOIN public.tonight_team_members AS member ON member.team_id = valid_team.id
    JOIN public.tonight_attendance AS attendance
      ON attendance.team_id = member.team_id
     AND attendance.application_id = member.application_id
    WHERE attendance.status = 'arrived'

    UNION ALL

    SELECT
      'weekly'::TEXT,
      resolution.occurrence_id,
      resolution.participant_user_id,
      TRUE,
      TRUE
    FROM public.quantum_weekly_attendance_resolutions AS resolution
    JOIN public.quantum_event_occurrences AS occurrence
      ON occurrence.id = resolution.occurrence_id
    WHERE resolution.attendance_status = 'present'
      AND occurrence.event_mode = 'scheduled'
      AND occurrence.status IN ('confirmed', 'completed')
      AND occurrence.starts_at <= pg_catalog.statement_timestamp()
  )
  SELECT
    candidate.source_kind,
    candidate.occurrence_id,
    candidate.participant_user_id,
    candidate.authoritative,
    candidate.attended
  FROM authoritative_attendance AS candidate
  WHERE p_after_source_kind IS NULL
     OR (candidate.source_kind, candidate.occurrence_id, candidate.participant_user_id)
        > (p_after_source_kind, p_after_occurrence_id, p_after_participant_user_id)
  ORDER BY candidate.source_kind, candidate.occurrence_id, candidate.participant_user_id
  LIMIT p_limit;
END
$$;

REVOKE ALL ON FUNCTION public.service_list_authoritative_mbti_attendance(TEXT, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_list_authoritative_mbti_attendance(TEXT, UUID, UUID, INTEGER)
  TO service_role;

-- Any committed change that can alter the attendance projection invalidates the
-- current public snapshot. Statement-level triggers avoid per-row epoch churn.
CREATE TRIGGER community_mbti_cont_occurrences_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.quantum_continuation_occurrences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_continuation_occurrences_update_source_epoch
AFTER UPDATE ON public.quantum_continuation_occurrences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_continuation_members_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.quantum_continuation_occurrence_members
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_continuation_members_update_source_epoch
AFTER UPDATE ON public.quantum_continuation_occurrence_members
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_teams_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.tonight_teams
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_teams_update_source_epoch
AFTER UPDATE ON public.tonight_teams
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_team_members_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.tonight_team_members
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_team_members_update_source_epoch
AFTER UPDATE ON public.tonight_team_members
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_attendance_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.tonight_attendance
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_attendance_update_source_epoch
AFTER UPDATE ON public.tonight_attendance
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_confirmations_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.tonight_partner_service_confirmations
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_tonight_confirmations_update_source_epoch
AFTER UPDATE ON public.tonight_partner_service_confirmations
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_weekly_resolutions_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.quantum_weekly_attendance_resolutions
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_weekly_resolutions_update_source_epoch
AFTER UPDATE ON public.quantum_weekly_attendance_resolutions
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_weekly_occurrences_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.quantum_event_occurrences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_weekly_occurrences_update_source_epoch
AFTER UPDATE ON public.quantum_event_occurrences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

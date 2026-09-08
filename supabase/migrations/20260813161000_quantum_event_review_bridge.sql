-- Let completed Quantum event participants submit reviews without legacy group membership.

CREATE OR REPLACE FUNCTION public.submit_review(
  p_match_id UUID,
  p_overall_score INTEGER,
  p_reported_issues TEXT[],
  p_comment TEXT
)
RETURNS TABLE (
  review_id UUID,
  match_id UUID,
  target_group_id UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_in_a BOOLEAN := FALSE;
  v_in_b BOOLEAN := FALSE;
  v_event_gender TEXT;
  v_target_group UUID;
  v_review_id UUID;
  v_issue TEXT;
  v_allowed_issues CONSTANT TEXT[] := ARRAY[
    'no_show',
    'profile_mismatch',
    'inappropriate_behavior',
    'good_match'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_overall_score IS NULL OR p_overall_score < 1 OR p_overall_score > 5 THEN
    RAISE EXCEPTION 'invalid_overall_score';
  END IF;

  IF p_comment IS NOT NULL
    AND pg_catalog.char_length(pg_catalog.btrim(p_comment)) > 500 THEN
    RAISE EXCEPTION 'comment_too_long';
  END IF;

  IF p_reported_issues IS NOT NULL THEN
    FOREACH v_issue IN ARRAY p_reported_issues LOOP
      IF NOT (v_issue = ANY (v_allowed_issues)) THEN
        RAISE EXCEPTION 'invalid_reported_issue: %', v_issue;
      END IF;
    END LOOP;
  END IF;

  SELECT match_row.*
    INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = v_match.group_a_id
      AND member.user_id = v_caller
      AND member.left_at IS NULL
  ) INTO v_in_a;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = v_match.group_b_id
      AND member.user_id = v_caller
      AND member.left_at IS NULL
  ) INTO v_in_b;

  IF NOT v_in_a AND NOT v_in_b THEN
    SELECT event_member.gender
      INTO v_event_gender
    FROM public.quantum_event_match_members AS event_member
    WHERE event_member.match_id = p_match_id
      AND event_member.user_id = v_caller;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_match_participant';
    END IF;

    SELECT CASE v_event_gender
      WHEN 'male' THEN occurrence.female_group_id
      WHEN 'female' THEN occurrence.male_group_id
      ELSE NULL
    END
      INTO v_target_group
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.match_id = p_match_id;

    IF v_target_group IS NULL THEN
      RAISE EXCEPTION 'match_group_unavailable';
    END IF;
  ELSE
    v_target_group := CASE
      WHEN v_in_a THEN v_match.group_b_id
      ELSE v_match.group_a_id
    END;
  END IF;

  INSERT INTO public.reviews (
    match_id,
    reviewer_user_id,
    target_group_id,
    overall_score,
    reported_issues,
    comment
  )
  VALUES (
    p_match_id,
    v_caller,
    v_target_group,
    p_overall_score,
    COALESCE(p_reported_issues, ARRAY[]::TEXT[]),
    NULLIF(pg_catalog.btrim(p_comment), '')
  )
  RETURNING id INTO v_review_id;

  RETURN QUERY SELECT v_review_id, p_match_id, v_target_group;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(UUID, INTEGER, TEXT[], TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(UUID, INTEGER, TEXT[], TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.submit_review(UUID, INTEGER, TEXT[], TEXT) IS
  'Submits one post-completion review for a legacy or Quantum event participant.';

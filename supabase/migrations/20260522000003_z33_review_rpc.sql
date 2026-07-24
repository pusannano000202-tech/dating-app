-- Migration: 매칭 후 review RPC
-- Owner:  충현
-- Decision: 만남 종료(matches.status='completed') 후 본인이 상대 그룹에 대해 review 작성/조회
-- Date:   2026-05-22
--
-- RPC:
--   1. submit_review(p_match_id, p_overall_score, p_reported_issues, p_comment)
--        - 본인이 매칭 참여자(active 멤버) 여야 함
--        - matches.status = 'completed' 여야 함 (no_show/cancelled 도 허용 - 미정 → 'completed' 만)
--        - reviews.unique (match_id, reviewer_user_id, target_group_id) 로 1회만 제출
--        - reported_issues 는 enum 텍스트 배열 ('no_show', 'profile_mismatch', 'inappropriate_behavior', 'good_match')
--   2. get_my_reviews(p_match_id?) - 본인이 작성한 review 또는 본인이 참여한 매칭의 모든 review 조회
--        - p_match_id 미지정시 본인 작성 전체 반환

CREATE OR REPLACE FUNCTION public.submit_review(
  p_match_id UUID,
  p_overall_score INT,
  p_reported_issues TEXT[],
  p_comment TEXT
)
RETURNS TABLE (
  review_id UUID,
  match_id UUID,
  target_group_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_in_a BOOLEAN;
  v_in_b BOOLEAN;
  v_target_group UUID;
  v_review_id UUID;
  v_issue TEXT;
  v_allowed_issues CONSTANT TEXT[] := ARRAY['no_show','profile_mismatch','inappropriate_behavior','good_match'];
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_overall_score IS NULL OR p_overall_score < 1 OR p_overall_score > 5 THEN
    RAISE EXCEPTION 'invalid_overall_score';
  END IF;

  IF p_reported_issues IS NOT NULL THEN
    FOREACH v_issue IN ARRAY p_reported_issues LOOP
      IF NOT (v_issue = ANY (v_allowed_issues)) THEN
        RAISE EXCEPTION 'invalid_reported_issue: %', v_issue;
      END IF;
    END LOOP;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_a_id
       AND user_id = v_caller
       AND left_at IS NULL
  ) INTO v_in_a;

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_b_id
       AND user_id = v_caller
       AND left_at IS NULL
  ) INTO v_in_b;

  IF NOT v_in_a AND NOT v_in_b THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  v_target_group := CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  -- review insert (RLS: reviews_self_write WITH CHECK reviewer_user_id = auth.uid())
  INSERT INTO reviews (match_id, reviewer_user_id, target_group_id, overall_score, reported_issues, comment)
  VALUES (
    p_match_id,
    v_caller,
    v_target_group,
    p_overall_score,
    COALESCE(p_reported_issues, ARRAY[]::TEXT[]),
    p_comment
  )
  RETURNING id INTO v_review_id;

  RETURN QUERY SELECT v_review_id, p_match_id, v_target_group;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_review(UUID, INT, TEXT[], TEXT) TO authenticated;

-- 본인 review 조회 (단건 또는 본인 참여 매칭 전체)
CREATE OR REPLACE FUNCTION public.get_my_reviews(
  p_match_id UUID DEFAULT NULL
)
RETURNS TABLE (
  review_id UUID,
  match_id UUID,
  reviewer_user_id UUID,
  target_group_id UUID,
  overall_score INT,
  reported_issues TEXT[],
  comment TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.match_id,
    r.reviewer_user_id,
    r.target_group_id,
    r.overall_score,
    r.reported_issues,
    r.comment,
    r.created_at
  FROM reviews r
  WHERE r.reviewer_user_id = v_caller
    AND (p_match_id IS NULL OR r.match_id = p_match_id)
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_reviews(UUID) TO authenticated;

COMMENT ON FUNCTION public.submit_review(UUID, INT, TEXT[], TEXT) IS
  '본인 참여 completed 매칭에 대해 상대 그룹 review 제출. unique 제약으로 1회만 가능.';
COMMENT ON FUNCTION public.get_my_reviews(UUID) IS
  '본인이 작성한 review 조회. p_match_id 지정 시 해당 매칭의 본인 review 만.';

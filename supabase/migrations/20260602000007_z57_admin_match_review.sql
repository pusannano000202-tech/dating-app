-- Migration: 운영자 매칭 리뷰(보고 + 승인/거절) RPC
-- Owner:  충현
-- Plan:   docs/plans/2026-06-02-operator-console-plan.md (Phase 2·3, ①②)
-- Date:   2026-06-02
--
-- 전제: z55 (matches.approval_status, admin_create_pending_match)
-- 변경:
--   1. admin_list_pending_matches  — 리뷰 대기 매칭 + 양 그룹 요약 + 점수/근거
--   2. admin_get_match_review       — 단일 매칭 상세 (양 그룹 멤버 프로필 + 근거)
--   3. admin_review_match           — 승인/거절 (거절 시 풀 복귀 + 선택적 excluded_pairs)

-- ─────────────────────────────────────────────
-- 1) 리뷰 대기 목록
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_pending_matches()
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  group_a_gender TEXT,
  group_b_gender TEXT,
  group_a_size INT,
  group_b_size INT,
  score FLOAT,
  score_breakdown JSONB,
  is_forced BOOLEAN,
  matched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.group_a_id,
    m.group_b_id,
    ga.gender::TEXT,
    gb.gender::TEXT,
    ga.size,
    gb.size,
    m.score,
    m.score_breakdown,
    m.is_forced,
    m.matched_at
  FROM matches m
  JOIN groups ga ON ga.id = m.group_a_id
  JOIN groups gb ON gb.id = m.group_b_id
  WHERE m.approval_status = 'pending_review'
  ORDER BY m.matched_at DESC NULLS LAST, m.score DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_matches() TO authenticated;

-- ─────────────────────────────────────────────
-- 2) 단일 매칭 상세 (근거 + 양 그룹 멤버 프로필)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_match_review(p_match_id UUID)
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  status TEXT,
  approval_status TEXT,
  is_forced BOOLEAN,
  score FLOAT,
  score_breakdown JSONB,
  matched_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  group_a_members JSONB,
  group_b_members JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  RETURN QUERY
  SELECT
    v_match.id,
    v_match.group_a_id,
    v_match.group_b_id,
    v_match.status::TEXT,
    v_match.approval_status,
    v_match.is_forced,
    v_match.score,
    v_match.score_breakdown,
    v_match.matched_at,
    v_match.reviewed_at,
    v_match.review_reason,
    public._admin_group_members_json(v_match.group_a_id),
    public._admin_group_members_json(v_match.group_b_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_match_review(UUID) TO authenticated;

-- 그룹 멤버 프로필 JSON 헬퍼 (운영자 전용 — 내부 호출만)
CREATE OR REPLACE FUNCTION public._admin_group_members_json(p_group_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'display_name', p.display_name,
        'age', p.age,
        'gender', p.gender,
        'school', p.school,
        'department', p.department,
        'appearance_type', p.appearance_type,
        'effective_score', p.self_appearance_score,
        'score_source', p.self_appearance_score_source,
        'primary_photo_url', (
          SELECT ph.public_url FROM photos ph
           WHERE ph.user_id = p.user_id
           ORDER BY ph.sort_order LIMIT 1
        )
      )
      ORDER BY gm.joined_at
    ),
    '[]'::jsonb
  )
  FROM group_members gm
  JOIN profiles p ON p.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL;
$$;

-- ─────────────────────────────────────────────
-- 3) 승인 / 거절
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_review_match(
  p_match_id    UUID,
  p_decision    TEXT,                  -- 'approve' | 'reject'
  p_reason      TEXT DEFAULT NULL,
  p_add_excluded BOOLEAN DEFAULT FALSE -- 거절 시 재매칭 방지 등록 (D3)
)
RETURNS TABLE (
  match_id UUID,
  approval_status TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_a UUID;
  v_b UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.approval_status <> 'pending_review' THEN
    RAISE EXCEPTION 'not_pending_review';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE matches
       SET approval_status = 'approved',
           reviewed_by = v_caller,
           reviewed_at = NOW(),
           review_reason = p_reason
     WHERE id = p_match_id;
  ELSE
    -- 거절: 매칭 취소 (z38 트리거가 양 그룹 status='ready' 로 복귀시킴)
    UPDATE matches
       SET approval_status = 'rejected',
           status = 'cancelled',
           reviewed_by = v_caller,
           reviewed_at = NOW(),
           review_reason = p_reason
     WHERE id = p_match_id;

    IF p_add_excluded THEN
      v_a := LEAST(v_match.group_a_id, v_match.group_b_id);
      v_b := GREATEST(v_match.group_a_id, v_match.group_b_id);
      INSERT INTO excluded_pairs (group_a_id, group_b_id, reason)
      VALUES (v_a, v_b, 'manual_block')
      ON CONFLICT (group_a_id, group_b_id) DO NOTHING;
    END IF;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  RETURN QUERY SELECT v_match.id, v_match.approval_status, v_match.status::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_match(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.admin_list_pending_matches() IS
  '운영자: 승인 대기(pending_review) 매칭 + 양 그룹 요약 + 점수/근거.';
COMMENT ON FUNCTION public.admin_get_match_review(UUID) IS
  '운영자: 단일 매칭 상세 + 양 그룹 멤버 프로필(근거 판단용).';
COMMENT ON FUNCTION public.admin_review_match(UUID, TEXT, TEXT, BOOLEAN) IS
  '운영자: 매칭 승인/거절. 거절 시 매칭 취소(그룹 풀 복귀) + 선택적 excluded_pairs 등록.';

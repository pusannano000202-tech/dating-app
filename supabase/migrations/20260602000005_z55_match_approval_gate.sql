-- Migration: 매칭 승인 게이트(운영자 휴먼인더루프) + 런타임 설정 테이블
-- Owner:  충현
-- Plan:   docs/plans/2026-06-02-operator-console-plan.md (D1, D2, D5 / Phase 0·2)
-- Date:   2026-06-02
--
-- 변경:
--   1. app_config (key-value 런타임 설정) + get/set RPC. seed: match_requires_approval=true
--   2. matches.approval_status('pending_review'|'approved'|'rejected') + 리뷰 메타 컬럼
--   3. matches SELECT RLS: 일반 사용자는 approved 만, 운영자는 전부
--   4. get_my_matches / get_match_detail 에 approval 게이트 추가 (현 정의 보존 + 필터)
--   5. admin_create_pending_match: 운영자/배치가 리뷰 대기 매칭 생성
--
-- 참고: z38 트리거는 AFTER UPDATE 만 → pending_review INSERT 는 groups.status 영향 없음.

-- ─────────────────────────────────────────────
-- 1) app_config (런타임 토글)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_admin_read" ON public.app_config;
CREATE POLICY "app_config_admin_read" ON public.app_config
  FOR SELECT TO authenticated
  USING (
    current_setting('app.bypass_app_config_guard', TRUE) = 'on'
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "app_config_no_direct_write" ON public.app_config;
CREATE POLICY "app_config_no_direct_write" ON public.app_config
  FOR ALL TO authenticated
  USING (current_setting('app.bypass_app_config_guard', TRUE) = 'on')
  WITH CHECK (current_setting('app.bypass_app_config_guard', TRUE) = 'on');

-- seed (이미 있으면 보존)
INSERT INTO public.app_config (key, value)
VALUES ('match_requires_approval', to_jsonb(TRUE))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_app_config(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT value INTO v_value FROM app_config WHERE key = p_key;
  RETURN v_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_app_config(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_app_config(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  PERFORM set_config('app.bypass_app_config_guard', 'on', TRUE);
  INSERT INTO app_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = v_caller,
        updated_at = NOW();
  PERFORM set_config('app.bypass_app_config_guard', 'off', TRUE);

  RETURN p_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_app_config(TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────
-- 2) matches 승인 컬럼
-- ─────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason  TEXT;

COMMENT ON COLUMN public.matches.approval_status IS
  '운영자 승인 게이트. pending_review=리뷰 대기(사용자 비노출), approved=노출, rejected=거절. 기존 행 default approved.';

-- ─────────────────────────────────────────────
-- 3) matches SELECT RLS: 사용자는 approved 만, admin 은 전부
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "matches_participant_read" ON matches;
CREATE POLICY "matches_participant_read" ON matches
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      approval_status = 'approved'
      AND (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_a_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_b_id AND user_id = auth.uid())
      )
    )
  );

-- ─────────────────────────────────────────────
-- 4) get_my_matches 재정의 (z37 본문 + approval 필터)
--    SHAPE 동일 → CREATE OR REPLACE
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  venue_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  FOR v_match_id IN
    SELECT m.id FROM matches m
     WHERE m.status = 'confirmed'
       AND m.approval_status = 'approved'
       AND (EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = v_caller AND left_at IS NULL)
         OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = v_caller AND left_at IS NULL))
  LOOP
    PERFORM public.lazy_complete_match(v_match_id);
  END LOOP;

  RETURN QUERY
  SELECT
    m.id,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_id ELSE m.group_b_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_id ELSE m.group_a_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.size ELSE ga.size END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.gender::TEXT ELSE ga.gender::TEXT END,
    m.status::TEXT,
    m.matched_at,
    m.confirmed_at,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_confirmed_at ELSE m.group_b_confirmed_at END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_confirmed_at ELSE m.group_a_confirmed_at END,
    mi.scheduled_start,
    mi.venue_name
  FROM matches m
  JOIN groups ga ON ga.id = m.group_a_id
  JOIN groups gb ON gb.id = m.group_b_id
  LEFT JOIN group_members ga_member
    ON ga_member.group_id = m.group_a_id
   AND ga_member.user_id = v_caller
   AND ga_member.left_at IS NULL
  LEFT JOIN group_members gb_member
    ON gb_member.group_id = m.group_b_id
   AND gb_member.user_id = v_caller
   AND gb_member.left_at IS NULL
  LEFT JOIN LATERAL public.get_match_meeting_info(m.id) mi ON TRUE
  WHERE m.approval_status = 'approved'
    AND (ga_member.user_id IS NOT NULL OR gb_member.user_id IS NOT NULL)
  ORDER BY m.matched_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;

-- ─────────────────────────────────────────────
-- 5) get_match_detail 재정의 (z51 본문 + approval 게이트)
--    SHAPE 동일 → CREATE OR REPLACE
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_match_detail(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  venue_name TEXT,
  venue_address TEXT,
  venue_map_url TEXT,
  my_card_submitted_at TIMESTAMPTZ,
  my_card_content_text TEXT,
  my_group_active_count INT,
  my_group_card_submitted_count INT,
  my_group_deposit_paid_count INT,
  my_group_ready BOOLEAN,
  opp_group_active_count INT,
  opp_group_card_submitted_count INT,
  opp_group_deposit_paid_count INT,
  opp_group_ready BOOLEAN
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
  v_my_group_id UUID;
  v_opp_group_id UUID;
  v_ga groups%ROWTYPE;
  v_gb groups%ROWTYPE;
  v_scheduled_start TIMESTAMPTZ;
  v_scheduled_end TIMESTAMPTZ;
  v_venue_name TEXT;
  v_venue_address TEXT;
  v_venue_map_url TEXT;
  v_my_active_count INT;
  v_my_card_count INT;
  v_my_deposit_count INT;
  v_opp_active_count INT;
  v_opp_card_count INT;
  v_opp_deposit_count INT;
  v_my_card_submitted_at TIMESTAMPTZ;
  v_my_card_content_text TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.lazy_complete_match(p_match_id);

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- 승인 게이트: 미승인 매칭은 운영자만 상세 조회 가능
  IF v_match.approval_status <> 'approved' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'match_not_found';
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

  v_my_group_id := CASE WHEN v_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END;
  v_opp_group_id := CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  SELECT * INTO v_ga FROM groups WHERE id = v_match.group_a_id;
  SELECT * INTO v_gb FROM groups WHERE id = v_match.group_b_id;
  SELECT
    mi.scheduled_start,
    mi.scheduled_end,
    mi.venue_name,
    mi.venue_address,
    mi.venue_map_url
    INTO
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url
    FROM public.get_match_meeting_info(p_match_id) mi;

  SELECT COUNT(*) INTO v_my_active_count
    FROM group_members
   WHERE group_id = v_my_group_id
     AND left_at IS NULL;

  SELECT COUNT(*) INTO v_opp_active_count
    FROM group_members
   WHERE group_id = v_opp_group_id
     AND left_at IS NULL;

  SELECT COUNT(DISTINCT mcs.user_id) INTO v_my_card_count
    FROM match_card_submissions mcs
    JOIN group_members gm
      ON gm.group_id = v_my_group_id
     AND gm.user_id = mcs.user_id
     AND gm.left_at IS NULL
   WHERE mcs.match_id = p_match_id
     AND mcs.group_id = v_my_group_id;

  SELECT COUNT(DISTINCT mcs.user_id) INTO v_opp_card_count
    FROM match_card_submissions mcs
    JOIN group_members gm
      ON gm.group_id = v_opp_group_id
     AND gm.user_id = mcs.user_id
     AND gm.left_at IS NULL
   WHERE mcs.match_id = p_match_id
     AND mcs.group_id = v_opp_group_id;

  SELECT COUNT(DISTINCT d.user_id) INTO v_my_deposit_count
    FROM deposits d
    JOIN group_members gm
      ON gm.group_id = v_my_group_id
     AND gm.user_id = d.user_id
     AND gm.left_at IS NULL
   WHERE d.group_id = v_my_group_id
     AND d.status IN ('paid', 'held');

  SELECT COUNT(DISTINCT d.user_id) INTO v_opp_deposit_count
    FROM deposits d
    JOIN group_members gm
      ON gm.group_id = v_opp_group_id
     AND gm.user_id = d.user_id
     AND gm.left_at IS NULL
   WHERE d.group_id = v_opp_group_id
     AND d.status IN ('paid', 'held');

  SELECT mcs.updated_at, mcs.content_text
    INTO v_my_card_submitted_at, v_my_card_content_text
    FROM match_card_submissions mcs
   WHERE mcs.match_id = p_match_id
     AND mcs.user_id = v_caller;

  RETURN QUERY
  SELECT
    v_match.id,
    v_my_group_id,
    v_opp_group_id,
    CASE WHEN v_in_a THEN v_gb.size ELSE v_ga.size END,
    CASE WHEN v_in_a THEN v_gb.gender::TEXT ELSE v_ga.gender::TEXT END,
    v_match.status::TEXT,
    v_match.matched_at,
    v_match.confirmed_at,
    v_match.completed_at,
    CASE WHEN v_in_a THEN v_match.group_a_confirmed_at ELSE v_match.group_b_confirmed_at END,
    CASE WHEN v_in_a THEN v_match.group_b_confirmed_at ELSE v_match.group_a_confirmed_at END,
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url,
    v_my_card_submitted_at,
    v_my_card_content_text,
    v_my_active_count,
    v_my_card_count,
    v_my_deposit_count,
    v_my_active_count > 0
      AND v_my_card_count >= v_my_active_count
      AND v_my_deposit_count >= v_my_active_count,
    v_opp_active_count,
    v_opp_card_count,
    v_opp_deposit_count,
    v_opp_active_count > 0
      AND v_opp_card_count >= v_opp_active_count
      AND v_opp_deposit_count >= v_opp_active_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 6) admin_create_pending_match: 운영자/배치가 매칭 생성
--    approval_status 는 match_requires_approval 플래그를 따름
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_pending_match(
  p_group_a       UUID,
  p_group_b       UUID,
  p_score         FLOAT DEFAULT NULL,
  p_breakdown     JSONB DEFAULT NULL,
  p_is_forced     BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_a UUID;
  v_b UUID;
  v_requires_approval BOOLEAN;
  v_approval TEXT;
  v_match_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  IF p_group_a IS NULL OR p_group_b IS NULL OR p_group_a = p_group_b THEN
    RAISE EXCEPTION 'invalid_groups';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_a)
     OR NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_b) THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  -- group_a_id < group_b_id 정규화 (core table 규약)
  IF p_group_a < p_group_b THEN
    v_a := p_group_a; v_b := p_group_b;
  ELSE
    v_a := p_group_b; v_b := p_group_a;
  END IF;

  v_requires_approval := COALESCE(
    (SELECT value = to_jsonb(TRUE) FROM app_config WHERE key = 'match_requires_approval'),
    TRUE
  );
  v_approval := CASE WHEN v_requires_approval THEN 'pending_review' ELSE 'approved' END;

  INSERT INTO matches (group_a_id, group_b_id, score, score_breakdown, is_forced, status, approval_status, matched_at)
  VALUES (v_a, v_b, p_score, p_breakdown, p_is_forced, 'pending', v_approval, NOW())
  RETURNING id INTO v_match_id;

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_pending_match(UUID, UUID, FLOAT, JSONB, BOOLEAN) TO authenticated;

COMMENT ON TABLE public.app_config IS '런타임 운영 설정 키-값. 운영자만 읽기/쓰기.';
COMMENT ON FUNCTION public.admin_create_pending_match(UUID, UUID, FLOAT, JSONB, BOOLEAN) IS
  '운영자/배치가 매칭 생성. match_requires_approval=true 면 pending_review 로 생성되어 사용자 비노출.';

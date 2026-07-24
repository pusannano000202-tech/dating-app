-- Migration: 운영자 외모 점수 보정 RPC + 이력 + 프로필 조회
-- Owner:  충현
-- Plan:   docs/plans/2026-06-02-operator-console-plan.md (Phase 1, ③)
-- Date:   2026-06-02
--
-- 전제: z13 에서 profiles.self_appearance_score_{auto,override,source,updated_at} 이미 존재.
--       effective = COALESCE(override, auto, legacy). 본 마이그는 그 위 운영자 레이어.
--
-- 변경:
--   1. appearance_score_audits (보정 이력: 누가·언제·왜)
--   2. admin_set_appearance_override / admin_clear_appearance_override
--   3. admin_get_user_profile (사진 + auto/override/effective 점수 한 번에)

-- ─────────────────────────────────────────────
-- 1) 보정 이력
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appearance_score_audits (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prev_effective FLOAT,
  new_effective  FLOAT,
  source        TEXT NOT NULL CHECK (source IN ('admin_override', 'cleared')),
  admin_user_id UUID REFERENCES public.users(id),
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appearance_score_audits_user_idx
  ON public.appearance_score_audits(user_id, created_at DESC);

ALTER TABLE public.appearance_score_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asa_admin_read" ON public.appearance_score_audits;
CREATE POLICY "asa_admin_read" ON public.appearance_score_audits
  FOR SELECT TO authenticated
  USING (
    current_setting('app.bypass_asa_guard', TRUE) = 'on'
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "asa_no_direct_write" ON public.appearance_score_audits;
CREATE POLICY "asa_no_direct_write" ON public.appearance_score_audits
  FOR ALL TO authenticated
  USING (current_setting('app.bypass_asa_guard', TRUE) = 'on')
  WITH CHECK (current_setting('app.bypass_asa_guard', TRUE) = 'on');

-- ─────────────────────────────────────────────
-- 2) 보정 설정 / 해제
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_appearance_override(
  p_user_id UUID,
  p_score   FLOAT,
  p_reason  TEXT DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_prev FLOAT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT self_appearance_score INTO v_prev FROM profiles WHERE user_id = p_user_id;

  UPDATE profiles
     SET self_appearance_score          = p_score,
         self_appearance_score_override = p_score,
         self_appearance_score_source   = 'override',
         self_appearance_score_updated_at = NOW()
   WHERE user_id = p_user_id;

  PERFORM set_config('app.bypass_asa_guard', 'on', TRUE);
  INSERT INTO appearance_score_audits (user_id, prev_effective, new_effective, source, admin_user_id, reason)
  VALUES (p_user_id, v_prev, p_score, 'admin_override', v_caller, p_reason);
  PERFORM set_config('app.bypass_asa_guard', 'off', TRUE);

  RETURN p_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_clear_appearance_override(
  p_user_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_prev FLOAT;
  v_auto FLOAT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT self_appearance_score, self_appearance_score_auto
    INTO v_prev, v_auto
    FROM profiles WHERE user_id = p_user_id;

  UPDATE profiles
     SET self_appearance_score          = v_auto,   -- auto 로 복귀 (없으면 NULL)
         self_appearance_score_override = NULL,
         self_appearance_score_source   = CASE WHEN v_auto IS NOT NULL THEN 'auto' ELSE 'legacy' END,
         self_appearance_score_updated_at = NOW()
   WHERE user_id = p_user_id;

  PERFORM set_config('app.bypass_asa_guard', 'on', TRUE);
  INSERT INTO appearance_score_audits (user_id, prev_effective, new_effective, source, admin_user_id, reason)
  VALUES (p_user_id, v_prev, v_auto, 'cleared', v_caller, p_reason);
  PERFORM set_config('app.bypass_asa_guard', 'off', TRUE);

  RETURN v_auto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 3) 운영자용 프로필 조회 (사진 + 점수)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  gender TEXT,
  age INT,
  school TEXT,
  department TEXT,
  appearance_type TEXT,
  is_profile_complete BOOLEAN,
  effective_score FLOAT,
  score_auto FLOAT,
  score_override FLOAT,
  score_source TEXT,
  score_updated_at TIMESTAMPTZ,
  appearance_score_normalized FLOAT,
  photo_urls TEXT[]
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
    p.user_id,
    p.display_name,
    p.gender::TEXT,
    p.age,
    p.school,
    p.department,
    p.appearance_type::TEXT,
    p.is_profile_complete,
    p.self_appearance_score,
    p.self_appearance_score_auto,
    p.self_appearance_score_override,
    p.self_appearance_score_source,
    p.self_appearance_score_updated_at,
    p.appearance_score_normalized,
    COALESCE(
      (SELECT array_agg(ph.public_url ORDER BY ph.sort_order)
         FROM photos ph WHERE ph.user_id = p.user_id),
      ARRAY[]::TEXT[]
    )
  FROM profiles p
  WHERE p.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(UUID) TO authenticated;

COMMENT ON TABLE public.appearance_score_audits IS '운영자 외모 점수 보정 이력 (감사 로그).';
COMMENT ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT) IS
  '운영자 외모 점수 보정. effective + override 갱신, source=override, audit 기록.';
COMMENT ON FUNCTION public.admin_get_user_profile(UUID) IS
  '운영자용 프로필 + 사진 + auto/override/effective 점수 조회. is_admin 전용.';

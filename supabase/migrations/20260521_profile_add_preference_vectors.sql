-- Migration: profiles 에 이상형 월드컵 결과 컬럼 추가 + worldcup_choice_logs 테이블 신설
-- Owner: 충현
-- Ref:    docs/MATCHING_SYSTEM_PLAN.md 3-2 절
--         docs/APPEARANCE_ANALYSIS_SCHEMA.md
--         lib/appearance/preference.ts PreferenceResult 구조
-- Date:   2026-05-21
--
-- 영향:
--   - profiles 에 preferred_* 9개 컬럼 추가
--   - 신규: worldcup_choice_logs
--   - INTERFACE_CONTRACT.md 의 MatchingProfile 인터페이스도 확장 필요 (PR 별도)
--
-- 사용자 노출 금지 컬럼:
--   - 모든 preferred_* 벡터 raw 값
--   - worldcup_choice_logs 전체

-- ─────────────────────────────────────────────
-- profiles 확장
-- ─────────────────────────────────────────────
ALTER TABLE profiles
  -- 1. 사용자가 선택한 winner 들의 measured_vector 가중 평균
  ADD COLUMN preferred_appearance_vector        JSONB,
  -- 2. preferred - pool_mean (풀 쏠림 보정, 절대값 기준)
  ADD COLUMN preferred_appearance_delta_vector  JSONB,
  -- 3. 모든 winner-loser choice_delta 의 가중 평균
  ADD COLUMN preferred_choice_delta_vector      JSONB,
  -- 4. 풀 분포 내 percentile (0~100). 청순 쏠림 보정 핵심
  ADD COLUMN preferred_axis_percentile_vector   JSONB,
  -- 5. 풀 mean/std 기준 z-score
  ADD COLUMN preferred_axis_z_vector            JSONB,
  -- 6. winner 들의 measured_score 통계 {mean, min, max}
  ADD COLUMN preferred_score_range              JSONB,
  -- 7. winner final_bucket 빈도 (정규화)
  ADD COLUMN preferred_bucket_weights           JSONB,
  -- 8. 사용자가 본 풀의 mean vector (디버깅 / 변환 재현용)
  ADD COLUMN worldcup_pool_mean_vector          JSONB,
  -- 9. 사용자가 본 풀의 축별 통계 (z-score 재계산 가능)
  ADD COLUMN worldcup_pool_axis_stats           JSONB,
  -- 월드컵 완료 시각
  ADD COLUMN worldcup_completed_at              TIMESTAMPTZ;

COMMENT ON COLUMN profiles.preferred_appearance_vector       IS '이상형 월드컵 winner 벡터 가중 평균. 사용자 노출 금지.';
COMMENT ON COLUMN profiles.preferred_appearance_delta_vector IS 'preferred - pool_mean. 풀 쏠림 보정.';
COMMENT ON COLUMN profiles.preferred_choice_delta_vector     IS 'winner-loser delta 가중 평균. 보조 신호.';
COMMENT ON COLUMN profiles.preferred_axis_percentile_vector  IS '풀 분포 내 위치 0~100. 매칭 핵심 입력.';
COMMENT ON COLUMN profiles.preferred_axis_z_vector           IS '풀 mean/std 기준 z-score. 매칭 핵심 입력.';
COMMENT ON COLUMN profiles.preferred_score_range             IS '{mean, min, max} 사용자가 선호한 점수대.';
COMMENT ON COLUMN profiles.preferred_bucket_weights          IS '8 버킷 빈도 분포. 노출 가능 (유형 표시용).';
COMMENT ON COLUMN profiles.worldcup_pool_mean_vector         IS '월드컵 시점 풀 평균 (디버깅).';
COMMENT ON COLUMN profiles.worldcup_pool_axis_stats          IS '월드컵 시점 풀 축별 통계 (재계산용).';
COMMENT ON COLUMN profiles.worldcup_completed_at             IS '이상형 월드컵 완료 시각.';

-- ─────────────────────────────────────────────
-- worldcup_choice_logs: 사용자의 매 선택 로그
-- 매칭 엔진 디버깅 + 향후 ML 학습 데이터로도 활용 가능
-- ─────────────────────────────────────────────
CREATE TABLE worldcup_choice_logs (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 같은 user 가 월드컵 재시도 시 batch 묶음
  worldcup_session_id   UUID NOT NULL,
  round                 TEXT NOT NULL CHECK (round IN (
                          '64강', '32강', '16강', '8강', '4강', '결승', '최종우승'
                        )),
  match_index           INT NOT NULL,
  winner_id             TEXT NOT NULL,          -- "FI06" 같은 이미지 ID
  loser_id              TEXT NOT NULL,
  winner_vector         JSONB NOT NULL,
  loser_vector          JSONB NOT NULL,
  choice_delta_vector   JSONB NOT NULL,
  weight                REAL NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wcl_user       ON worldcup_choice_logs(user_id);
CREATE INDEX idx_wcl_session    ON worldcup_choice_logs(worldcup_session_id);
CREATE INDEX idx_wcl_user_round ON worldcup_choice_logs(user_id, round);

COMMENT ON TABLE worldcup_choice_logs IS '사용자가 이상형 월드컵에서 한 모든 라운드 선택 로그. 사용자 노출 금지.';

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE worldcup_choice_logs ENABLE ROW LEVEL SECURITY;

-- 본인만 select. write 는 service_role 또는 본인.
CREATE POLICY "wcl_self_read" ON worldcup_choice_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "wcl_self_write" ON worldcup_choice_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 사용자 노출 안전을 위한 view (raw vector 숨김)
-- 매칭 엔진은 profiles 직접 read, UI 는 이 view 만 read 권장
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW profiles_public AS
SELECT
  user_id,
  gender,
  age,
  height,
  body_type,
  hair_density,
  school,
  department,
  year,
  appearance_type,
  -- 노출 가능한 요약만
  preferred_bucket_weights,
  worldcup_completed_at,
  is_profile_complete,
  updated_at
FROM profiles;

COMMENT ON VIEW profiles_public IS '사용자 노출 안전 view. raw 벡터/점수는 모두 제외.';

-- z49: 성준 상대 성격 선호 벡터 저장 컬럼
-- 작성자: Codex
--
-- 목적:
--   Big5 본인 성격과 별개로 "내가 끌리는 상대 성격"을 저장한다.
--   raw vector는 매칭 엔진 입력이고, UI에는 primary/secondary 타입만 노출한다.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_personality_vector JSONB,
  ADD COLUMN IF NOT EXISTS preferred_personality_delta_vector JSONB,
  ADD COLUMN IF NOT EXISTS preferred_personality_type_weights JSONB,
  ADD COLUMN IF NOT EXISTS preferred_personality_primary_type TEXT,
  ADD COLUMN IF NOT EXISTS preferred_personality_secondary_type TEXT,
  ADD COLUMN IF NOT EXISTS personality_preference_answer_logs JSONB,
  ADD COLUMN IF NOT EXISTS personality_preference_confidence REAL,
  ADD COLUMN IF NOT EXISTS personality_preference_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.preferred_personality_vector IS
  '사용자가 선호하는 상대 성격 5축 벡터. 사용자 노출 금지.';
COMMENT ON COLUMN public.profiles.preferred_personality_delta_vector IS
  'preferred_personality_vector - self_personality_vector. 사용자 노출 금지.';
COMMENT ON COLUMN public.profiles.preferred_personality_type_weights IS
  '성준 성격 유형 8개 가중치. 내부 계산용.';
COMMENT ON COLUMN public.profiles.preferred_personality_primary_type IS
  '사용자에게 노출 가능한 1순위 선호 상대 성격 유형.';
COMMENT ON COLUMN public.profiles.preferred_personality_secondary_type IS
  '사용자에게 노출 가능한 2순위 선호 상대 성격 유형. 차이가 크면 NULL.';
COMMENT ON COLUMN public.profiles.personality_preference_answer_logs IS
  '상대 성격 선호 설문 답변 로그. 사용자 노출 금지.';
COMMENT ON COLUMN public.profiles.personality_preference_confidence IS
  '상대 성격 선호 벡터 신뢰도 0~1.';
COMMENT ON COLUMN public.profiles.personality_preference_completed_at IS
  '상대 성격 선호 설문 완료 시각.';

CREATE OR REPLACE VIEW public.profiles_public AS
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
  preferred_bucket_weights,
  worldcup_completed_at,
  preferred_personality_primary_type,
  preferred_personality_secondary_type,
  personality_preference_completed_at,
  is_profile_complete,
  updated_at
FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  '사용자 노출 안전 view. raw 벡터/점수는 제외하고 공개 가능한 요약만 포함.';

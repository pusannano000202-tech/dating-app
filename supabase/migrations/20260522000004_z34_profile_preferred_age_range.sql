-- Migration: 선호 나이 범위 컬럼 추가
-- Owner:  충현 (성준 영역의 매칭 엔진도 본 컬럼을 읽음 → 인터페이스 계약 갱신 필요)
-- Decision: "웬만하면 같은 나이대" 가 사용자 일반 선호. 기본값 본인 나이 ±3.
--           사용자가 명시적으로 폭을 넓힐 수 있도록 preference 단계에서 슬라이더 노출.
-- Date:   2026-05-22
--
-- 컬럼:
--   preferred_age_min INT  -- 매칭 가능한 상대 그룹 평균 나이 하한 (포함)
--   preferred_age_max INT  -- 매칭 가능한 상대 그룹 평균 나이 상한 (포함)
--
-- 검증:
--   - 둘 다 NULL 허용 (구버전 프로필 호환)
--   - NOT NULL 시 18 ~ 60 사이, min <= max
--   - 새로 입력하는 프로필은 client/RPC 에서 본인 나이 ±3 기본값으로 채움
--
-- 매칭 엔진 활용 (성준 영역, 본 마이그 이후 적용):
--   pair_score 에 age_fit 컴포넌트 추가
--   |me.avg_age - opp.avg_age| 가 (my_pref_max - my_pref_min)/2 안이면 1.0
--   밖이면 부드럽게 감소 (SOFT_AGE_DECAY=5 살 마다 0 으로 수렴)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_age_min INT
    CHECK (preferred_age_min IS NULL OR (preferred_age_min BETWEEN 18 AND 60)),
  ADD COLUMN IF NOT EXISTS preferred_age_max INT
    CHECK (preferred_age_max IS NULL OR (preferred_age_max BETWEEN 18 AND 60));

-- min <= max 제약
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_age_range_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_age_range_check
  CHECK (
    preferred_age_min IS NULL
    OR preferred_age_max IS NULL
    OR preferred_age_min <= preferred_age_max
  );

-- 기존 프로필 backfill: 본인 나이 -3 ~ +3 (자연수, 하한 18)
UPDATE profiles
   SET preferred_age_min = GREATEST(18, age - 3),
       preferred_age_max = LEAST(60, age + 3)
 WHERE preferred_age_min IS NULL
   AND preferred_age_max IS NULL
   AND age IS NOT NULL;

COMMENT ON COLUMN profiles.preferred_age_min IS
  '선호 상대 나이 하한 (포함, 18-60). 기본값 본인 나이 -3, 최소 18.';
COMMENT ON COLUMN profiles.preferred_age_max IS
  '선호 상대 나이 상한 (포함, 18-60). 기본값 본인 나이 +3, 최대 60.';

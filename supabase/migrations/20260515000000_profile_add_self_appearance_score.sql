-- [충현] 자기유사 월드컵 결과 저장용 컬럼 추가
-- 매칭 엔진이 사용할 예정: A의 preferred_appearance_vector vs B의 self_appearance_score
-- 사용자에게는 절대 노출하지 않는다.
-- ⚠️  이 마이그레이션은 성준 리뷰 후 main 머지할 것 (INTERFACE_CONTRACT.md 참고)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_appearance_score FLOAT
    CHECK (self_appearance_score BETWEEN 0 AND 100);

COMMENT ON COLUMN profiles.self_appearance_score IS
  '자기유사 월드컵 결과. 백분위 점수(0~100). 내부 알고리즘 전용 — 사용자에게 절대 노출 금지.';

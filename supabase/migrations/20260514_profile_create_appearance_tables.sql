-- 충현 담당: appearance_scores 테이블 생성
-- profiles 테이블은 성준과 공용이므로 별도 마이그레이션으로 분리 예정
-- @성준 이 파일 머지 전 확인 필요

-- users 테이블이 먼저 존재한다고 가정 (인증 세팅 시 생성)
CREATE TABLE IF NOT EXISTS appearance_scores (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score_raw     FLOAT NOT NULL CHECK (score_raw >= 0 AND score_raw <= 100),
  model_version TEXT,
  scored_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 충현만 읽기/쓰기. 성준은 접근 금지. (INTERFACE_CONTRACT.md 참고)
ALTER TABLE appearance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON appearance_scores
  USING (auth.role() = 'service_role');

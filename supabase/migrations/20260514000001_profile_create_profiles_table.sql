-- 충현 담당: profiles 테이블 생성
-- 성준의 매칭 엔진이 읽는 컬럼 포함 → @성준 머지 전 확인 필수
-- 컬럼명/타입 변경 금지 (INTERFACE_CONTRACT.md)

CREATE TABLE IF NOT EXISTS profiles (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gender         TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age            INT NOT NULL,
  height         INT,
  body_type      TEXT CHECK (body_type IN ('slim', 'average', 'athletic', 'chubby')),
  hair_density   TEXT CHECK (hair_density IN ('full', 'thinning', 'bald')),
  school         TEXT NOT NULL,
  department     TEXT,
  year           INT CHECK (year BETWEEN 1 AND 6),
  appearance_type TEXT CHECK (appearance_type IN (
                   'cute', 'pure', 'chic', 'warm', 'stylish', 'healthy'
                 )),

  -- 성준의 매칭 엔진이 직접 읽는 핵심 컬럼
  appearance_score_normalized  FLOAT CHECK (appearance_score_normalized BETWEEN 0 AND 1),
  big5_openness                FLOAT CHECK (big5_openness BETWEEN 0 AND 1),
  big5_conscientiousness       FLOAT CHECK (big5_conscientiousness BETWEEN 0 AND 1),
  big5_extraversion            FLOAT CHECK (big5_extraversion BETWEEN 0 AND 1),
  big5_agreeableness           FLOAT CHECK (big5_agreeableness BETWEEN 0 AND 1),
  big5_neuroticism             FLOAT CHECK (big5_neuroticism BETWEEN 0 AND 1),

  -- 성준의 매칭 필터가 읽는 JSONB 컬럼 (형식: INTERFACE_CONTRACT.md 3번 참고)
  available_timeslots   JSONB,
  -- 성준의 점수 계산이 읽는 JSONB 컬럼 (형식: INTERFACE_CONTRACT.md 4번 참고)
  preference_weights    JSONB,

  is_profile_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필만 읽기/쓰기
CREATE POLICY "owner_rw" ON profiles
  FOR ALL USING (auth.uid() = user_id);

-- service_role (AI 서버, 매칭 엔진)은 전체 접근 허용
CREATE POLICY "service_role_all" ON profiles
  USING (auth.role() = 'service_role');

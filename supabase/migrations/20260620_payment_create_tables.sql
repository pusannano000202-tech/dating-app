-- 결제 연결 레이어. stub groups/matches는 검증 전용이며 성준이 추후 ALTER로 확장한다.

CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK (status IN ('scheduled','confirmed','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES groups(id),
  payer_user_id UUID NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,
  payment_key   TEXT,
  amount        INT  NOT NULL,
  method        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','refunded','forfeited','compensated')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ,
  canceled_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deposits_match ON deposits(match_id);

CREATE TABLE IF NOT EXISTS tips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id),
  payer_user_id UUID NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,
  payment_key   TEXT,
  amount        INT  NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS noshow_penalties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  group_id      UUID REFERENCES groups(id),
  match_id      UUID NOT NULL REFERENCES matches(id),
  reason        TEXT,
  penalty_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 만남 상호 인증 (충현이 attendances 본체를 만들면 ALTER로 병합)
CREATE TABLE IF NOT EXISTS attendances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             UUID NOT NULL REFERENCES matches(id),
  group_id             UUID NOT NULL REFERENCES groups(id),
  code                 TEXT,
  verified_by_opponent BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: 결제 기록은 서버(service_role)만 쓴다. service_role은 RLS를 우회하므로
-- 클라이언트(anon)에는 정책을 부여하지 않아 기본 거부 상태로 둔다.
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips     ENABLE ROW LEVEL SECURITY;
-- TODO(충현): 참가자 본인 SELECT 허용 정책은 매칭 참가자 모델 확정 후 추가.

-- 결제 라우트는 service_role(서버)로 모든 결제 테이블에 접근한다.
-- 일부 프로젝트는 신규 테이블에 service_role grant가 자동 부여되지 않으므로 명시적으로 부여.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON groups, matches, deposits, tips, noshow_penalties, attendances
  TO service_role;

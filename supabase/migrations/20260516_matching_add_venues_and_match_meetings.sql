-- Migration: venues + match_meetings
-- Owner: 성준 (matching 영역)
-- Ref: docs/VENUE_DB_DESIGN.md

-- ─────────────────────────────────────────
-- venues
-- ─────────────────────────────────────────
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name     TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cafe', 'restaurant', 'bar', 'other')),
  address  TEXT NOT NULL,
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  -- 지역 확장 대비
  area           TEXT,
  nearest_school TEXT,

  -- 그룹 인원 필터링
  min_group_size             INT     NOT NULL DEFAULT 2  CHECK (min_group_size >= 1),
  max_group_size             INT     NOT NULL DEFAULT 10 CHECK (max_group_size >= min_group_size),
  suitable_for_group_meeting BOOLEAN NOT NULL DEFAULT TRUE,

  -- 분위기 / 추천 점수
  price_level   INT   CHECK (price_level   BETWEEN 1 AND 4),
  noise_level   INT   CHECK (noise_level   BETWEEN 1 AND 5),
  privacy_level INT   CHECK (privacy_level BETWEEN 1 AND 5),
  vibe_tags     TEXT[] NOT NULL DEFAULT '{}',
  -- vibe_tags 예시: ["감성", "조용함", "아늑함", "힙", "모던", "뷰맛집", "활기참", "넓은"]
  -- Big5 extraversion 낮은 그룹 → "조용함", 높은 그룹 → "활기참" 우선 배정

  -- 운영 정보
  has_alcohol          BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_required BOOLEAN NOT NULL DEFAULT FALSE,
  -- reservation_required=true 장소는 MVP 자동 배정 후보에서 제외
  phone   TEXT,
  map_url TEXT,

  -- 영업시간 / 배정 가능 시간대
  opening_hours      JSONB,
  -- 형식: {"monday": [{"open": "10:00", "close": "22:00"}], ...}
  available_timeslots JSONB,
  -- 형식: {"slots": [{"day": "friday", "start": "18:00", "end": "22:00"}, ...]}
  -- profiles.available_timeslots와 동일 구조 (INTERFACE_CONTRACT.md 참고)

  -- GPS 체크인
  checkin_radius_m INT NOT NULL DEFAULT 50 CHECK (checkin_radius_m > 0),
  -- 기본값 50m 확정. 장소별 override 가능.

  -- 관리자 큐레이션
  status         TEXT  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive', 'hidden')),
  admin_priority INT   NOT NULL DEFAULT 0,
  quality_score  FLOAT NOT NULL DEFAULT 0.5 CHECK (quality_score BETWEEN 0 AND 1),
  notes          TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- match_meetings
-- 매칭 확정 후 실제 만남 시간/장소를 고정하는 테이블
-- ─────────────────────────────────────────
CREATE TABLE match_meetings (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id),

  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end   TIMESTAMPTZ,

  -- venue의 checkin_radius_m을 복사 저장
  -- 장소 설정이 바뀌어도 이미 확정된 만남의 체크인 기준은 유지됨
  checkin_radius_m INT NOT NULL CHECK (checkin_radius_m > 0),

  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),

  -- 배정 근거 기록 (디버깅 및 운영 모니터링용)
  -- 형식: {"matched_slot": {...}, "group_size_total": 6, "venue_score": 0.82, "reasons": [...]}
  assignment_reason JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

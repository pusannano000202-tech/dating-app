-- Migration: 매칭 시스템 핵심 테이블 생성
-- Owner: 충현 (성준이 venues/맛집 DB 집중, 매칭 엔진/그룹 UI 는 충현이 인수)
-- Ref:    docs/MATCHING_SYSTEM_PLAN.md
-- Date:   2026-05-21
--
-- 영향:
--   - 신규: groups, group_members, group_invites, match_pool, matches,
--           deposits, attendances, reviews, connections, excluded_pairs
--   - 의존성 해결: 성준의 20260516_matching_add_venues_and_match_meetings.sql
--                  에서 match_meetings.match_id → matches(id) FK 가 살아남
--
-- 결정값 (docs/MATCHING_SYSTEM_PLAN.md 8-X 결정 기록 참고):
--   - 보증금 2만원
--   - 그룹 인원 2~3명
--   - 주 1회 토요일 14:00 매칭

-- ─────────────────────────────────────────────
-- friend_requests: 친구 추가 요청
-- 그룹 초대와 분리한다. 친구가 된 뒤 그룹에 초대하는 흐름이 기본.
-- ─────────────────────────────────────────────
CREATE TABLE friend_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_user_id  UUID REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_phone    TEXT,
  token             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  message           TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (receiver_user_id IS NOT NULL OR receiver_phone IS NOT NULL),
  CHECK (receiver_user_id IS NULL OR sender_user_id <> receiver_user_id)
);

CREATE INDEX idx_friend_requests_sender ON friend_requests(sender_user_id);
CREATE INDEX idx_friend_requests_receiver_user ON friend_requests(receiver_user_id) WHERE receiver_user_id IS NOT NULL;
CREATE INDEX idx_friend_requests_receiver_phone ON friend_requests(receiver_phone) WHERE receiver_phone IS NOT NULL;
CREATE INDEX idx_friend_requests_status ON friend_requests(status);

-- ─────────────────────────────────────────────
-- friendships: 수락된 친구 관계
-- user_id < friend_user_id 로 정규화해서 중복 저장을 막는다.
-- ─────────────────────────────────────────────
CREATE TABLE friendships (
  user_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'blocked')),
  created_from_request_id  UUID REFERENCES friend_requests(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_user_id),
  CHECK (user_id < friend_user_id)
);

CREATE INDEX idx_friendships_user ON friendships(user_id);
CREATE INDEX idx_friendships_friend_user ON friendships(friend_user_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- ─────────────────────────────────────────────
-- groups: 그룹 마스터
-- ─────────────────────────────────────────────
CREATE TABLE groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            TEXT,
  -- 그룹 인원 (8-3 결정: 2~3)
  size            INT NOT NULL CHECK (size BETWEEN 2 AND 3),
  -- 그룹 전체의 성별 (혼성 그룹 없음)
  gender          TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  status          TEXT NOT NULL DEFAULT 'forming'
                    CHECK (status IN ('forming', 'ready', 'in_pool', 'matched', 'completed', 'disbanded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_status   ON groups(status);
CREATE INDEX idx_groups_leader   ON groups(leader_user_id);

-- ─────────────────────────────────────────────
-- group_members: 그룹 멤버
-- ─────────────────────────────────────────────
CREATE TABLE group_members (
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE UNIQUE INDEX idx_group_members_one_current_group ON group_members(user_id);

-- ─────────────────────────────────────────────
-- group_invites: 그룹 초대 (전화번호/링크 토큰)
-- ─────────────────────────────────────────────
CREATE TABLE group_invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_phone    TEXT,                       -- 폰번호로 초대 (가입 전)
  invited_user_id  UUID REFERENCES public.users(id),  -- 가입 후 연결
  token            TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (invited_phone IS NOT NULL OR invited_user_id IS NOT NULL)
);

CREATE INDEX idx_group_invites_group ON group_invites(group_id);
CREATE INDEX idx_group_invites_invited_by ON group_invites(invited_by_user_id);
CREATE INDEX idx_group_invites_invited_user ON group_invites(invited_user_id) WHERE invited_user_id IS NOT NULL;
CREATE INDEX idx_group_invites_token ON group_invites(token);

-- ─────────────────────────────────────────────
-- match_pool: 매칭 풀 진입 기록
-- ─────────────────────────────────────────────
CREATE TABLE match_pool (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at       TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled', 'rolled_over')),
  -- 이월 횟수 (4주 연속 이월 시 자동 환불)
  rollover_count INT NOT NULL DEFAULT 0 CHECK (rollover_count >= 0),
  batch_id      UUID,
  notes         TEXT
);

CREATE INDEX idx_match_pool_status   ON match_pool(status);
CREATE INDEX idx_match_pool_group    ON match_pool(group_id);
CREATE INDEX idx_match_pool_batch    ON match_pool(batch_id) WHERE batch_id IS NOT NULL;

-- 한 그룹이 동시에 여러 waiting 상태이지 않게
CREATE UNIQUE INDEX idx_match_pool_one_waiting_per_group
  ON match_pool(group_id)
  WHERE status IN ('waiting', 'rolled_over');

-- ─────────────────────────────────────────────
-- matches: 매칭 결과
-- match_meetings(성준)이 이 테이블을 FK 로 참조한다
-- ─────────────────────────────────────────────
CREATE TABLE matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_a_id      UUID NOT NULL REFERENCES groups(id),
  group_b_id      UUID NOT NULL REFERENCES groups(id),
  -- 정규화: a < b (uuid 비교) 로 (a, b) (b, a) 중복 방지
  score           FLOAT NOT NULL,
  -- 외모/성격/시간/가중치 세부 점수 + threshold 등 디버깅용
  score_breakdown JSONB,
  batch_id        UUID NOT NULL,
  is_forced       BOOLEAN NOT NULL DEFAULT FALSE,  -- Forced Match 여부
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  matched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  CHECK (group_a_id < group_b_id)
);

CREATE INDEX idx_matches_group_a   ON matches(group_a_id);
CREATE INDEX idx_matches_group_b   ON matches(group_b_id);
CREATE INDEX idx_matches_batch     ON matches(batch_id);
CREATE INDEX idx_matches_status    ON matches(status);
CREATE UNIQUE INDEX idx_matches_pair_unique ON matches(group_a_id, group_b_id);

-- ─────────────────────────────────────────────
-- deposits: 보증금 (1인 단위)
-- 8-1 결정: 2만원
-- ─────────────────────────────────────────────
CREATE TABLE deposits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id          UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  amount            INT NOT NULL CHECK (amount > 0),  -- KRW (원)
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'held', 'refunded', 'forfeited', 'compensated')),
  -- 토스페이먼츠 결제 식별자
  toss_payment_key  TEXT,
  toss_order_id     TEXT UNIQUE,
  paid_at           TIMESTAMPTZ,
  refunded_at       TIMESTAMPTZ,
  -- 노쇼 페널티가 어디로 분배되었는지 추적 (8-9: 출석자 균등 분배)
  distribution_to   UUID[],
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deposits_user   ON deposits(user_id);
CREATE INDEX idx_deposits_group  ON deposits(group_id);
CREATE INDEX idx_deposits_status ON deposits(status);

-- ─────────────────────────────────────────────
-- attendances: 출석 (GPS 체크인)
-- ─────────────────────────────────────────────
CREATE TABLE attendances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gps_lat         DOUBLE PRECISION NOT NULL,
  gps_lng         DOUBLE PRECISION NOT NULL,
  -- 매칭에 묶인 match_meetings(성준)의 venues 위치 + checkin_radius_m 기준
  within_radius   BOOLEAN NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 그룹 상호 인증: 같은 그룹 다른 멤버가 본인 출석을 확인했는지
  peer_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (match_id, user_id)
);

CREATE INDEX idx_attendances_match ON attendances(match_id);
CREATE INDEX idx_attendances_user  ON attendances(user_id);

-- ─────────────────────────────────────────────
-- reviews: 만남 후 리뷰
-- ─────────────────────────────────────────────
CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reviewer_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  overall_score     INT CHECK (overall_score BETWEEN 1 AND 5),
  -- 'no_show', 'profile_mismatch', 'inappropriate_behavior', 'good_match'
  reported_issues   TEXT[] NOT NULL DEFAULT '{}',
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, reviewer_user_id, target_group_id)
);

CREATE INDEX idx_reviews_match ON reviews(match_id);
CREATE INDEX idx_reviews_target ON reviews(target_group_id);

-- ─────────────────────────────────────────────
-- connections: 만남 후 1:1 연결 동의
-- ─────────────────────────────────────────────
CREATE TABLE connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_a_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  a_agreed              BOOLEAN NOT NULL DEFAULT FALSE,
  b_agreed              BOOLEAN NOT NULL DEFAULT FALSE,
  contact_revealed_at   TIMESTAMPTZ,  -- 양쪽 동의 시 set
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a_id < user_b_id),
  UNIQUE (match_id, user_a_id, user_b_id)
);

CREATE INDEX idx_connections_match  ON connections(match_id);
CREATE INDEX idx_connections_user_a ON connections(user_a_id);
CREATE INDEX idx_connections_user_b ON connections(user_b_id);

-- ─────────────────────────────────────────────
-- excluded_pairs: 매칭 금지 페어
-- 같은 학과, 이전 매칭, 운영자 수동 차단 등
-- ─────────────────────────────────────────────
CREATE TABLE excluded_pairs (
  group_a_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  group_b_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN (
                'same_department', 'previously_matched', 'manual_block'
              )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_a_id, group_b_id),
  CHECK (group_a_id < group_b_id)
);

CREATE INDEX idx_excluded_pairs_a ON excluded_pairs(group_a_id);
CREATE INDEX idx_excluded_pairs_b ON excluded_pairs(group_b_id);

-- ─────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_groups_touch
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_deposits_touch
  BEFORE UPDATE ON deposits
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────
-- RLS 정책 (사용자가 자기 그룹 외 데이터 못 보게)
-- ─────────────────────────────────────────────

-- groups: 멤버만 select 가능
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_member_read" ON groups
  FOR SELECT TO authenticated
  USING (
    leader_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
  );
CREATE POLICY "groups_leader_write" ON groups
  FOR ALL TO authenticated
  USING (leader_user_id = auth.uid())
  WITH CHECK (leader_user_id = auth.uid());

-- friend_requests: 보낸 사람/받는 사람만 볼 수 있고 보낸 사람만 생성
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friend_requests_participant_read" ON friend_requests
  FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
  );
CREATE POLICY "friend_requests_sender_insert" ON friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid());
CREATE POLICY "friend_requests_participant_update" ON friend_requests
  FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid() OR receiver_user_id = auth.uid())
  WITH CHECK (sender_user_id = auth.uid() OR receiver_user_id = auth.uid());

-- friendships: 관계 당사자만 read
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_participant_read" ON friendships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR friend_user_id = auth.uid());

-- group_members: 같은 그룹 멤버만 볼 수 있음
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members_self_read" ON group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
  );

-- group_invites: 초대한 사람/초대받은 사람/그룹 멤버만 확인
ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_invites_participant_read" ON group_invites
  FOR SELECT TO authenticated
  USING (
    invited_by_user_id = auth.uid()
    OR invited_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = group_invites.group_id AND user_id = auth.uid())
  );
CREATE POLICY "group_invites_member_insert" ON group_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM group_members WHERE group_id = group_invites.group_id AND user_id = auth.uid())
  );

-- match_pool: 자기 그룹만
ALTER TABLE match_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_pool_member_read" ON match_pool
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = match_pool.group_id AND user_id = auth.uid())
  );

-- matches: 자기 그룹이 포함된 매칭만
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_participant_read" ON matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_a_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_b_id AND user_id = auth.uid())
  );

-- deposits: 본인 보증금만
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deposits_self" ON deposits
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- attendances: 본인 + 같은 매칭 참여자
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendances_match_participant" ON attendances
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = attendances.match_id
        AND (
          EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = auth.uid())
        )
    )
  );
CREATE POLICY "attendances_self_write" ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- reviews: 본인 작성 리뷰는 본인만 수정/삭제, 다른 리뷰는 같은 매칭 참여자가 read 가능
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_match_participant_read" ON reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = reviews.match_id
        AND (
          EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = auth.uid())
        )
    )
  );
CREATE POLICY "reviews_self_write" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_user_id = auth.uid());

-- connections: 본인이 포함된 connection 만
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connections_self" ON connections
  FOR ALL TO authenticated
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid())
  WITH CHECK (user_a_id = auth.uid() OR user_b_id = auth.uid());

-- excluded_pairs: 매칭 엔진(서비스 키)만 read/write
ALTER TABLE excluded_pairs ENABLE ROW LEVEL SECURITY;
-- 별도 policy 없음 → service_role 만 접근 가능

-- ─────────────────────────────────────────────
-- 코멘트
-- ─────────────────────────────────────────────
COMMENT ON TABLE groups IS '그룹 마스터. INTERFACE_CONTRACT.md 성준 영역이지만 충현이 인수받아 작성.';
COMMENT ON TABLE matches IS '매칭 결과. 성준의 match_meetings.match_id 가 이 테이블을 FK 로 참조한다.';
COMMENT ON COLUMN matches.score_breakdown IS '디버깅용 세부 점수. 사용자 노출 금지.';
COMMENT ON COLUMN deposits.distribution_to IS '노쇼 페널티 분배 대상 user_id 배열 (8-9 결정: 출석자 균등 분배).';
COMMENT ON COLUMN match_pool.rollover_count IS '이월 횟수. 4 이상이면 자동 환불 (8-10).';

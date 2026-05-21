# 매칭 시스템 구현 계획서

> 작성일: 2026-05-21
> 작성자: 충현 (매칭 시스템 인수받음)
> 기준: `부산대_과팅앱_v1.5_정의서.md`, `docs/INTERFACE_CONTRACT.md`
> 인수 경위: 성준이 `venues` + 부산대 맛집 DB 작업에 집중하기로 합의되어, 매칭 엔진/그룹 UI는 충현이 진행

이 문서는 매칭 시스템 전체 설계와 단계별 작업 분해다. 코드를 짜기 전에 원칙·범위·의존성을 못 박아둬서, 나중에 추가/수정할 때 어느 부분의 변경인지 명확히 가리키기 위한 문서다.

---

## 0. 인수 후 작업 분담

| 영역 | 담당 |
|---|---|
| `python/appearance/` (외모 AI) | 충현 |
| `python/matching/` (헝가리안 엔진) | **충현 (신규 인수)** |
| `app/profile/`, `components/profile/` | 충현 |
| `app/group/`, `app/match/`, `components/matching/` | **충현 (신규 인수)** |
| `groups`, `group_members`, `matches`, `deposits`, `attendances`, `reviews`, `connections`, `excluded_pairs` 테이블 | **충현 (신규 인수)** |
| `venues`, `match_meetings`, 부산대 맛집 seed | **성준** |
| 토스페이먼츠 결제 연동 | 충현 (성준 venues 완성 후 트리거 연결) |

INTERFACE_CONTRACT.md 의 영역 정의는 그대로 두되, 실제 작성자만 위 표 기준. 계약서의 컬럼명/타입 정의는 절대 임의 변경 금지.

---

## 1. 매칭 시스템의 목적과 범위

### 1-1. 목적

부산대 학생이 친구와 그룹을 만들고 보증금을 걸면, 시스템이 **상대 그룹·시간·장소를 자동 확정**해서 만남까지 이어주는 게 매칭 시스템이다.

### 1-2. 범위 — 매칭 시스템이 해야 할 일

1. 그룹 생성 / 친구 초대 / 그룹 상태 관리
2. 매칭 풀 진입 (보증금 결제 트리거)
3. 그룹 ↔ 그룹 매칭 점수 계산
4. 헝가리안 알고리즘으로 그룹 쌍 배정
5. 시간/장소 자동 확정 (성준 venues 연동)
6. GPS 출석 인증
7. 만남 후 리뷰 / 노쇼·거짓말 처리
8. 보증금 환불/몰수 흐름
9. 매칭 결과 알림

### 1-3. 범위 밖

- 1:1 데이팅 흐름 (이번 프로젝트는 그룹 매칭 전용)
- 무료 매칭 (보증금 필수)
- 실시간 채팅 (매칭 후 연결 동의 시 카카오톡 등 외부로 위임)
- 추천 알고리즘 머신러닝 (초기는 수식 기반 점수)

---

## 2. 핵심 원칙

### 2-0. 매칭 주기 — 주 1회 토요일 일괄 매칭

- **매칭 배치는 주 1회, 토요일에 일괄 실행**한다.
- 사용자가 이번 주에 매칭 풀에 들어가면, 그 주 토요일에 매칭이 성사되거나 실패하거나 둘 중 하나.
- 예: 3월 첫째 주에 풀 진입 → 3월 첫째 주 토요일에 매칭 결과 알림.
- 한 주의 매칭 풀 마감은 토요일 매칭 직전 (예: 토요일 오전).
- 매칭 결과는 그 주 토요일 오후 발표 (구체 시각은 8-2 결정).

**왜 주 1회인가**

- 그룹 매칭은 4~10명이 동시에 시간을 비워야 하므로 일주일 단위로 약속 잡는 게 현실적.
- 토요일 발표 → 그다음 주 평일/주말 만남 가능 시간 충분.
- 배치 잡 운영 단순화, 사용자도 "토요일에 결과 나옴" 으로 예측 가능.

### 2-1. 공리주의의 적용 범위 (중요)

| 단위 | 적용 |
|---|---|
| 그룹 내 (3:3 한 자리 안) | ⭕ 합 최대. 1명이 95점이고 다른 2명이 50점이어도 그룹 매칭 OK |
| 시스템 전체 (100명 매칭 배치) | ❌ 한 명만 95점 + 나머지 5점 ❌. 매칭 받은 모든 그룹이 일정 수준 이상이어야 함 |

→ "그룹 *내* 공리주의" + "시스템 전체 *최저선*" 두 층 구조.

### 2-2. Hard filter (점수 처리 X, on/off 게이트)

다음 조건은 점수에 가중치 넣지 않고 **매칭 후보군에서 아예 제외**한다.

| 조건 | 처리 |
|---|---|
| 시간대 교집합 = 0 | 매칭 불가 (cost = +∞) |
| 그룹 인원수 다름 (3:3 vs 4:4) | 다른 풀로 분리 |
| 같은 학과 (excluded_pairs) | 매칭 불가 |
| 이전 매칭 페어 (excluded_pairs) | 매칭 불가 |
| 보증금 미납 | 매칭 풀 진입 자체 차단 |

이유: trade-off 가 불가능한 제약. 못 만나거나 같은 학과면 매칭 의미 0.

### 2-2-1. 시간대 표현 방식 — 요일별 가능/불가능 토글

사용자 입력 UI 는 분 단위 슬라이더가 아니라 **요일별 가능/불가능 표시**다.

```
일정 입력:
- 각 요일마다: 가능 / 불가능 X 표시
- "가능" 인 요일의 시간대는 시스템이 자동으로 18:00~24:00 으로 가정
- 잠자는 시간 (00:00~08:00) 은 제외
- 점심/학교 시간 (08:00~18:00) 도 기본 제외 (대학생 데이팅이라 저녁 시작 가정)
```

예시:

```text
사용자 A 입력:
  월: 가능
  화: X (수업/알바)
  수: 가능
  목: X
  금: 가능
  토: 가능
  일: X (가족 모임)

→ 시스템 시간대 = {월·수·금·토 18:00~24:00}
```

이렇게 표현하면:

- 사용자 입력 부담 적음 (7개 토글)
- 그룹 시간 교집합은 "요일 교집합"으로 단순 계산
- 매칭 성사 후 정확한 시각은 venues 영업시간 + 양 그룹 평일/주말 가용성 기준으로 시스템이 결정

운영 시작 후 사용자 피드백 보고 시간대 세분화가 필요하면 시간대 슬롯 (예: 저녁 / 심야) 도 추가 가능.

### 2-2-2. 그룹 시간 교집합 계산

```text
그룹 A 가능 요일 = (각 멤버 가능 요일의 교집합)
  예: A1 = {월,수,금,토}, A2 = {월,화,금,토}, A3 = {월,금,토}
       → A = {월, 금, 토}

그룹 A vs 그룹 B 매칭 후보 = A ∩ B
  예: B = {수, 금, 일} → A ∩ B = {금}
       → 금요일에 매칭 가능

A ∩ B = ∅ → hard filter 탈락
```

만남 시각은 매칭 성사 후 시스템이 venues 영업시간 + 가능 요일 중에서 자동 선택.

### 2-3. Stratified pool (외모 점수대 분리)

`self_appearance_score` (백분위, Codex SCORE_GUIDE.md 정의) ±15 안에서만 같은 풀로 묶는다.

```
사용자 A 점수 70 → 풀: 점수 55~85 사용자만 후보
사용자 B 점수 10 → 풀: 점수 0~25 사용자만 후보
```

이유: 점수 차이가 큰 매칭은 양쪽 모두 만족 못 함 (높은 쪽 거절 / 낮은 쪽 부담). 풀을 미리 자르는 게 안전.

### 2-4. Threshold (최저 점수 미달 매칭 거부)

페어 점수 < 0.45 이면 헝가리안 cost 를 +∞ 처리 → 매칭 안 시키고 다음 배치 미룸.

이유: 누구도 만족 못 할 매칭을 억지로 만들면 보증금 분쟁만 발생.

### 2-5. 양방향 비대칭 페널티

```
A → B 점수 95, B → A 점수 30 → 합 125 (헝가리안은 좋은 매칭으로 봄)
실제: B가 일방적으로 거리감 → 만남 분위기 망함
```

`pair_score = avg(score_ab, score_ba) - 0.3 × |score_ab - score_ba|`

이유: 합이 같아도 양방향 균형 잡힌 쪽이 만남에서 성공률 높음.

### 2-6. 매칭 못 받은 사용자 = 점수 보정 X, 다음 배치 대기

연속 미매칭 보너스 같은 점수 조작은 **금지**. 진짜 잘 맞는 사람 찾는 게 목적인데, 점수 부풀려서 억지로 끼우면 본질에 어긋남.

대신: 풀에 사람이 모일 때까지 그냥 기다림. 보증금은 hold 상태 유지. 일정 기간 (예: 4주) 매칭 못 받으면 보증금 자동 환불 + 사용자에게 안내.

### 2-7. 점수/벡터 사용자 노출 금지

- `self_appearance_score`, `appearance_score_normalized`, `preferred_appearance_vector` raw 값 노출 X
- 매칭 결과 화면에 상대 그룹 점수 표시 X
- 만남 전까지 상대방 사진/이름/프로필 비공개 (v1.2 정의서 원칙)
- 만남 자리에서만 노출

---

## 3. 데이터 모델

### 3-1. 누락된 핵심 테이블 (충현이 신규 마이그레이션 추가)

```sql
-- 그룹 마스터
CREATE TABLE groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_user_id  UUID NOT NULL REFERENCES users(id),
  name            TEXT,                           -- 그룹명 (선택)
  size            INT NOT NULL CHECK (size BETWEEN 2 AND 5),
  gender          TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  status          TEXT NOT NULL DEFAULT 'forming'
                    CHECK (status IN ('forming', 'ready', 'in_pool', 'matched', 'completed', 'disbanded')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 그룹 멤버
CREATE TABLE group_members (
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- 그룹 초대
CREATE TABLE group_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_phone TEXT,                     -- 폰번호로 초대
  invited_user_id UUID REFERENCES users(id),  -- 가입 후 연결
  token       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 매칭 풀 진입 기록
CREATE TABLE match_pool (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entered_at  TIMESTAMPTZ DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled')),
  batch_id    UUID                       -- 매칭된 배치 ID (matched 시점에 설정)
);

-- 매칭 결과
CREATE TABLE matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_a_id    UUID NOT NULL REFERENCES groups(id),
  group_b_id    UUID NOT NULL REFERENCES groups(id),
  score         FLOAT NOT NULL,           -- 페어 점수
  score_breakdown JSONB,                  -- 외모/성격/시간 세부 점수
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  matched_at    TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  CHECK (group_a_id < group_b_id)         -- 정규화 (a가 항상 작은 UUID)
);

-- 보증금 (1인 단위)
CREATE TABLE deposits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  group_id    UUID NOT NULL REFERENCES groups(id),
  amount      INT NOT NULL,                -- KRW 단위 정수
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'held', 'refunded', 'forfeited', 'compensated')),
  toss_payment_key TEXT,                   -- 토스페이먼츠 결제키
  toss_order_id    TEXT UNIQUE,
  paid_at     TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 출석 (GPS 체크인)
CREATE TABLE attendances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  gps_lat       DOUBLE PRECISION NOT NULL,
  gps_lng       DOUBLE PRECISION NOT NULL,
  within_radius BOOLEAN NOT NULL,
  checked_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 만남 후 리뷰
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id),
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  target_group_id UUID NOT NULL REFERENCES groups(id),
  overall_score   INT CHECK (overall_score BETWEEN 1 AND 5),
  reported_issues TEXT[],                  -- 'no_show', 'profile_mismatch', 'inappropriate_behavior'
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 만남 후 1:1 연결 동의
CREATE TABLE connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id),
  user_a_id   UUID NOT NULL REFERENCES users(id),
  user_b_id   UUID NOT NULL REFERENCES users(id),
  a_agreed    BOOLEAN DEFAULT FALSE,
  b_agreed    BOOLEAN DEFAULT FALSE,
  contact_revealed_at TIMESTAMPTZ,         -- 양쪽 동의 시 연락처 공개
  CHECK (user_a_id < user_b_id)
);

-- 매칭 금지 페어 (excluded_pairs)
CREATE TABLE excluded_pairs (
  group_a_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  group_b_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,               -- 'same_department', 'previously_matched', 'manual_block'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_a_id, group_b_id),
  CHECK (group_a_id < group_b_id)
);
```

### 3-2. 이상형 월드컵 결과 컬럼 (profiles 테이블 확장)

```sql
ALTER TABLE profiles
  ADD COLUMN preferred_appearance_vector        JSONB,
  ADD COLUMN preferred_appearance_delta_vector  JSONB,
  ADD COLUMN preferred_choice_delta_vector      JSONB,
  ADD COLUMN preferred_axis_percentile_vector   JSONB,
  ADD COLUMN preferred_axis_z_vector            JSONB,
  ADD COLUMN preferred_score_range              JSONB,
  ADD COLUMN preferred_bucket_weights           JSONB,
  ADD COLUMN worldcup_pool_mean_vector          JSONB,
  ADD COLUMN worldcup_pool_axis_stats           JSONB;

CREATE TABLE worldcup_choice_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round       TEXT NOT NULL,
  match_index INT NOT NULL,
  winner_id   TEXT NOT NULL,
  loser_id    TEXT NOT NULL,
  winner_vector JSONB NOT NULL,
  loser_vector  JSONB NOT NULL,
  choice_delta_vector JSONB NOT NULL,
  weight      REAL NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3-3. 성준 venues 와의 연결점

`matches` 테이블이 생기면 성준의 `match_meetings.match_id REFERENCES matches(id)` FK 가 살아남. 성준 마이그레이션이 의존성 깨졌던 문제 해결.

`match_meetings` 가 시간/장소를 확정하면 매칭 결과 화면에서 venue 정보를 join 해서 보여줌.

---

## 4. 매칭 점수 공식

### 4-1. 그룹 요약 (GroupSummary)

매칭 전에 각 그룹마다 다음 값을 미리 계산해둔다.

```typescript
interface GroupSummary {
  group_id: string
  size: number
  gender: 'male' | 'female'
  members: UserSummary[]
  
  // 그룹 평균값
  avg_self_appearance_score: number       // 0~100 백분위
  avg_appearance_vector: AppearanceVector // 멤버 사진 분석 평균
  avg_preferred_vector: AppearanceVector  // 멤버 이상형 월드컵 평균
  avg_preferred_z_vector: AppearanceVector // 풀 분포 기준 평균 (청순 쏠림 보정)
  avg_big5: Big5Scores
  
  // 그룹 시간대 (교집합)
  group_timeslots: AvailableTimeslots     // 모든 멤버 가능한 시간만
  
  // 학과/제약
  member_departments: string[]            // 같은 학과 제외용
  excluded_group_ids: string[]            // 이전 매칭 그룹
}
```

### 4-2. Hard filter (먼저 통과해야 함)

```typescript
function isMatchable(a: GroupSummary, b: GroupSummary): MatchableResult {
  if (a.gender === b.gender) return { ok: false, reason: 'same_gender' }
  if (a.size !== b.size) return { ok: false, reason: 'size_mismatch' }
  
  const overlap = intersectTimeslots(a.group_timeslots, b.group_timeslots)
  if (totalMinutes(overlap) < 90) return { ok: false, reason: 'time_no_overlap' }
  
  const deptOverlap = a.member_departments.some(d => b.member_departments.includes(d))
  if (deptOverlap) return { ok: false, reason: 'same_department' }
  
  if (a.excluded_group_ids.includes(b.group_id)) return { ok: false, reason: 'excluded_pair' }
  
  // 외모 점수대 ±15 stratification
  const scoreGap = Math.abs(a.avg_self_appearance_score - b.avg_self_appearance_score)
  if (scoreGap > 15) return { ok: false, reason: 'score_band_mismatch' }
  
  return { ok: true, time_overlap: overlap }
}
```

### 4-3. 페어 점수 (Hard filter 통과한 그룹 쌍만)

```typescript
function pairScore(a: GroupSummary, b: GroupSummary): PairScore {
  // 1. 외모 양방향 적합도 — 핵심
  //    a의 선호 vector 가 b의 실제 appearance 와 얼마나 맞는지
  //    z-vector 기반: 풀의 spread 가 좁은 축도 신호 살림 (청순 쏠림 보정)
  const app_ab = cosineSimilarity(a.avg_preferred_z_vector, normalize(b.avg_appearance_vector))
  const app_ba = cosineSimilarity(b.avg_preferred_z_vector, normalize(a.avg_appearance_vector))
  
  // 2. 성격 호환성 (Big5 유클리드 거리의 역수)
  const personality = 1 - big5Distance(a.avg_big5, b.avg_big5)
  
  // 3. 외모 점수대 근접성 (이미 filter 에서 ±15 안이지만 가까울수록 가점)
  const score_band = 1 - Math.abs(a.avg_self_appearance_score - b.avg_self_appearance_score) / 15
  
  // 4. 이상형 가중치 정합 (사용자가 외모 중시 vs 성격 중시)
  const weight_align = preferenceWeightAlignment(a.members, b.members)
  
  const base = 
    0.50 * (app_ab + app_ba) / 2 +
    0.25 * personality +
    0.15 * score_band +
    0.10 * weight_align
  
  // 양방향 비대칭 페널티
  const gap = Math.abs(app_ab - app_ba)
  const final = base - 0.3 * gap
  
  return {
    score: final,
    breakdown: { app_ab, app_ba, personality, score_band, weight_align, gap },
  }
}
```

### 4-4. Threshold 적용

```python
MIN_PAIR_SCORE = 0.45

cost = -pair_score
if pair_score < MIN_PAIR_SCORE:
    cost = float('inf')   # 매칭 거부 → 다음 배치 미룸
```

---

## 5. 헝가리안 알고리즘 적용

### 5-1. 배치 단위 매칭

매주 토요일 배치 잡 실행 (시각은 8-2 결정):

```python
def run_matching_batch():
    # 1. 매칭 풀에 있는 그룹 로드
    pools = load_groups_by_size_and_gender_and_scoreband()
    # 예: {('male', 3, '60-75'): [...], ('female', 3, '60-75'): [...], ...}
    
    # 2. 같은 (size, score_band) 쌍 안에서만 매칭
    for (size, band) in score_band_combinations:
        m_groups = pools.get(('male', size, band), [])
        f_groups = pools.get(('female', size, band), [])
        
        if not m_groups or not f_groups:
            continue
        
        # 3. 비용 행렬 생성
        cost = build_cost_matrix(m_groups, f_groups)  # +inf for hard filter fails
        cost = apply_threshold(cost, MIN_SCORE=0.45)
        
        # 4. 헝가리안
        row_ind, col_ind = linear_sum_assignment(cost)
        
        # 5. inf 셀은 매칭 안 함, 나머지는 matches 테이블에 저장
        for i, j in zip(row_ind, col_ind):
            if cost[i][j] == float('inf'):
                continue
            create_match(m_groups[i], f_groups[j], score=-cost[i][j])
```

### 5-2. 비대칭 행렬 처리 (남녀 수 다를 때)

남자 그룹 5개, 여자 그룹 3개면 더미 그룹 2개 추가 → 5x5 정사각 행렬. 더미와 매칭된 그룹은 매칭 안 됨 (다음 배치로 미룸).

### 5-3. 매칭 못 받은 그룹 처리 — 사용자 선택 흐름

토요일 1차 매칭 후 안 잡힌 그룹은 **즉시 알림 + 사용자 선택지 제시**.

```text
[토요일 매칭 직후, 매칭 실패한 그룹에게]

"이번 주 매칭에서 적합한 그룹을 찾지 못했어요.
 어떻게 하시겠어요?"

  옵션 1: 점수 조건을 낮춰서라도 매칭 시도하기 (Forced Match)
  옵션 2: 일요일에 다음 주 매칭 풀로 자동 이월
  옵션 3: 매칭 중단 + 보증금 환불
```

#### 5-3-1. Forced Match (점수 조건 완화)

옵션 1을 선택한 그룹들끼리 **그날 저녁 즉시 한 번 더 헝가리안** 돌림. 단:

- threshold 를 `MIN_PAIR_SCORE = 0.45` → `0.30` 으로 완화
- 외모 점수대 폭을 `±15` → `±25` 로 완화
- Hard filter (시간/학과/이전매칭) 는 그대로 유지

```python
def run_forced_match(opted_in_groups):
    cost = build_cost_matrix(opted_in_groups, threshold=0.30, band_width=25)
    row_ind, col_ind = linear_sum_assignment(cost)
    # 그래도 inf 면 옵션 2(이월) 로 자동 이동
```

이때 매칭된 그룹은 일반 매칭과 동일하게 다음 주 만남 진행.

#### 5-3-2. 일요일 이월 (다음 주 풀 자동 추가)

옵션 2를 선택한 그룹은 일요일 00:00 에 자동으로 다음 주 매칭 풀에 재진입. 보증금은 hold 상태 유지.

#### 5-3-3. 매칭 중단

옵션 3을 선택한 그룹은:

- `match_pool.status = 'cancelled'`
- `deposits` 자동 환불
- 그룹 자체는 유지 (나중에 다시 매칭 풀 진입 가능)

#### 5-3-4. 응답 없음 처리

토요일 발표 후 24시간 (일요일 매칭 시각까지) 응답 없으면 **자동 옵션 2 (다음 주 이월)**. 보증금 유지.

#### 5-3-5. 최대 이월 횟수

3주 연속 이월 시 자동 환불 (옵션 3 강제 적용). 너무 오래 잡혀있는 보증금 방지.

---

## 6. Phase 별 작업 분해

### Phase 0 — 데이터 모델 (1~2일)

- [ ] 0-1. `supabase/migrations/20260521_matching_create_core_tables.sql` — 섹션 3-1 의 9개 테이블
- [ ] 0-2. `supabase/migrations/20260521_profile_add_preference_vectors.sql` — 섹션 3-2 의 profiles 컬럼 + worldcup_choice_logs
- [ ] 0-3. `lib/types.ts` 확장 (PR 필요. 성준에게 사전 알림)
- [ ] 0-4. 마이그레이션 로컬 테스트 (supabase db reset → 새로 push)

### Phase 1 — 매칭 점수 라이브러리 (2~3일)

- [ ] 1-1. `lib/matching/types.ts` — GroupSummary, PairScore, MatchableResult 등 타입
- [ ] 1-2. **`lib/matching/config.ts` — 모든 튜닝 파라미터 모음 (8-X 결정값 반영)**
- [ ] 1-3. `lib/matching/time.ts` — `intersectWeekdays`, `groupAvailableDays`
- [ ] 1-4. `lib/matching/filter.ts` — `isMatchable` (hard filter)
- [ ] 1-5. `lib/matching/group-summary.ts` — `buildGroupSummary(group_id)`
- [ ] 1-6. `lib/matching/score.ts` — `pairScore` (config 주입식)
- [ ] 1-7. `lib/matching/simulate.ts` — 가상 데이터 시뮬레이터 (config 비교 도구)
- [ ] 1-8. 단위 테스트 (vitest) — score 함수 fixture 기반
- [ ] 1-9. `scripts/run-simulation.ts` — config 다양하게 바꿔서 매칭 결과 분포 확인

### Phase 2 — 헝가리안 엔진 (Python, 2일)

- [ ] 2-1. `python/matching/` 디렉토리 + Dockerfile (외모 AI 와 유사 구조)
- [ ] 2-2. `python/matching/engine.py` — scipy `linear_sum_assignment` 호출
- [ ] 2-3. `python/matching/score_loader.py` — Supabase 에서 GroupSummary 데이터 로드
- [ ] 2-4. `python/matching/batch.py` — 배치 잡 entrypoint (cron 또는 수동 호출)
- [ ] 2-5. `python/matching/tests/` — fixture 기반 단위 테스트
- [ ] 2-6. FastAPI 엔드포인트 `/api/run-batch` (관리자만)

### Phase 3 — 그룹 UI (3~4일)

- [ ] 3-1. `app/group/create/page.tsx` — 그룹 생성 폼 (이름, 인원수, 초대)
- [ ] 3-2. `components/matching/InviteFriends.tsx` — 친구 초대 (전화번호 + 링크)
- [ ] 3-3. `app/group/invite/[token]/page.tsx` — 초대 수락 화면
- [ ] 3-4. `app/group/[id]/page.tsx` — 그룹 상태 + 멤버 목록 + 매칭 풀 진입 버튼
- [ ] 3-5. `app/group/list/page.tsx` — 내가 속한 그룹 목록
- [ ] 3-6. `components/matching/GroupCard.tsx`, `GroupStatusBadge.tsx`

### Phase 4 — 매칭 풀 진입 + 결제 (2일)

- [ ] 4-1. `app/group/[id]/enter-pool/page.tsx` — 매칭 풀 진입 확인 화면
- [ ] 4-2. 멤버 전원 보증금 결제 확인 → `match_pool` 진입
- [ ] 4-3. 토스페이먼츠 결제 연동 (테스트 키)
- [ ] 4-4. `/api/payment/prepare`, `/api/payment/confirm`, `/api/payment/webhook`
- [ ] 4-5. `deposits.status` 흐름 관리

### Phase 5 — 매칭 결과 화면 (2일)

- [ ] 5-1. `app/match/[id]/page.tsx` — 매칭 확정 화면 (시간/장소, 상대 그룹 인원수만, 사진/이름 비공개)
- [ ] 5-2. 성준 `venues` + `match_meetings` join 해서 장소 정보 표시
- [ ] 5-3. 만남 24시간 전 알림 (이메일/PWA)
- [ ] 5-4. `components/matching/MatchCard.tsx`

### Phase 6 — 출석 + 리뷰 (2~3일)

- [ ] 6-1. `app/match/[id]/checkin/page.tsx` — GPS 체크인 (50m 반경)
- [ ] 6-2. `attendances` 기록 + 그룹 상호 인증
- [ ] 6-3. `app/match/[id]/review/page.tsx` — 만남 후 리뷰 폼
- [ ] 6-4. `reviews` 기록 + `connections` (1:1 연결 동의) 처리
- [ ] 6-5. 노쇼/거짓말 신고 시 `deposits.status = 'forfeited'` + 자동 환불 분배

### Phase 7 — 운영 + 알림 (2~3일)

- [ ] 7-1. 주간 매칭 스케줄러 (매주 토요일 토요일 X시 자동 실행)
- [ ] 7-2. 토요일 1차 매칭 → 매칭 성사 알림 (그룹 멤버 전원)
- [ ] 7-3. 매칭 실패 그룹 → 옵션 3가지 선택 화면 (`app/match/post-batch/page.tsx`)
- [ ] 7-4. Forced Match 실행 (옵션 1 선택자만, 토요일 저녁)
- [ ] 7-5. 일요일 00:00 → 이월 그룹 자동 재진입, 응답 없는 그룹도 자동 이월
- [ ] 7-6. 3주 연속 이월 시 자동 환불
- [ ] 7-7. excluded_pairs 자동 갱신 (매칭 완료 시 자동 추가)
- [ ] 7-8. 관리자 페이지 — 주간 매칭 통계, 분쟁 처리

### Phase 7-A. 알림 시스템 (별도 분해)

매칭 시스템 전반의 알림 트리거.

- [ ] 7A-1. 알림 채널 결정 (PWA 푸시 / 이메일 / 카카오 알림톡)
- [ ] 7A-2. 알림 템플릿 정의
  - "이번 주 매칭이 성사되었어요" + 상대 그룹 인원수/시간/장소
  - "이번 주 매칭에 적합한 그룹을 찾지 못했어요" + 3가지 옵션 링크
  - "다음 주 매칭 풀에 자동 이월되었어요"
  - "Forced Match 가 성사되었어요"
  - "3주 연속 매칭이 안 잡혀 자동 환불 처리되었어요"
  - "만남 24시간 전입니다" (D-1 리마인더)
  - "만남 30분 전입니다 — GPS 체크인 가능"
- [ ] 7A-3. 매칭 발표 시각에 알림 일괄 발송
- [ ] 7A-4. 사용자 알림 수신 동의 / 끄기 옵션

### 주간 매칭 사이클 요약 (참고)

```text
[월~금]   사용자가 그룹 생성 / 풀 진입 / 보증금 결제
[토 X시]  ← 매칭 풀 마감
[토 X+1시] ← 1차 헝가리안 배치 실행
[토 발표] ← 매칭 성사 그룹 알림 / 실패 그룹 옵션 화면 노출
[토 저녁] ← Forced Match (옵션 1 선택자) 실행
[일 00:00] ← 미응답 그룹 자동 이월, 옵션 2 선택자도 다음 주 풀에 등록
[일~금]   ← 매칭 확정 그룹 만남 진행 (확정 시각·장소는 venues 영업시간 기준)
```

### Phase 8 — 출시 직전 점검 (1일)

- [ ] 8-1. 전체 E2E 시나리오 테스트 (그룹 생성 → 매칭 → 만남 → 리뷰)
- [ ] 8-2. 보증금 환불 엣지 케이스 (한 명만 노쇼, 그룹 해산 등)
- [ ] 8-3. RLS 정책 검수 (사용자가 다른 그룹 정보 못 보는지)
- [ ] 8-4. 점수/벡터 노출 검수 (어떤 화면에서도 raw 값 안 보이는지)

---

## 7. 의존성과 협업 지점

### 7-1. 충현이 다른 것을 먼저 끝내야 하는 의존성

매칭 시스템 시작 전에 완료되어야 할 것:

- ✅ 외모 분석 GPT 프롬프트/스키마/보정 (완료)
- ✅ 이상형 월드컵 measured vector 시스템 (완료)
- ⚠️ Codex 의 여자 64장 이미지 + GPT 재분석 (진행 중, FI20 까지)
- ⚠️ Codex 의 남자 64장 이미지 (미시작)
- ⚠️ Supabase 실 키 연동 (대기)
- ⚠️ 사용자 사진 GPT Vision 분석 파이프라인 (코드 X)

### 7-2. 성준과 합의된 분담

- 성준이 `venues` + `match_meetings` 마이그레이션 머지 (PR 필요)
- 성준이 부산대 맛집 30~50개 seed 데이터 작성
- 충현의 `matches` 테이블이 머지된 후에야 성준의 `match_meetings.match_id` FK 가 살아남

순서:
1. 충현이 `matches` 테이블 먼저 마이그레이션 (Phase 0-1)
2. 성준이 그 위에 `match_meetings` 머지
3. 충현이 Phase 5에서 join 해서 사용

### 7-3. 인터페이스 계약 변경 시

`docs/INTERFACE_CONTRACT.md` 의 컬럼/타입을 변경해야 하면:

1. 변경 사유 PR 본문에 기재
2. 성준에게 알림
3. 양쪽 합의 후 머지

이번 작업에서 변경 예상되는 부분:
- `MatchingProfile` 인터페이스에 preferred_* 필드 추가 (lib/types.ts)
- `profiles` 테이블에 preferred_* 컬럼 추가

---

## 8. 미결 사항 (운영 시작 전 결정 필요)

### 8-A. 운영 정책

| ID | 항목 | 후보 |
|---|---|---|
| 8-1 | 보증금 1인 금액 | 2만원 / 3만원 / 5만원 |
| 8-2 | 토요일 매칭 발표 시각 | 14시 / 17시 / 20시 |
| 8-3 | 그룹 인원 범위 | 2:2~3:3 / 2:2~4:4 / 2:2~5:5 |
| 8-4 | Forced Match 응답 마감 | 토요일 자정 / 일요일 새벽 6시 / 일요일 정오 |

### 8-B. 알고리즘 파라미터

| ID | 항목 | 후보 |
|---|---|---|
| 8-5 | 외모 점수대 폭 (stratification) | ±10 / ±15 / ±20 |
| 8-6 | 페어 점수 threshold | 0.40 / 0.45 / 0.50 |
| 8-7 | 양방향 비대칭 페널티 계수 | 0.2 / 0.3 / 0.5 |
| 8-8 | Forced Match 완화 정도 | threshold 0.25 / 0.30 / 0.35 |

### 8-C. 분쟁 / 환불 정책

| ID | 항목 | 후보 |
|---|---|---|
| 8-9 | 노쇼 페널티 배분 | 출석자 균등 분배 / 운영비 적립 / 5:5 분배 |
| 8-10 | 자동 환불 시점 | 2주 연속 / 3주 연속 / 4주 연속 |
| 8-11 | 거짓말(프로필 불일치) 신고 | 양측 만장일치 시 환불 / 운영자 검토 후 결정 |

### 8-D. 알림 채널

| ID | 항목 | 후보 |
|---|---|---|
| 8-12 | 알림 채널 | PWA 푸시 / 이메일 / 카카오 알림톡 / 복수 |

---

## 8-X. 결정된 값 (2026-05-21 1차 결정)

운영 시작 전 다시 점검할 수 있도록 결정 사항 기록.

| ID | 항목 | 결정값 |
|---|---|---|
| 8-1 | 보증금 1인 금액 | **2만원** (낮은 진입 장벽) |
| 8-2 | 토요일 매칭 발표 시각 | **14:00** (오후 2시) |
| 8-3 | 그룹 인원 범위 | **2:2 ~ 3:3** |
| 8-4 | Forced Match 응답 마감 | **일요일 새벽 6:00** |
| 8-5 | 외모 점수대 폭 | **±15** |
| 8-6 | 페어 점수 threshold | **0.45** (튜닝 필요) |
| 8-7 | 양방향 비대칭 페널티 계수 | **0.3** |
| 8-8 | Forced Match 완화 | **threshold 0.30, score band ±25** |
| 8-9 | 노쇼 페널티 배분 | **출석자 균등 분배** |
| 8-10 | 자동 환불 시점 | **4주 연속 이월** |
| 8-11 | 거짓말/프로필 불일치 신고 | **운영자 검토 후 결정** (양측 의견 + 증거 검토) |
| 8-12 | 알림 채널 | **PWA 푸시 + 이메일** (복수) |

**모든 알고리즘 파라미터는 하드코딩하지 않고 `lib/matching/config.ts` 한 파일에 모은다.** 사용자가 가상 데이터로 실험하면서 값을 조정해도 코드 본문 수정 없이 그 파일만 바꾸면 되도록 한다.

```typescript
// lib/matching/config.ts (목표 구조)

export const MATCHING_CONFIG = {
  // 운영 정책
  DEPOSIT_AMOUNT_KRW: 20000,
  BATCH_WEEKDAY: 6,                   // 0=일, 6=토
  BATCH_HOUR: 14,                     // 14:00
  GROUP_SIZE_MIN: 2,
  GROUP_SIZE_MAX: 3,
  FORCED_MATCH_RESPONSE_DEADLINE_HOURS: 16,  // 토 14:00 + 16h = 일 06:00
  
  // 알고리즘 파라미터 (이 값들은 가상 데이터 실험으로 튜닝)
  SCORE_BAND_WIDTH: 15,
  PAIR_SCORE_THRESHOLD: 0.45,
  ASYMMETRY_PENALTY: 0.3,
  
  FORCED_MATCH: {
    THRESHOLD: 0.30,
    SCORE_BAND_WIDTH: 25,
  },
  
  // 점수 가중치 (pairScore 공식)
  WEIGHTS: {
    APPEARANCE: 0.50,
    PERSONALITY: 0.25,
    SCORE_BAND_PROXIMITY: 0.15,
    PREFERENCE_WEIGHT_ALIGN: 0.10,
  },
  
  // 시간 / 환불
  MIN_TIME_OVERLAP_DAYS: 1,           // 시간대 교집합 최소 (요일 기준)
  AUTO_REFUND_AFTER_WEEKS: 4,         // 4주 연속 이월 시 자동 환불 (8-10)
  
  // 노쇼 / 분쟁
  NO_SHOW_DISTRIBUTION: 'attendees_equal',  // 출석자 균등 분배 (8-9)
  
  // 알림
  NOTIFICATION_CHANNELS: ['pwa', 'email'],  // 8-12
}
```

`pairScore` 같은 함수는 이 config 값을 주입받아서 계산. 단위 테스트 시 다른 config 주입 가능하게 설계.

**가상 데이터 실험 도구도 같이 준비**:

```typescript
// lib/matching/simulate.ts (Phase 1-7)
export function simulateBatch(
  fakeGroups: GroupSummary[],
  config: typeof MATCHING_CONFIG = MATCHING_CONFIG,
): SimulationReport {
  // 가짜 그룹 N개로 헝가리안 돌려서 결과 보고
  // - 매칭 성사율
  // - 평균 페어 점수
  // - 매칭 실패 그룹 수
  // - 양방향 비대칭 분포
}
```

이러면 사용자가 `node script/run-simulation.js` 같은 거 하나로 다양한 config 값 비교 가능.

---

## 9. 위험 요소

### 9-1. 사용자 수 부족 (Cold Start 문제)

같은 (size, gender, score_band) 풀에 사용자가 적으면 매칭 자체가 안 됨. 부산대 1개 학교만으로 시작하면 풀이 너무 좁을 수 있음.

대응:
- 초기 1~2개월은 stratification 폭을 ±20 으로 완화
- 일정 대기 시간 (예: 2주) 지나면 자동으로 폭 확대
- 사용자에게 "현재 매칭 풀 인원 X명" 같은 정보 노출 (구체 정보는 비공개)

### 9-2. 외모 점수 분포 편향

`self_appearance_score` 가 자기유사 월드컵 결과로 산출되는데, 사용자가 자기 외모를 과대/과소 평가할 가능성. GPT 사진 분석 결과와 cross-check 필요 (CALIBRATION 6-3 절 식).

### 9-3. 보증금 분쟁

노쇼/거짓말 판정이 모호하면 환불 분쟁. 명확한 정책 필요:
- GPS 출석 + 그룹 상호 인증 → 출석 인정
- 일방적 신고는 양측 의견 청취 후 판정
- 자동 판정 어려운 케이스는 운영자 수동 검토

### 9-4. 같은 학과 매칭 회피

부산대 학생만 대상이라 같은 학과 마주칠 확률 높음. excluded_pairs 의 same_department 처리가 풀을 너무 좁힐 수도 있음. 학과 단위가 너무 좁으면 같은 단과대로 확장 검토.

---

## 10. 완료 기준

이 매칭 시스템이 완료되었다고 말하려면 다음을 모두 만족해야 한다.

- [ ] 사용자가 그룹 생성 → 친구 초대 → 보증금 결제 → 매칭 풀 진입 → 매칭 확정 → 만남 → 리뷰까지 전 흐름 동작
- [ ] 헝가리안 엔진이 hard filter + threshold + 양방향 페널티 모두 반영
- [ ] 점수/벡터 raw 값이 어떤 사용자 화면에도 노출되지 않음
- [ ] 매칭 못 받은 그룹이 점수 보정 없이 다음 배치로 미뤄짐
- [ ] 보증금 환불/몰수 흐름이 토스페이먼츠 테스트 환경에서 작동
- [ ] 성준의 `venues` / `match_meetings` 와 join 해서 시간/장소 표시
- [ ] GPS 체크인 50m 반경 정확히 동작
- [ ] RLS 로 사용자가 자기 그룹 외 데이터 못 봄
- [ ] E2E 테스트 시나리오 통과

---

## 11. 다음 액션

1. 이 계획서 사용자(충현) 확인 → 미결사항 8번 결정
2. Phase 0-1: `matches` 테이블 마이그레이션 PR 열기 (성준에게 알림)
3. Phase 1-1: `lib/matching/types.ts` 부터 작성 시작

각 Phase 시작 시 이 문서의 체크박스 갱신.

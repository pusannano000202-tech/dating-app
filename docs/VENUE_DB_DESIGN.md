# Venue DB Design Draft

> Purpose: 장소 DB 담당자가 Claude Code/Codex와 공유하기 위한 작업 메모.
> 기준 문서: `부산대_과팅앱_v1.2_정의서.md`

## 1. Context

v1.2 정의서에서 장소 DB는 단순한 맛집 목록이 아니다. 그룹매칭이 성사된 뒤 시스템이 시간과 장소를 자동 확정하고, 이후 GPS 출석 인증과 보증금 처리까지 연결하기 위한 운영 데이터다.

핵심 요구사항:

- 그룹매칭 성사 후 별도 수락/거절 없이 자동확정
- 사용자에게는 만남 전까지 상대 상세 프로필/사진을 공개하지 않음
- 앱은 `몇 명 대 몇 명`, `장소`, `시간`, `주의사항`만 제공
- 초기 프로젝트에서는 관리자 큐레이션 장소 DB 사용
- 장소는 부산대/부산권 대학가 근처 카페, 술집, 식당 등
- 출석 인증은 GPS 체크인 + 그룹 상호 인증을 기본으로 함
- 추후 지역별 장소 DB로 확장 가능해야 함

## 2. Design Goals

장소 DB는 아래 기능을 지원해야 한다.

- 매칭된 그룹 인원 수에 맞는 장소 필터링
- 사용자의 가능 시간대와 장소 운영 시간 교집합 확인
- 카페/식당/술집 등 시간대와 분위기에 맞는 장소 선택
- GPS 체크인 반경 판단
- 관리자 큐레이션 우선순위 반영
- 향후 지역 확장 및 제휴 장소 관리

## 3. Proposed Tables

### `venues`

장소 자체를 저장하는 마스터 테이블.

```sql
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cafe', 'restaurant', 'bar', 'other')),
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  area TEXT,
  nearest_school TEXT,

  min_group_size INT NOT NULL DEFAULT 2 CHECK (min_group_size >= 1),
  max_group_size INT NOT NULL DEFAULT 10 CHECK (max_group_size >= min_group_size),
  suitable_for_group_meeting BOOLEAN NOT NULL DEFAULT TRUE,

  price_level INT CHECK (price_level BETWEEN 1 AND 4),
  noise_level INT CHECK (noise_level BETWEEN 1 AND 5),
  privacy_level INT CHECK (privacy_level BETWEEN 1 AND 5),
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',

  has_alcohol BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_required BOOLEAN NOT NULL DEFAULT FALSE,
  phone TEXT,
  map_url TEXT,

  opening_hours JSONB,
  available_timeslots JSONB,

  checkin_radius_m INT NOT NULL DEFAULT 50 CHECK (checkin_radius_m > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'hidden')),

  admin_priority INT NOT NULL DEFAULT 0,
  quality_score FLOAT NOT NULL DEFAULT 0.5 CHECK (quality_score BETWEEN 0 AND 1),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Field notes:

- `latitude`, `longitude`: GPS 체크인과 거리 계산에 필수.
- `checkin_radius_m`: 장소별 체크인 반경. MVP 권장 기본값은 50m이고, 장소별 조정 가능.
- `category`: 시간대/분위기별 자동 배정에 사용.
- `min_group_size`, `max_group_size`: 2:2와 5:5에 적합한 장소를 구분.
- `opening_hours`: 실제 영업시간.
- `available_timeslots`: 앱에서 배정 가능한 시간대. 영업시간과 별개로 운영자가 제한할 수 있음.
- `area`, `nearest_school`: 부산대 시작 후 부산권 대학가 확장 대비.
- `noise_level`, `privacy_level`: 과팅 목적에 맞는 대화 가능성 판단.
- `vibe_tags`: 장소 분위기 태그. MVP seed data에 같이 넣어두고, 향후 그룹 성향 기반 장소 추천을 고도화할 때 사용한다. 예시값: `["감성", "조용함", "아늑함", "힙", "모던", "뷰맛집", "활기참", "넓은"]`.
- `admin_priority`, `quality_score`: 초기에는 운영자 큐레이션을 강하게 반영하기 위한 점수.

### `match_meetings`

매칭 결과에 실제 확정된 시간과 장소를 저장하는 테이블.

```sql
CREATE TABLE match_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id),

  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ,

  checkin_radius_m INT NOT NULL CHECK (checkin_radius_m > 0),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),

  assignment_reason JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Why this table matters:

- `matches`는 어떤 그룹끼리 매칭됐는지를 나타낸다.
- `match_meetings`는 그 매칭이 언제 어디서 만나는지를 고정한다.
- 출석 인증, 보증금 환불/몰수, 만남 후 리뷰는 이 확정된 만남 기록을 기준으로 연결된다.
- `checkin_radius_m`은 venue의 값을 복사 저장한다. 장소 설정이 나중에 바뀌어도 이미 확정된 만남의 체크인 기준은 흔들리지 않게 하기 위함이다.

## 4. JSON Shape Drafts

### `opening_hours`

```json
{
  "monday": [{ "open": "10:00", "close": "22:00" }],
  "tuesday": [{ "open": "10:00", "close": "22:00" }],
  "wednesday": [{ "open": "10:00", "close": "22:00" }],
  "thursday": [{ "open": "10:00", "close": "22:00" }],
  "friday": [{ "open": "10:00", "close": "00:00", "closes_next_day": true }],
  "saturday": [{ "open": "11:00", "close": "00:00", "closes_next_day": true }],
  "sunday": [{ "open": "11:00", "close": "21:00" }]
}
```

### `available_timeslots`

```json
{
  "slots": [
    { "day": "friday", "start": "18:00", "end": "22:00" },
    { "day": "saturday", "start": "14:00", "end": "21:00" }
  ]
}
```

This mirrors the profile `available_timeslots` format from `docs/INTERFACE_CONTRACT.md`.

### `assignment_reason`

```json
{
  "matched_slot": {
    "day": "friday",
    "start": "19:00",
    "end": "21:00"
  },
  "group_size_total": 6,
  "venue_score": 0.82,
  "reasons": [
    "fits_group_size",
    "within_available_timeslot",
    "high_admin_priority",
    "good_privacy_level"
  ]
}
```

## 5. MVP Venue Selection Rule

초기 자동 배정은 복잡한 추천보다 안정적인 필터 + 점수 정렬로 충분하다.

1. `status = 'active'`
2. `suitable_for_group_meeting = true`
3. 총 참석 인원 수가 `min_group_size`와 `max_group_size` 사이
4. 매칭 확정 시간과 `available_timeslots`가 맞음
5. 필요하면 `area` 또는 `nearest_school`로 후보 제한
6. 아래 점수로 정렬

```text
venue_score =
  admin_priority_weight
  + quality_score
  + privacy_level_bonus
  - noise_penalty
```

MVP에서는 거리 최적화보다 운영자가 검증한 장소 우선 배정이 안전하다.
예약이 필요한 장소는 초기 자동 배정 후보에서 제외한다. `reservation_required`는 실서비스 확장이나 수동 운영 판단을 위해 남겨둔다.

## 6. MVP Seed Data Recommendation

초기 목표:

- 부산대 앞 장소 30~50개
- 카페 15~20개
- 식당 10~15개
- 술집 10~15개

필수 입력값:

- `name`
- `category`
- `address`
- `latitude`
- `longitude`
- `area`
- `min_group_size`
- `max_group_size`
- `available_timeslots`
- `checkin_radius_m`
- `admin_priority`
- `vibe_tags`

선택 입력값:

- `price_level`
- `noise_level`
- `privacy_level`
- `phone`
- `map_url`
- `notes`

## 7. PostGIS Note

MVP에서는 `latitude`, `longitude` 숫자 컬럼만으로 충분하다.

나중에 거리 기반 장소 추천이나 반경 검색이 중요해지면 Supabase Postgres에서 PostGIS를 켜고 아래 컬럼을 추가할 수 있다.

```sql
ALTER TABLE venues
ADD COLUMN location GEOGRAPHY(Point, 4326);
```

그 전까지는 애플리케이션/Python 쪽에서 haversine 거리 계산으로 GPS 체크인을 처리해도 된다.

## 8. Open Decisions

### 권장 기본값

- **GPS 체크인 반경 기본값**: MVP 권장값은 50m. `checkin_radius_m` 기본값 50으로 시작하되, 장소별로 override한다.
- **예약 필요 장소**: 초기 MVP에서는 자동 배정 후보에서 제외한다. `reservation_required` 컬럼은 실서비스 확장이나 수동 운영 판단을 위해 유지한다.

### 미결

- **장소 지정 방식**: 완전 자동 1곳 지정 vs 후보 3곳 중 시스템 선택 — 추후 결정. 매칭 엔진 구현 시 두 방식 모두 지원 가능하도록 `venue_score` 기반 정렬 결과를 반환하는 형태로 설계할 것.
- **부산대 외 지역 확장 시** `area`와 `nearest_school`을 어떤 enum/테이블로 관리할지
- **제휴 장소 QR 인증**을 후순위 테이블로 미리 설계할지 여부

## 9. Suggested Next Step

1. `venues`와 `match_meetings`를 실제 migration으로 추가한다.
2. `docs/INTERFACE_CONTRACT.md`에 장소 DB가 matching 영역 소유임을 추가할지 팀과 합의한다.
3. 부산대 앞 MVP 장소 seed CSV 또는 SQL 파일을 만든다.
4. 매칭 엔진에서 시간 교집합 산출 후 `match_meetings`를 생성하도록 연결한다.

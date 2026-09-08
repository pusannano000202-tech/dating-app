# 인터페이스 계약서 (Interface Contract)

> 상태: `CONDITIONAL_CURRENT` (2026-08-30 정비)
>
> 이 문서는 프로필·외모 영역과 그룹·매칭·행사 영역의 **공용 변경 경계**를 정의한다.
> 현재 운영 기본값은 `solo-owner`다. 과거 2인 담당자 이름은 소유권을 뜻하지 않으며,
> 공용 타입·DB·인증·결제·개인정보 계약은 사용자 승인과 독립 검토 없이 변경하지 않는다.
>
> 이 문서의 상세 스키마는 초기 계약을 포함한 참고 기준이다. 실제 현재 상태는 작업을 시작할 때
> 현재 코드, 관련 migration, 최신 사용자 결정 장부를 함께 확인한다. 이 문서만 근거로 오래된 기능을
> 복원하거나 원격 DB를 변경하면 안 된다.

## 0. 적용 우선순위와 사용 범위

충돌 시 다음 순서를 따른다.

1. 사용자의 최신 명시 결정과 승인 범위
2. 최신 활성 결정 장부·승인된 인터페이스 변경안
3. 현재 작업공간의 실제 코드와 관련 migration (구현 증거이며 새 정책의 근거는 아님)
4. 이 문서의 공용 경계
5. 과거 handoff·계획·archive

순수 CSS·문구·이미지 배치처럼 공용 타입·API·DB를 건드리지 않는 작업은 이 문서 전체를 필독으로
요구하지 않는다. 공용 타입, API 요청·응답, DB/RLS, 인증, 결제, 사진·개인정보 경계를 바꿀 때만
관련 절을 읽고 영향 범위를 보고한다.

---

## 1. 소유권 경계

### 프로필·외모 영역

- DB 테이블: `users`, `profiles`, `photos`, `personality_scores`, `appearance_scores`
- Python 서버: `python/appearance/`
- Next.js: `app/profile/`, `components/profile/`

### 그룹·매칭·행사 영역

- DB 테이블: `groups`, `group_members`, `match_requests`, `matches`, `deposits`, `attendances`, `reviews`, `connections`, `excluded_pairs`
- Python 서버: `python/matching/`
- Next.js: `app/group/`, `app/match/`, `components/matching/`

### 공용 위험 영역 (수정 시 사용자 승인 + 독립 검토)

- `lib/supabase.ts` — Supabase 클라이언트 초기화
- `lib/types.ts` — 공용 TypeScript 타입
- `lib/constants.ts` — 공용 상수
- `supabase/migrations/` — DB 마이그레이션 전체
- `app/layout.tsx`, `app/page.tsx`

---

## 2. DB 스키마 계약

> 아래 컬럼명과 타입은 초기 모듈 간 계약을 보존한 참고 기준이다. 현재 migration과 다르면
> 임의로 어느 한쪽을 정답으로 만들지 말고 충돌을 보고한다. 변경은 forward-only migration과
> 모든 소비자 영향 검토를 거친다.

### `profiles` 테이블 (프로필 영역이 쓰고 매칭 영역이 읽는다)

```sql
CREATE TABLE profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender         TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age            INT NOT NULL,
  height         INT,                    -- cm 단위 정수
  body_type      TEXT CHECK (body_type IN ('slim', 'average', 'athletic', 'chubby')),
  hair_density   TEXT CHECK (hair_density IN ('full', 'thinning', 'bald')),
  school         TEXT NOT NULL,
  department     TEXT,
  year           INT CHECK (year BETWEEN 1 AND 6),
  appearance_type TEXT CHECK (appearance_type IN (
                   'cute', 'pure', 'chic', 'warm', 'stylish', 'healthy'
                 )),
  -- 아래 컬럼은 매칭 엔진이 직접 읽는 핵심 값
  appearance_score_normalized  FLOAT CHECK (appearance_score_normalized BETWEEN 0 AND 1),
  big5_openness         FLOAT CHECK (big5_openness BETWEEN 0 AND 1),
  big5_conscientiousness FLOAT CHECK (big5_conscientiousness BETWEEN 0 AND 1),
  big5_extraversion     FLOAT CHECK (big5_extraversion BETWEEN 0 AND 1),
  big5_agreeableness    FLOAT CHECK (big5_agreeableness BETWEEN 0 AND 1),
  big5_neuroticism      FLOAT CHECK (big5_neuroticism BETWEEN 0 AND 1),
  -- 가용 시간대: 매칭 필터가 읽는 구조
  available_timeslots   JSONB,           -- 아래 3번 형식 참고
  -- 이상형 가중치: 매칭 점수 계산에 사용
  preference_weights    JSONB,           -- 아래 4번 형식 참고
  -- 선호 상대 나이 범위 (양쪽 포함, 18-60). 결정 8-13 (2026-05-22).
  -- 매칭 엔진은 양 그룹의 평균 나이를 비교, 본인 범위 안이면 ageFit=1.0
  preferred_age_min     INT CHECK (preferred_age_min IS NULL OR preferred_age_min BETWEEN 18 AND 60),
  preferred_age_max     INT CHECK (preferred_age_max IS NULL OR preferred_age_max BETWEEN 18 AND 60),
  is_profile_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CHECK (preferred_age_min IS NULL OR preferred_age_max IS NULL
         OR preferred_age_min <= preferred_age_max)
);
```

### `connections` 연락처 공개 정책 (`SUPERSEDED`)

과거의 **약속 시각 자동 전화번호 공개** 정책은 현재 제품 기준이 아니다. 이 문서의 과거 기록이나
기존 컬럼을 근거로 자동 공개를 새 코드에 복원하면 안 된다.

현재 안전 경계는 다음과 같다.

- 기본 연락 수단은 앱 안의 회차 채팅과 사용자가 직접 선택한 친구 요청이다.
- 전화번호·외부 연락처는 최신 사용자 결정과 당사자 동의 범위가 별도로 확정되기 전까지 자동 공개하지 않는다.
- 기존 `connections`, `a_agreed`, `b_agreed`, `contact_revealed_at`, 관련 RPC는 실제 코드·migration·RLS를
  확인한 뒤 유지·폐기·이관안을 별도 리뷰한다.
- 오래된 자동 공개 동작이 현재 코드나 원격 DB에 남아 있으면 구현 근거가 아니라 보안·개인정보 충돌로 보고한다.

**주의:** `appearance_score_normalized`는 AI가 산출한 0~100 절대점수를 0~1로 정규화한 값이다.
원본 절대점수(`appearance_score_raw`)는 `appearance_scores` 테이블에만 저장하고 외부에 절대 노출하지 않는다.

### `appearance_scores` 테이블 (프로필·외모 서버 전용, 매칭 영역 직접 접근 금지)

```sql
CREATE TABLE appearance_scores (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score_raw  FLOAT NOT NULL,    -- AI 원본 점수 (0~100), 절대 외부 노출 금지
  model_version TEXT,
  scored_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. `available_timeslots` JSONB 형식

매칭 엔진이 시간대 교집합을 계산하기 위해 읽는다. **이 형식은 변경 시 사용자 승인과 소비자 검토가 필수다.**

```json
{
  "slots": [
    {
      "day": "friday",
      "start": "18:00",
      "end": "22:00"
    },
    {
      "day": "saturday",
      "start": "14:00",
      "end": "21:00"
    }
  ]
}
```

- `day`: `"monday"` ~ `"sunday"` (소문자 영어)
- `start` / `end`: `"HH:MM"` 24시간 형식
- 중복 슬롯 허용 (같은 day가 여러 개 가능)

---

## 4. `preference_weights` JSONB 형식

매칭 엔진의 점수 계산에서 개인별 가중치로 사용한다.

```json
{
  "appearance": 0.35,
  "personality": 0.35,
  "height": 0.15,
  "body_type": 0.15
}
```

- 모든 값의 합이 반드시 `1.0`이 되어야 한다.
- 프로필 입력 UI에서 숫자 입력으로 받는다.
- 현재 판단 데이터가 없는 `school`, `hobby`, `time_fit` 가중치는 제거한다.
- 매칭 엔진은 이 4개 값을 그대로 읽거나, 배치 로더에서 명시적으로 동일 4개 키로 변환한다.

---

## 5. Python 서버 간 계약

### 외모 AI → 매칭 엔진 방향

외모 AI 서버는 점수 산출 후 **Supabase에 직접 저장**한다.
매칭 엔진은 Supabase에서 읽는다. 두 서버가 직접 통신하지 않는다.

```
[외모 AI 서버]
  사진 입력 → 점수 산출 → Supabase profiles.appearance_score_normalized 업데이트
                         → Supabase appearance_scores.score_raw 업데이트

[매칭 엔진]
  Supabase profiles 읽기 → 매칭 계산 → Supabase matches 저장
```

### 외모 AI 서버 엔드포인트 (외모 AI 영역 전용, 매칭 영역 직접 호출 금지)

```
POST /api/score-photos
  Request:  { user_id: string, photo_urls: string[] }
  Response: { status: "ok" | "error", message?: string }
  // 점수 결과는 응답에 포함하지 않는다. Supabase에만 저장.
```

---

## 6. TypeScript 공용 타입 (`lib/types.ts`)

아래 타입은 `lib/types.ts`에 정의하고 두 영역이 함께 사용한다.
**이 파일의 타입 수정은 사용자 승인 + 독립 리뷰 필수다.**

```typescript
// 성별
export type Gender = 'male' | 'female'

// 외모 타입
export type AppearanceType = 'cute' | 'pure' | 'chic' | 'warm' | 'stylish' | 'healthy'

// 체형
export type BodyType = 'slim' | 'average' | 'athletic' | 'chubby'

// 머리숱
export type HairDensity = 'full' | 'thinning' | 'bald'

// 가용 시간 슬롯 (available_timeslots JSONB와 동일 구조)
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface TimeSlot {
  day: DayOfWeek
  start: string  // "HH:MM"
  end: string    // "HH:MM"
}

export interface AvailableTimeslots {
  slots: TimeSlot[]
}

// 이상형 가중치 (preference_weights JSONB와 동일 구조)
export interface PreferenceWeights {
  appearance: number
  personality: number
  height: number
  body_type: number
  // 합계 = 1.0 보장 필요
}

// 매칭 엔진이 읽는 프로필 요약
export interface MatchingProfile {
  user_id: string
  gender: Gender
  age: number
  height: number | null
  body_type: BodyType | null
  appearance_score_normalized: number  // 0~1
  appearance_type: AppearanceType | null
  big5: {
    openness: number
    conscientiousness: number
    extraversion: number
    agreeableness: number
    neuroticism: number
  }
  available_timeslots: AvailableTimeslots
  preference_weights: PreferenceWeights
  is_profile_complete: boolean
}

// 그룹 상태
export type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

// 보증금 상태
export type DepositStatus = 'pending' | 'paid' | 'held' | 'refunded' | 'forfeited' | 'compensated'

// 매칭 상태
export type MatchStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
```

---

## 7. 현재 변경 프로세스

공용 계약을 바꿔야 할 경우:

1. 정확한 작업공간·브랜치·HEAD·dirty 상태와 관련 코드·migration을 읽기 전용으로 확인한다.
2. 최신 사용자 결정과 이 문서가 충돌하면 추측하지 않고 충돌 내용을 먼저 보고한다.
3. 타입·API·DB·RLS·클라이언트 소비자를 함께 바꾸는 forward-only 변경안을 작성한다.
4. 사용자 승인과 독립 검토를 받은 뒤 격리 작업공간에서 로컬 구현·검증한다.
5. 원격 migration, stage·commit·push, main 반영, Vercel·Expo 배포는 각각 별도 승인을 받는다.

**절대 금지:** 문서만 먼저 현재 계약으로 확정해 코드와 DB가 불일치하는 기간을 만들거나,
과거 계약을 근거로 전화번호 자동 공개·외모점수 공개·자동 친구 같은 폐기 정책을 복원하는 방식.

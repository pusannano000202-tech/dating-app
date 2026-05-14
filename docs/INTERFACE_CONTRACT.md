# 인터페이스 계약서 (Interface Contract)

> **이 문서는 충현(프로필 모듈)과 성준(매칭 모듈)의 경계를 정의한다.**
> 여기에 정의된 타입, 컬럼명, 함수 시그니처는 양측 합의 없이 변경할 수 없다.
> 변경이 필요하면 PR을 열고 두 사람이 함께 검토한다.

---

## 1. 소유권 경계

### 충현 소유 (프로필/외모)
- DB 테이블: `users`, `profiles`, `photos`, `personality_scores`, `appearance_scores`
- Python 서버: `python/appearance/`
- Next.js: `app/profile/`, `components/profile/`

### 성준 소유 (그룹/매칭)
- DB 테이블: `groups`, `group_members`, `match_requests`, `matches`, `deposits`, `attendances`, `reviews`, `connections`, `excluded_pairs`
- Python 서버: `python/matching/`
- Next.js: `app/group/`, `app/match/`, `components/matching/`

### 공용 (수정 시 상대방 알림 필수)
- `lib/supabase.ts` — Supabase 클라이언트 초기화
- `lib/types.ts` — 공용 TypeScript 타입
- `lib/constants.ts` — 공용 상수
- `supabase/migrations/` — DB 마이그레이션 전체
- `app/layout.tsx`, `app/page.tsx`

---

## 2. DB 스키마 계약

> 아래 컬럼명과 타입은 양측이 합의한 계약이다. 임의 변경 금지.

### `profiles` 테이블 (충현이 채운다, 성준이 읽는다)

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
  -- 아래 두 컬럼은 성준의 매칭 엔진이 직접 읽는 핵심 값
  appearance_score_normalized  FLOAT CHECK (appearance_score_normalized BETWEEN 0 AND 1),
  big5_openness         FLOAT CHECK (big5_openness BETWEEN 0 AND 1),
  big5_conscientiousness FLOAT CHECK (big5_conscientiousness BETWEEN 0 AND 1),
  big5_extraversion     FLOAT CHECK (big5_extraversion BETWEEN 0 AND 1),
  big5_agreeableness    FLOAT CHECK (big5_agreeableness BETWEEN 0 AND 1),
  big5_neuroticism      FLOAT CHECK (big5_neuroticism BETWEEN 0 AND 1),
  -- 가용 시간대: 성준의 매칭 필터가 읽는 구조
  available_timeslots   JSONB,           -- 아래 3번 형식 참고
  -- 이상형 가중치: 성준의 점수 계산에 사용
  preference_weights    JSONB,           -- 아래 4번 형식 참고
  is_profile_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

**주의:** `appearance_score_normalized`는 AI가 산출한 0~100 절대점수를 0~1로 정규화한 값이다.
원본 절대점수(`appearance_score_raw`)는 `appearance_scores` 테이블에만 저장하고 외부에 절대 노출하지 않는다.

### `appearance_scores` 테이블 (충현만 읽기/쓰기, 성준 접근 금지)

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

매칭 엔진이 시간대 교집합을 계산하기 위해 읽는다. **이 형식은 변경 시 양측 합의 필수.**

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
  "appearance": 0.30,
  "personality": 0.25,
  "height": 0.10,
  "body_type": 0.10,
  "school": 0.10,
  "hobby": 0.10,
  "time_fit": 0.05
}
```

- 모든 값의 합이 반드시 `1.0`이 되어야 한다.
- 충현의 프로필 입력 UI에서 슬라이더로 입력받아 저장한다.
- 성준의 매칭 엔진은 이 값을 그대로 읽어 가중 합산한다.

---

## 5. Python 서버 간 계약

### 충현 → 성준 방향 (외모 AI → 매칭 엔진)

충현의 외모 AI 서버는 점수 산출 후 **Supabase에 직접 저장**한다.
성준의 매칭 엔진은 Supabase에서 읽는다. 두 서버가 직접 통신하지 않는다.

```
[충현 외모 AI 서버]
  사진 입력 → 점수 산출 → Supabase profiles.appearance_score_normalized 업데이트
                         → Supabase appearance_scores.score_raw 업데이트

[성준 매칭 엔진]
  Supabase profiles 읽기 → 매칭 계산 → Supabase matches 저장
```

### 외모 AI 서버 엔드포인트 (충현이 구현, 성준은 직접 호출 금지)

```
POST /api/score-photos
  Request:  { user_id: string, photo_urls: string[] }
  Response: { status: "ok" | "error", message?: string }
  // 점수 결과는 응답에 포함하지 않는다. Supabase에만 저장.
```

---

## 6. TypeScript 공용 타입 (`lib/types.ts`)

아래 타입은 `lib/types.ts`에 정의하고 양측이 함께 사용한다.
**이 파일의 타입 수정은 PR + 상대방 리뷰 필수.**

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
  school: number
  hobby: number
  time_fit: number
  // 합계 = 1.0 보장 필요
}

// 매칭 엔진이 읽는 프로필 요약 (성준이 사용하는 타입)
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
export type DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited' | 'compensated'

// 매칭 상태
export type MatchStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
```

---

## 7. 변경 프로세스

이 계약서의 내용을 바꿔야 할 경우:

1. 변경하려는 사람이 PR을 열어 `docs/INTERFACE_CONTRACT.md` 수정안을 올린다
2. 상대방이 코드 영향 범위를 검토하고 승인한다
3. 두 사람이 동시에 자기 모듈을 업데이트한다
4. 업데이트 완료 확인 후 `dev` → `main` 머지

**절대 금지:** 계약서 먼저 머지하고 상대방 코드는 나중에 고치는 방식 (인터페이스 불일치 기간 발생)

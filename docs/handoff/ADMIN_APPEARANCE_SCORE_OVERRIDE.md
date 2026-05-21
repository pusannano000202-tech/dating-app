# 운영자 외모 점수 보정 admin 설계

> 작성: 충현 / 2026-05-21
> 결정 근거: `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-03
> 결정 본문: "GPT Vision 자동 점수 + 운영자 수정/보완 가능 형식"

---

## 배경

- 자기유사 월드컵(self-worldcup)이 폐기됨 (D-02)
- 그러나 매칭 엔진은 여전히 `self_appearance_score` 를 필요로 함
  (`lib/matching/config.ts` HARD_FILTER_CONFIG.SCORE_BAND_WIDTH=15)
- D-03 결정: GPT Vision 자동 + 운영자 수정/보완

## 데이터 모델

`profiles` 테이블의 단일 컬럼 `self_appearance_score` 만으로는 "auto 값" vs "운영자 보정값" 구분 불가.
다음 두 가지 옵션 중 하나로 결정해야 한다.

### 옵션 1: 별도 컬럼 분리 (추천)

```sql
ALTER TABLE profiles
  ADD COLUMN self_appearance_score_auto       INT,        -- GPT 자동 산출
  ADD COLUMN self_appearance_score_override   INT,        -- 운영자 수동 보정 (null = 보정 없음)
  ADD COLUMN self_appearance_score_source     TEXT NOT NULL DEFAULT 'auto'
    CHECK (self_appearance_score_source IN ('auto', 'admin_override', 'pending'));
```

매칭에서 사용하는 effective 값:
```sql
COALESCE(self_appearance_score_override, self_appearance_score_auto) AS self_appearance_score
```

장점: 운영자 보정 이력 추적 가능, 자동 재산출 시 override 보존
단점: 컬럼 3개로 늘어남, 매칭 쿼리에 COALESCE 추가

### 옵션 2: 단일 컬럼 + 별도 audit 테이블

```sql
-- self_appearance_score 컬럼 유지
-- 변경 이력은 audit 테이블로
CREATE TABLE appearance_score_audits (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prev_score      INT,
  new_score       INT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('auto', 'admin_override')),
  admin_user_id   UUID REFERENCES public.users(id),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

장점: profiles 스키마 단순 유지
단점: 매번 audit 테이블 조회해야 "auto vs override" 구분

---

## 충현이 결정할 것

1. **옵션 1 vs 옵션 2** — 옵션 1 추천 (auto/override 의미가 매칭 쿼리에서 자주 필요)
2. **자동 점수 산출 시점** — 사진 업로드 직후 vs 운영자 배치
3. **운영자 보정 UI 위치** — Supabase Studio (직접 SQL) vs 별도 admin 페이지 (Next.js `/admin/*`)
4. **권한 모델** — `is_admin BOOLEAN` 컬럼 vs Supabase role 기반

---

## v1 출시 시점 권장

### 최소 기능 (MVP)

- 옵션 1로 마이그레이션 (3 컬럼 추가)
- GPT Vision 분석 파이프라인이 사진 업로드 시 `self_appearance_score_auto` 자동 채움
- 운영자 보정은 **Supabase Studio 직접 SQL 수정**으로 시작 (별도 admin 페이지 X)
- 보정 시 `source = 'admin_override'` 같이 업데이트

### v1.1 이후

- `/admin/users` Next.js 페이지 (사진 + auto 점수 + 보정 입력)
- 권한 모델 (`is_admin` 또는 Supabase RLS role)
- 보정 이력 audit 테이블 별도 추가

---

## 매칭 엔진 영향

매칭 엔진이 `self_appearance_score` 를 읽을 때 항상 COALESCE 적용:

```sql
SELECT
  user_id,
  COALESCE(self_appearance_score_override, self_appearance_score_auto) AS self_appearance_score
FROM profiles
WHERE is_profile_complete = TRUE;
```

`lib/types.ts` `MatchingProfile.self_appearance_score` 는 effective 값(COALESCE 결과)만 유지.
auto/override 분리 필드는 admin 페이지에서만 사용.

---

## GPT Vision 파이프라인 (별도 작업)

D-03 결정의 "자동 산출" 부분은 GPT Vision 파이프라인이 먼저 구축되어야 동작한다.
현재 미구현. 핵심 누락 작업:

- `app/api/score-photos/route.ts` 가 GPT Vision API 호출
- 결과를 `appearance_score_normalized`, `appearance_vector` 등에 저장
- 사진 다중 업로드 시 가중 평균 (어제 review에서 옵션 2)

이 파이프라인은 별도 작업으로 분리. 본 문서는 그 위에 얹는 운영자 보정 레이어만 다룬다.

---

## 관련 기록

- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-03
- `docs/MATCHING_SYSTEM_PLAN.md` HARD_FILTER 절
- `lib/matching/config.ts` SCORE_BAND_WIDTH
- `supabase/migrations/20260515_profile_add_self_appearance_score.sql` (기존 단일 컬럼)

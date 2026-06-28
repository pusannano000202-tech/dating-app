# 코드 리뷰 — 2026-05-21

> 리뷰어: Claude (충현 세션)
> 목적: Codex 가 같은 코드베이스를 리뷰할 때 비교 가능하도록 구조화된 검토 보고서를 남긴다.
> 비교 방식: Codex 의 리뷰를 별도 `CODE_REVIEW_CODEX_2026-05-21.md` 로 받아서 동일 항목 옆에 두고 비교한다.

---

## 0. 리뷰 메타정보

| 항목 | 값 |
|---|---|
| 리뷰 일자 | 2026-05-21 |
| 리뷰 대상 브랜치 | `main` (커밋 `775d703` 이후 working tree 변경 포함) |
| 리뷰 범위 | 충현 영역 전체 + 충현이 인수받은 성준 영역 일부 |
| 리뷰 제외 | `public/appearance-self/` (Codex 자기유사 월드컵 이미지) — 별도 검수 완료 |

## 1. 전체 코드베이스 개요

### 1-1. 디렉토리별 상태

```
/
├── app/                  → Next.js 페이지. profile 완성, group/match 미구현
├── components/           → 프로필 컴포넌트 완성, matching/ 미구현
├── lib/                  → 외모 벡터 시스템 완성, matching/ 시작 (config.ts 만)
├── python/
│   ├── appearance/       → ResNet50 + SCUT-FBP5500 프로토타입 (deprecated 의심)
│   └── matching/         → 폴더 자체 없음
├── public/
│   ├── appearance-ideal/  → 여자 FI01~FI20 + 메타 (Codex 작업 중)
│   ├── appearance-self/   → 자기유사 월드컵 64장 (Codex 완료)
│   └── appearance-types/  → 6개 대표 타입 (deprecated 의심)
├── supabase/migrations/  → 4개 기존 + 2개 신규(이번 세션) = 6개
└── docs/                 → 외모 분석/매칭 계획서 완성
```

### 1-2. 작업 단계 진행률

| 영역 | 진척도 |
|---:|---|
| 인증 (Supabase OTP) | 80% (실 키 미연동) |
| 프로필 입력 플로우 | 95% (UI 완성, GPT Vision 분석 파이프라인 X) |
| 자기유사 월드컵 | 100% (Codex 64장 완료) |
| 이상형 월드컵 (measured 기반) | 90% (UI 완성, FI21~FI64 이미지 미완) |
| 외모 분석 GPT 프롬프트/스키마 | 100% (문서 완료, 운영 코드 X) |
| 매칭 점수 계산 (lib/matching) | 5% (config.ts 만) |
| 매칭 엔진 (python/matching) | 0% |
| 그룹/매칭 UI | 0% (placeholder) |
| 보증금 (토스페이먼츠) | 0% |
| 출석/리뷰 | 0% |
| venues / 맛집 DB (성준) | 10% (마이그레이션 1개, main 미머지) |

---

## 2. 영역별 리뷰

### 2-1. `lib/appearance/` — 외모 벡터 시스템

| 파일 | 줄수 추정 | 평가 |
|---|---:|---|
| `vector.ts` | ~250 | ⭕ 잘 작성됨 |
| `metadata.ts` | ~130 | ⭕ Codex 표준 정합 |
| `preference.ts` | ~190 | ⭕ pool_axis_stats 포함 |
| `bucket-to-legacy.ts` | ~40 | 🟡 임시 호환 레이어 (제거 예정) |

**좋은 점**

- `AppearanceVector` 를 `Record<string, number>` 로 유연하게 두고 성별별 축은 enum 상수로 분리. 타입 안전과 유연성의 균형 좋음.
- `computeAxisPercentileVector`, `computeAxisZVector` 도입 → 청순 쏠림 보정. Codex 가 명시한 "매칭에서 청순함이 무시되지 않게" 요구 반영.
- `meanVector` 가 빈 배열일 때 `null` 반환 — 안전.
- 모든 파일 상단 주석에 "사용자 노출 금지" 명시.

**문제 / 개선점**

- ⚠️ `vector.ts:meanVector` 가 첫 벡터로 `detectGender` 추정 → 빈 배열일 때 안전하지만, 다른 성별 벡터가 섞여 있으면 침묵 오작동. 명시적으로 `gender` 인자를 받게 하는 게 안전.
- ⚠️ `valuePercentile` 이 같은 값 여러 개일 때 첫 매치만 반환 → tie handling 모호. 평균 rank 처리 고려.
- 🟡 `bucket-to-legacy.ts` 는 임시 호환 레이어. `appearance_type` 컬럼이 deprecated 되면 같이 제거.
- 🟡 `cosineSimilarity` 가 0 벡터에 대해 0 반환 — 정의상 undefined. 명시적 에러로 바꿀 수도.

### 2-2. `lib/matching/` — 매칭 시스템 (신규)

| 파일 | 상태 |
|---|---|
| `config.ts` | ⭕ 작성 완료 (이번 세션) |
| `types.ts` | ❌ 미작성 |
| `time.ts` | ❌ 미작성 |
| `filter.ts` | ❌ 미작성 |
| `group-summary.ts` | ❌ 미작성 |
| `score.ts` | ❌ 미작성 |
| `simulate.ts` | ❌ 미작성 |

**좋은 점 (`config.ts`)**

- 모든 매직 넘버를 한 파일에 집중. 결정 8-1~8-12 모두 코멘트로 추적.
- `makeSimConfig` 헬퍼로 시뮬레이션 시 partial override 가능.
- `SCORE_WEIGHTS` 합 1.0 런타임 sanity check.

**문제 / 개선점**

- ⚠️ `SCORE_WEIGHTS` sanity check 가 `console.warn` 인데 production 에서는 더 강한 처리가 나음. 합 불일치는 매칭 정의가 깨진 거라 fail-fast 가 안전.
- 🟡 `deepMerge` 가 자체 구현 — 작은 코드라 OK 지만 nested 타입 잘못 합쳐질 위험. ts-deepmerge 같은 라이브러리 검토.
- 🟡 `NO_SHOW_DISTRIBUTION` 의 union 타입 선언이 길어짐. 별도 `type NoShowMode = ...` 분리 권장.

### 2-3. `components/profile/IdealWorldcup.tsx`, `IdealWorldcupResult.tsx`

**좋은 점**

- `pairUpBucketAware` 로 같은 버킷끼리 1라운드부터 만나지 않게 — 변별력 확보. 사용자/린터 수정으로 추가됨.
- `IdealWorldcupResult` 가 `preferred_bucket_weights` 의 상위 2개만 노출. raw 벡터/점수는 비공개. 노출 정책 잘 지킴.
- 키보드 단축키 (← → / Enter / R) 모두 지원.
- `largestPow2` 로 BYE 처리 없이 2의 거듭제곱 크기로 자름 — UX 깔끔.

**문제 / 개선점**

- ⚠️ `IdealWorldcup.tsx:81` 의 `shuffle(pool, Date.now() & 0xffff)` → seed 가 16비트라 약간 충돌 가능. 실용상 무해지만 `crypto.randomUUID()` 기반 seed 가 더 안전.
- ⚠️ `IdealWorldcup.tsx` 의 `pairUpBucketAware` 가 매 라운드 호출되는데, 후반 라운드(2~4명)는 같은 버킷 강제 분리가 오히려 부자연스러울 수 있음. 토너먼트 후반에는 끄는 게 자연스러움.
- ⚠️ `pool.length` 가 8 미만일 때 첫 라운드 라벨이 "결승" 으로 떨어져 사용자가 어리둥절. 최소 풀 크기 가드(예: 16) 권장.
- 🟡 `IdealWorldcupResult.tsx:14` 의 `getPublicPreferenceTypes` 가 `preferred_bucket_weights` 비어있을 때 `'균형형'` 폴백. 의도된 동작이지만 fixture 데이터에서만 발생. 실 데이터에서는 항상 채워져야 함 → 확인 필요.
- 🟡 `IdealWorldcup.tsx` 의 `currentRound` 가 라운드 전환 시점에 lagged 업데이트 → 화면 표시 한 박자 늦을 수 있음. setTimeout 내부 setState 묶음 처리 필요.

### 2-4. `app/profile/worldcup/page.tsx`

**좋은 점**

- `isSupabaseConfigured()` 분기로 개발 환경에서도 동작 (사용자/린터 수정).
- 매칭 입력값(`preferred_*`)을 sessionStorage 에 임시 저장 → DB 컬럼 추가 전까지 안전한 폴백.
- `legacyTypeFromBucketWeights` 로 기존 `appearance_type` 컬럼 호환.

**문제 / 개선점**

- ⚠️ sessionStorage 임시 저장은 페이지 새로고침 후 다음 단계에서 읽을 수 있어야 하는데, 현재 `/profile/self-worldcup` 가 이 값을 읽는 로직이 없음. **데이터 손실 우려**.
- ⚠️ 이번 세션 마이그레이션 (`20260521_profile_add_preference_vectors.sql`) 적용 후에는 sessionStorage 가 아닌 DB 에 저장해야 함 → `handleConfirm` 갱신 필요.
- 🟡 `setLoadError('월드컵 데이터를 불러오지 못했어...')` 후에도 `setLoaded(true)` 하지 않고 catch 안에서 처리 — 사용자가 무한 로딩 화면 가능성.

### 2-5. `python/appearance/` — 외모 AI 서버

**현재 상태**

- ResNet50 + SCUT-FBP5500 기반 단일 점수 산출 서버
- `POST /api/score-photos` → Supabase 저장 (fire-and-forget)
- 가중치 파일 없음 → ImageNet pretrained 만 사용 중 (점수 정확도 매우 낮음)

**문제 / 개선점**

- ⚠️ **v1.5 정의서가 GPT Vision API 로 전환했다고 명시** (`6dc2ca3` 커밋 "GPT Vision 전환 결정 기록"). 이 서버는 deprecated 상태. 두 가지 결정 필요:
  - 옵션 A: 폐기 — `/api/score-photos` 호출하는 코드 모두 제거, GPT Vision 으로 교체
  - 옵션 B: 유지 — GPT Vision 비용 부담 시 fallback 으로 활용
- ⚠️ `model.py` 가 v1.5 의 13축/12축 벡터 산출이 아니라 단일 점수만 산출 → 매칭에서 직접 사용 불가. `appearance_vector` 산출 코드 X.
- ⚠️ GPT Vision 분석 결과 (`appearance_score_normalized`, `appearance_vector` 등) 를 받아 DB 에 저장하는 파이프라인이 **아예 없음**. 사용자가 사진 업로드해도 분석 자체가 일어나지 않음.

### 2-6. `supabase/migrations/`

| 파일 | 작성자 | 상태 |
|---|---|---|
| `20260514_profile_create_appearance_tables.sql` | 충현 | main 적용 |
| `20260514_profile_create_profiles_table.sql` | 충현 | main 적용 |
| `20260515_profile_add_self_appearance_score.sql` | 충현 | main 적용 |
| `20260515_profile_create_photos_table.sql` | 충현 | main 적용 |
| `20260516_matching_add_venues_and_match_meetings.sql` | 성준 | **main 미머지** (matching/group-engine 브랜치에만, FK 의존성 깨짐) |
| `20260521_matching_create_core_tables.sql` | 충현 (이번 세션) | working tree |
| `20260521_profile_add_preference_vectors.sql` | 충현 (이번 세션) | working tree |

**문제 / 개선점**

- ⚠️ 성준의 `match_meetings.match_id REFERENCES matches(id)` FK 가 이번 세션의 `matches` 테이블 생성으로 의존성 해결됨. **두 마이그레이션을 같이 머지하는 순서 확인 필요** (충현 신규 → 성준).
- ⚠️ `lib/types.ts` 의 `MatchingProfile` 에 preferred_* 필드 추가 필요. **PR 필수** (성준 리뷰).
- ⚠️ `20260521_matching_create_core_tables.sql` 의 `users(id)` 참조 — `users` 테이블이 Supabase Auth 의 `auth.users` 인지 별도 `users` 테이블인지 확인 필요. 기존 `profiles.user_id REFERENCES users(id)` 와 정합성.
- 🟡 `profiles_public` view 정의에 RLS 가 자동 적용되지 않을 수 있음 (postgres 버전 의존). `SECURITY INVOKER` 명시 권장.

### 2-7. `public/appearance-ideal/` — Codex 이미지 (여자 64장)

**현재 상태**

- FI01~FI20 + 일부 재생성 (`*_NEW.jpg`)
- `prompt_FI01.txt` ~ `prompt_FI24.txt` (실제 사용 프롬프트 기록)
- `CONTACT_SHEET_*.jpg` 4종
- `METADATA.json` (fixture 8개)
- `FEMALE_GENERATION_NOTES.md`, `REGENERATED_FEMALE_IDS.txt`

**문제 / 개선점**

- ⚠️ FI21~FI64 미생성 → 월드컵 풀 충분치 않음. 현재 active 가 20장 미만이면 64강 토너먼트 자체가 어색.
- ⚠️ `METADATA.json` 이 여전히 fixture (8개) 상태. Codex 의 실제 GPT 재분석 결과로 교체되지 않음.
- ⚠️ 남자 64장 (MI01~MI64) 미시작.
- 🟡 `CONTACT_SHEET_FI01_FI16.jpg` 와 `CONTACT_SHEET_FI01_FI16_NEW.jpg` 가 공존 — 어느 게 최종인지 명시 필요.

### 2-8. `docs/`

| 파일 | 평가 |
|---|---|
| `MATCHING_SYSTEM_PLAN.md` | ⭕ 11 섹션 + 8-X 결정 기록 |
| `IDEAL_WORLDCUP_64_DESIGN.md` | ⭕ 128장 설계표 |
| `IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md` | ⭕ measured 기반 운영 계획 |
| `APPEARANCE_ANALYSIS_GPT_PROMPT.md` | ⭕ Codex SCORE_GUIDE 백분위 정의 통일 |
| `APPEARANCE_ANALYSIS_SCHEMA.md` | ⭕ JSON Schema 완성 |
| `APPEARANCE_VECTOR_CALIBRATION.md` | ⭕ 회귀 테스트 기준 포함 |
| `INTERFACE_CONTRACT.md` | 🟡 매칭 시스템 확장 필요 (preferred_* 컬럼) |
| `COLLABORATION.md` | 🟡 협업 규칙 일부 우회 상태 (충현이 매칭 인수) |
| `VENUE_DB_DESIGN.md` | 🟡 성준 작성, main 미머지 |
| `CODE_REVIEW_2026-05-21.md` | ⭕ 이 문서 |

**문제 / 개선점**

- ⚠️ `INTERFACE_CONTRACT.md` 의 `MatchingProfile` 타입에 preferred_* 필드 추가 누락. 매칭 엔진이 읽어야 할 핵심 입력값.
- 🟡 `COLLABORATION.md` 에 "충현이 매칭 인수" 상황이 반영되지 않음. 다른 사람이 코드 보면 영역 혼동 가능.

---

## 3. 횡단 이슈

### 3-1. 협업 규칙 준수

| 규칙 | 준수 여부 |
|---|---|
| `main` 브랜치 직접 push 금지 | ❌ 위반 (사용자 허락 받고 진행, 기존 커밋도 main 직접 push) |
| `lib/types.ts` 수정 시 PR + 성준 리뷰 | ⭕ 이번 세션은 안 건드림 |
| `supabase/migrations/` 신규 시 상대방 확인 | ❌ 진행 중 (`20260521_*` 두 개, 성준에게 알림 필요) |
| INTERFACE_CONTRACT 컬럼/타입 임의 변경 금지 | ⭕ 유지 |
| 성준 영역 (`python/matching/`, `app/group/`, `app/match/`, `components/matching/`) 미수정 | 🟡 인수 합의로 충현이 작성 예정 |

### 3-2. 인터페이스 계약 정합성

`docs/INTERFACE_CONTRACT.md` 와 실제 구현 비교:

| 계약 | 구현 |
|---|---|
| `profiles.appearance_score_normalized FLOAT 0~1` | ⭕ 마이그레이션 존재 |
| `profiles.appearance_type IN (cute, pure, chic, warm, stylish, healthy)` | ⭕ 6 enum 유지 (호환 레이어로 처리) |
| `available_timeslots` JSONB 형식 | ⭕ |
| `preference_weights` JSONB 형식 | ⭕ |
| `appearance_scores.score_raw` | ⭕ |
| `MatchingProfile.preferred_appearance_vector` 등 | ❌ **계약서에 없음, 신규 추가 필요** |

### 3-3. 보안 / 점수 노출 검증

| 항목 | 결과 |
|---|---|
| `appearance_score_normalized` UI 노출 | ⭕ 어떤 화면도 안 보임 |
| `appearance_vector` raw 값 UI 노출 | ⭕ 안 보임 |
| `preferred_*` raw 값 UI 노출 | ⭕ `IdealWorldcupResult` 가 `preferred_bucket_weights` 만 노출 |
| `self_appearance_score` UI 노출 | ⭕ 안 보임 |
| RLS 정책 | 🟡 신규 마이그레이션은 RLS 포함, 기존 일부 미점검 |
| 사진 URL 인증 | 🟡 `photos` 버킷 public read 정책 — GPT Vision 분석 위해 어쩔 수 없으나 URL 추측 어렵게 (UUID 경로) 처리 필요 |
| 토스페이먼츠 키 보호 | N/A (미연동) |
| `.env.local` 커밋 | ⭕ gitignore 처리됨 |

### 3-4. 미구현 / TODO 목록

매칭 시스템 (이번 인수 영역):

- [ ] `lib/matching/types.ts`
- [ ] `lib/matching/time.ts` (요일 교집합 계산)
- [ ] `lib/matching/filter.ts` (hard filter)
- [ ] `lib/matching/group-summary.ts` (그룹 데이터 집계)
- [ ] `lib/matching/score.ts` (pairScore 함수)
- [ ] `lib/matching/simulate.ts` (가상 데이터 시뮬레이터)
- [ ] `scripts/run-simulation.ts`
- [ ] `python/matching/` 전체 (헝가리안 엔진)
- [ ] `app/group/create/page.tsx` 실제 구현
- [ ] `app/group/[id]/page.tsx`
- [ ] `app/group/invite/[token]/page.tsx`
- [ ] `app/match/[id]/page.tsx`
- [ ] `app/match/post-batch/page.tsx` (Forced Match 옵션 화면)
- [ ] `components/matching/*`
- [ ] 토스페이먼츠 결제 흐름
- [ ] GPS 체크인
- [ ] 리뷰/신고
- [ ] 알림 (PWA + 이메일)

외모 시스템 (이전 영역):

- [ ] **사용자 사진 GPT Vision 분석 파이프라인** — 핵심 누락. 사진 업로드해도 분석 안 됨.
- [ ] `python/appearance/` deprecated 결정 (폐기 vs fallback 유지)
- [ ] Codex 의 FI21~FI64 + MI01~MI64 이미지 완성
- [ ] `METADATA.json` 실 분석값으로 교체
- [ ] sessionStorage → DB (`profiles.preferred_*`) 저장 흐름 교체

운영:

- [ ] Supabase 실 키 연동
- [ ] Storage `photos` 버킷 RLS 정책 적용
- [ ] 도메인 / SSL / Vercel 배포

### 3-5. 잠재 버그

1. **`app/profile/worldcup/page.tsx`**: sessionStorage 저장 후 `/profile/self-worldcup` 가 그 값을 읽지 않음 → 데이터 손실. 마이그레이션 적용 후에는 DB 저장으로 교체 필요.
2. **`IdealWorldcup.tsx`**: 후반 라운드(4명 이하)에서 `pairUpBucketAware` 가 강제 분리 → 같은 사용자 같은 버킷에 다 들어가면 처음 본 사람과 묶일 수 있음.
3. **`pool.length < 16`** 일 때 `roundLabelForSize` 가 "8강" 부터 시작 → 사용자가 64강 기대했다 "8강" 보면 어리둥절. 풀 크기 안내 또는 가드 필요.
4. **`vector.ts:meanVector`**: 빈 배열 처리는 OK 지만 다른 성별 벡터 섞이면 `detectGender` 가 첫 벡터만 보고 결정 → 침묵 버그.
5. **`Hungarian + same uuid order` 가정**: `matches.group_a_id < group_b_id` 제약이 있는데 코드에서 항상 정규화 호출하는지 보장 안 됨. 트리거로 강제하거나 INSERT 시점에 정규화.
6. **`group_members` 의 unique partial index** 가 `groups.status` 변경 시 즉시 반영 안 될 수 있음. application 레벨에서 동시 변경 락 필요.

### 3-6. 성능 우려

- 헝가리안 알고리즘이 O(n³) 이라 N=수백 그룹까지는 빠름. 그러나 사용자 수천 이상일 때 분할 매칭 필요.
- `worldcup_choice_logs` 가 사용자당 63건 (64강 풀모드) 적재 → 사용자 수 1만일 때 63만 row. 인덱스 충분.
- `match_pool` 의 `idx_match_pool_one_waiting_per_group` 가 partial unique index. status 변경 시 race condition 가능 — 트랜잭션 격리 수준 확인.

---

## 4. 우선 처리 권장

### 🔴 Critical (즉시 처리)

1. **사용자 사진 GPT Vision 분석 파이프라인 구축** — 현재 사진 업로드해도 분석 자체가 일어나지 않음. 이상형 월드컵은 풀에 대해 동작하지만 사용자 본인 외모 벡터가 없으면 매칭 양방향 비교 불가.
2. **`lib/types.ts` 에 `MatchingProfile.preferred_*` 필드 추가 PR** — 매칭 엔진 시작 전 인터페이스 합의 필요.
3. **성준의 `match_meetings` 마이그레이션과 이번 `matches` 마이그레이션 머지 순서 확인** — FK 의존성.

### 🟠 High (Phase 1 시작 전)

4. **`app/profile/worldcup/page.tsx` 의 sessionStorage → DB 저장 교체** — 마이그레이션 적용 후.
5. **`python/appearance/` deprecated 결정** — 폐기/유지/fallback.
6. **Codex 의 FI21~FI64 / MI01~MI64 이미지 완성** — 월드컵 풀 부족.
7. **`docs/INTERFACE_CONTRACT.md` 에 preferred_* 컬럼 추가 + 협업 규칙 갱신** (충현이 매칭 인수).

### 🟡 Medium (Phase 1~2 중)

8. `IdealWorldcup.tsx` 의 후반 라운드 bucket pairing 검토.
9. `vector.ts:meanVector` 에 명시적 gender 인자 추가.
10. `config.ts` 의 weight sum sanity check 를 fail-fast 로 변경.
11. `valuePercentile` tie handling 개선.

### 🟢 Low (운영 직전)

12. `bucket-to-legacy.ts` 제거 (appearance_type 컬럼 deprecated 후).
13. `pool.length < 16` 가드.
14. 매칭 시드 (`shuffle`) crypto 기반으로.

---

## 5. Codex 검토 요청 포인트

Codex 가 이 코드베이스를 동일하게 리뷰할 때 비교 가능하도록 다음 항목을 명시적으로 검토해 줘.

### 5-1. 일치 여부 확인

같은 결론이면 신뢰도 상승. 다른 결론이면 토론.

- [ ] `lib/appearance/` 의 청순 쏠림 보정 로직 (`preferred_axis_z_vector`) 이 Codex 가 요청한 "매칭에서 청순함이 무시되지 않게" 의도와 일치하는가?
- [ ] `METADATA.json` 형식이 Codex 표준 (`visual_review`, `review.decision`, `bucket_scores`) 과 일치하는가?
- [ ] `publicImageUrl()` 의 `public/` 접두사 자동 제거가 Codex 가 채울 file 경로와 호환되는가?
- [ ] `pairScore` 공식의 가중치 (외모 0.50, 성격 0.25, 점수대 0.15, 가중치정합 0.10) 가 합리적인가?
- [ ] threshold 0.45, 양방향 페널티 0.3, 점수대 ±15 가 데이팅앱 도메인에서 보수적인지 공격적인지?

### 5-2. 누락 / 추가 의견

- [ ] 이 리뷰가 빠뜨린 보안/성능/사용성 이슈가 있는가?
- [ ] python/matching 헝가리안 엔진을 Python 으로 가는 게 맞나, Node-scipy 또는 Edge function 도 가능한가?
- [ ] 매칭 못 받은 사용자 처리 (Forced Match 옵션 / 4주 이월 자동 환불) 가 사업적으로 합리적인가?
- [ ] 외모 점수대 ±15 stratification 이 cold start 시 풀 부족 위험을 키우는가?

### 5-3. 다른 의견 환영

Codex 가 다음 결정에 대해 다른 의견이 있다면 명시:

- 매칭 주기 주 1회 vs 매일
- 보증금 2만원 vs 3만원
- 그룹 인원 2~3 vs 2~5
- 페어 점수 threshold 0.45
- 자동 환불 4주

---

## 6. 결론

### 6-1. 강점

- **외모 벡터 시스템이 잘 설계됨** — Codex 백분위 정의를 single source of truth 로 통일, 청순 쏠림 보정까지 반영.
- **이상형 월드컵 measured 기반 완성** — target vs measured 분리, choice delta, axis percentile/z 모두 구현.
- **모든 점수/벡터 raw 값이 어떤 사용자 화면에도 노출 안 됨** — 보안 의도 잘 지킴.
- **계획 문서가 결정 추적 가능 구조** — 8-X 결정 기록, 각 Phase 체크박스.
- **튜닝 가능 config 분리** — 가상 데이터 실험 준비 완료.

### 6-2. 약점

- **매칭 시스템 본체 구현 거의 0%** — config.ts 만 작성됨. Phase 1~7 모두 진행 필요.
- **사용자 사진 GPT Vision 분석 파이프라인 누락** — 매칭의 절반(자기 외모 벡터)이 빠짐.
- **Codex 의 이미지 작업 미완** — FI21~FI64, MI01~MI64.
- **성준 영역 인수로 작업량 급증** — 충현 단독으로 매칭 엔진/UI 까지 만들어야 함.

### 6-3. 다음 액션

이 리뷰를 git 에 올린 후:

1. Codex 에 동일 코드베이스 리뷰 요청 (`CODE_REVIEW_CODEX_2026-05-21.md` 형식)
2. 두 리뷰 비교 후 충돌 항목 토론
3. Critical 4개 우선 처리
4. Phase 1 시작 (`lib/matching/types.ts` 부터)

---

## Appendix A — 리뷰 체크리스트 (Codex 동일 항목)

Codex 가 비교 가능하도록 동일 체크리스트 제공:

```text
[ ] lib/appearance/*.ts 의 타입 안전성
[ ] lib/matching/config.ts 의 파라미터 망라성
[ ] components/profile/IdealWorldcup.tsx 의 UI 안전성 (점수 노출 X)
[ ] supabase/migrations/ 의 FK 의존성과 RLS
[ ] python/appearance/ 의 deprecated 여부
[ ] public/appearance-ideal/ 의 진행률
[ ] docs/ 의 정합성과 결정 추적
[ ] INTERFACE_CONTRACT 와 실제 코드 정합성
[ ] 보안 (점수/벡터 노출, RLS, 키 보호)
[ ] 협업 규칙 준수 (main push, types.ts PR, 영역 침범)
[ ] 잠재 버그 (sessionStorage 손실, race condition, tie handling)
[ ] 성능 (헝가리안 O(n³), 인덱스)
```

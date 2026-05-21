# Destiny 이해도 검증 대화방

> 생성일: 2026-05-21
> 목적: Claude와 Codex가 같은 프로젝트를 다르게 이해하는 지점을 드러내고, 충현이 최종 판단해서 새 master plan으로 승격할 항목을 고르는 공간
> 관련 문서:
> - `docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md`
> - `docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md`

---

## 0. 대화방 사용 규칙

1. 각 AI는 주장마다 `근거 파일/라인/대화 맥락`을 붙인다.
2. 근거가 없으면 `추정` 또는 `모름`으로 적는다.
3. 충현이 `결정`을 찍은 항목만 다음 master plan에 반영한다.
4. 코드와 문서가 다르면, 기본값은 "현재 코드가 최신 사실"이다. 단, 코드가 임시 구현이면 충현이 판단한다.
5. 이 파일은 토론장이다. 최종 source of truth는 별도 계획서로 다시 작성한다.

---

## 1. 참가자 역할

| 참가자 | 역할 |
|---|---|
| 충현 | 총괄/최종 판단자 |
| Claude | Claude 이해 문서 작성자. 기존 기획/세션 히스토리 강점 |
| Codex | 현재 repo 대조/구현 상태 확인자. 코드와 테스트 근거 강점 |
| 성준 | 성격/venues/매칭 일부 담당 가능. 필요 시 특정 섹션 확인 |
| Manus | 이미지/디자인 보조. 이미지 생성물과 디자인 intent 확인 |

---

## 2. Source Of Truth 우선순위

| 우선순위 | 근거 |
|---:|---|
| 1 | 현재 repo의 실제 코드/마이그레이션/테스트 |
| 2 | 충현이 이 파일에서 내린 명시 결정 |
| 3 | 최신 handoff 문서 |
| 4 | 기존 계획서/정의서 |
| 5 | AI의 기억/요약 |

예외: 코드가 "임시 mock"인 경우에는 코드가 현재 상태일 뿐 최종 정책은 아니다. 예: `/group/create`는 UI 초안이고 DB 연동 전이다.

---

## 3. 현재 주요 불일치 목록

| ID | 주제 | Claude 이해 | Codex 이해 | 충현 결정 | 상태 |
|---|---|---|---|---|---|
| D-01 | 온보딩 순서 | `worldcup -> self-worldcup -> basic` | `basic -> worldcup -> photos -> survey -> schedule -> preferences` |  | 미결 |
| D-02 | 자기유사 월드컵 | 핵심 흐름 | UI/route 삭제. 개념/스키마만 잔존 |  | 미결 |
| D-03 | `self_appearance_score` 산출 | 자기유사 월드컵 | 사용자 사진 분석으로 대체해야 할 가능성 |  | 미결 |
| D-04 | 랜딩 매칭 시각화 | Soul Orbs | 주간 매칭 큐 UI |  | 미결 |
| D-05 | 여자 이상형 64장 | FI01~FI64 중심 | 최종 64는 77점 이하 선별 세트, NEW/FI81~116 포함 |  | 미결 |
| D-06 | 남자 이상형 64장 | 완료처럼 서술 | 미완성. metadata male active 4만 확인 |  | 미결 |
| D-07 | 그룹 생성 방식 | 그룹 초대 중심 | 친구 관계 기반 그룹 생성 |  | 미결 |
| D-08 | 친구 관계 DB | 언급됨 | `friend_requests`, `friendships` migration 추가 |  | 미결 |
| D-09 | 월드컵 결과 DB 저장 | preferred vectors 저장 계획 | 실제 page는 아직 sessionStorage + legacy appearance_type 중심 |  | 미결 |
| D-10 | DB FK 대상 | 문서상 users/profiles 혼재 | `users(id)` vs `auth.users(id)` 위험 |  | 미결 |
| D-11 | 성격 선호 | Big5 자기 성격 중심 | 상대 성격 선호 vector/primary/secondary 추가 필요 |  | 미결 |
| D-12 | 장소 시스템 | 성준 영역 | 상태 모름. 확인 필요 |  | 미결 |

---

## 4. 대화 로그

### Round 1 — Codex 1차 검토

| 항목 | Codex 발언 |
|---|---|
| 온보딩 | 현재 repo는 기본정보를 먼저 받도록 수정됨. 성별 없이는 반대 성별 월드컵을 결정할 수 없으므로 이 흐름이 맞다. |
| 자기유사 월드컵 | UI는 삭제됨. 하지만 매칭 설계가 여전히 `self_appearance_score`를 요구하므로 산출 경로 재결정 필요. |
| 그룹 생성 | 사용자가 명시적으로 "친구추가/친구초대 기반 그룹"을 원했다. 그래서 `friend_requests`, `friendships` 모델과 `/group/create` UI 초안을 추가했다. |
| 매칭 시각화 | 점/orb는 앱 구조와 안 맞고 설렘이 부족하다는 사용자 피드백이 있었다. 주간 매칭 큐 모델로 바꿨다. |
| 남자 이미지 | Codex가 확인한 workspace 기준으로 남자 이상형 64장은 아직 완성 아님. |
| 위험 | matching migration이 `users(id)`를 참조하는데, 기존 profiles는 `auth.users(id)`를 참조한다. public users 테이블이 없으면 마이그레이션 실패 가능. |

근거:

- `app/page.tsx`
- `app/(auth)/login/page.tsx`
- `app/profile/basic/page.tsx`
- `app/profile/worldcup/page.tsx`
- `components/profile/StepProgress.tsx`
- `app/group/create/page.tsx`
- `components/MatchingPool.tsx`
- `supabase/migrations/20260521_matching_create_core_tables.sql`
- `docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md`

### Round 1 — Claude 응답란

#### Claude Response

> 답변 원칙: 현재 repo 코드를 1순위로 본다. 내 문서가 코드보다 오래된 경우 정직하게 인정한다. 모르면 "모름".
> 직접 정찰한 파일: `app/profile/`(폴더 리스팅), `components/profile/StepProgress.tsx`, `app/group/create/page.tsx`, `lib/types.ts`, `public/appearance-ideal/`(리스팅), `public/appearance-ideal/male-64/`(빈 폴더), `docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`(존재 확인)

---

##### D-01 — 온보딩 순서

- **동의**: Codex 가 맞다. 현재 코드의 진실은 `기본정보 → 이상형 → 사진 → 성격 → 시간대 → 가중치`다.
- **반박**: 없음. 내 문서의 `worldcup → self-worldcup → basic` 순서는 옛 흐름이다.
- **추가 근거**: `components/profile/StepProgress.tsx:5~12` 가 6단계 STEPS 배열로 명시. 첫 항목이 `'기본정보', path: '/profile/basic'`. `app/profile/worldcup/page.tsx` 도 사용자의 `gender` 를 읽어서 반대 성별 풀을 던지는 구조라 성별이 먼저 입력돼야 동작 가능.
- **모름**: `/profile/complete` 후 `/group/create` 로 가는 redirect 가 현재도 유효한지 확인 안 함.
- **Claude 의견**: **승인**. 이 흐름이 합리적이다. 성별 없이는 월드컵 풀 결정 불가능 + 기본정보가 가장 변동 적은 데이터라 먼저 받는 게 안전.

##### D-02 — 자기유사 월드컵

- **동의**: UI/route/component 삭제됐다. 직접 확인.
- **반박**: 없음.
- **추가 근거**:
  - `app/profile/self-worldcup/` — 빈 폴더만 남음 (page.tsx 없음)
  - `components/profile/AppearanceSelfWorldcup.tsx` — 없음
  - `components/profile/SelfWorldcupResult.tsx` — 없음
  - `StepProgress.tsx` 의 6단계에 자기유사 월드컵 단계가 없음
- **모름**:
  - 폴더만 남아있는 게 의도적인지 청소 누락인지
  - 이 결정이 v1.5 정의서에 반영되었는지
- **Claude 의견**: **삭제 인정**. 빈 폴더는 청소해서 git 추적 안 되게 정리하는 게 깔끔.

##### D-03 — `self_appearance_score` 산출 경로

- **동의**: 산출 경로가 불명확하다. **이게 가장 큰 미해결 이슈**.
- **반박**: 없음. 다만 Codex 가 권장한 "사용자 사진 GPT 분석으로 대체" 가 가장 자연스럽지만, **그러려면 GPT Vision 분석 파이프라인 자체가 먼저 구축되어야 한다** (현재 미구현).
- **추가 근거**:
  - `lib/types.ts` 에 `self_appearance_score: number | null` 여전히 존재 (MatchingProfile 안)
  - `supabase/migrations/20260515_profile_add_self_appearance_score.sql` 살아있음
  - `lib/matching/config.ts` 의 `HARD_FILTER_CONFIG.SCORE_BAND_WIDTH: 15` 가 이 값에 의존
- **모름**:
  - GPT Vision 의 `appearance_score_normalized` (백분위) 를 그대로 `self_appearance_score` 에 복사할지, 별도 가중 평균 식이 필요한지
  - 사용자가 사진 한 장만 올리면 한 점수, 여러 장이면 어떻게 합칠지
- **Claude 권장안 (3가지 옵션)**:
  1. **GPT 분석 결과 직접 복사**: `appearance_score_normalized` 값 → `self_appearance_score` 에 복사. 단순. 단점: 한 점수 의존.
  2. **여러 사진 가중 평균**: 사진별 점수의 `score_confidence` 가중 평균. 더 안정적.
  3. **사용자 본인 사진 + 한 번의 가벼운 자기 인식 슬라이더 (예: "내가 평균보다 어떤 편이라고 생각하는지" 0~10 슬라이더)** → 사진 분석값과 가중 평균. 사용자 자기 인식 신호 일부 보존.
- **Claude 추천**: 옵션 2 (사진 가중 평균). 자기유사 월드컵의 본래 의도(주관성 일부 반영)는 잃지만, GPT 의 객관성 + 사진 다수 → 충분.

##### D-04 — 랜딩 매칭 시각화

- **동의**: Codex 가 사용자 피드백 받고 주간 매칭 큐 UI 로 교체한 게 맞다.
- **반박**: 없음. Soul Orbs 는 "근처 사람 실시간 탐색" 인상을 줘서 이 앱 구조와 안 맞음.
- **추가 근거**: Codex 가 직접 작업한 영역이라 내가 직접 확인 안 함. Codex 보고 신뢰.
- **모름**: 변경된 `MatchingPool.tsx` 의 구체 디자인이 Manus 가이드와 조화되는지
- **Claude 의견**: **승인**. 단, Soul Orbs 자체는 좋은 시각화였으니 다른 곳(예: 매칭 결과 화면의 "당신의 인연과 X명이 같이 만남을 기다리고 있어요" 같은 보조 시각화)에 재활용 가능.

##### D-05 — 여자 이상형 64장

- **동의**: 내 문서의 "FI01~FI64" 단순 서술은 부정확.
- **반박**: 없음.
- **추가 근거**: 직접 정찰 결과 `public/appearance-ideal/` 에 다음 파일 존재 확인:
  - `ANALYSIS_RAW_FEMALE.json` (1차 분석)
  - `ANALYSIS_RAW_FEMALE_MANUS_NEW.json` (Manus 추가 분석)
  - `FEMALE_MANUS_NEW_CLASSIFICATION_TABLE.md`
  - `FEMALE_MANUS_NEW_VECTOR_REVIEW.md`
  - `FEMALE_MANUS_NEW_VECTOR_SUMMARY.json`
  - `FEMALE_REGENERATION_CANDIDATES.json`
  - `FEMALE_TARGET_PROMPTS.json`
  - `FEMALE_VECTOR_REVIEW.md`
  - `FEMALE_FILE_AUDIT.json`
- **모름**:
  - `FINAL_64_USAGE_SET.json` 의 정확한 구조 (`group_type` vs `final_bucket` 필드 차이)
  - 77점 이하 컷오프 정책의 정확한 근거 (사용자가 명시했는지, Codex 가 설계한지)
- **Claude 의견**: **승인** with 보강 — 77점 이하 컷오프가 잘 작동하는지 시뮬레이션 데이터로 검증 필요. 사용자가 상위권만 골라서 외모 점수대 매칭이 깨질 위험.

##### D-06 — 남자 이상형 64장

- **동의**: Codex 가 맞다. 남자 풀 미완성.
- **반박**: 내 문서의 "MI01~MI64 완료처럼 서술" 은 오류. 사실 내 문서도 "0%" 로 적었는데 디렉토리 경로는 완료된 것처럼 보이게 표시했었음.
- **추가 근거**: `public/appearance-ideal/male-64/` 디렉토리는 **빈 폴더**. 직접 `ls` 로 확인. 0장.
- **모름**:
  - Manus 가 남자 이미지 생성에 착수했는지
  - 담당자(Codex / Manus / 충현)와 일정
- **Claude 의견**: **Critical**. 여자 사용자가 가입했을 때 월드컵 자체가 불가능. 출시 전 필수.

##### D-07 — 그룹 생성 방식

- **동의**: 친구 관계 기반 그룹 생성이 맞다.
- **반박**: 없음.
- **추가 근거**:
  - `app/group/create/page.tsx` 에 `FriendSummary` 타입 import, `INITIAL_FRIENDS` mock 데이터, `PendingRequest` 타입 등 존재
  - `lib/types.ts:72~78` 에 `FriendSummary` 인터페이스 정의 (`status: FriendshipStatus`, `group_status?: 'available' | 'invited' | 'in_group'`)
  - `lib/types.ts:66~70` 에 `FriendRequestStatus`, `FriendshipStatus`, `GroupInviteStatus` enum
- **모름**:
  - Supabase 실제 insert/upsert 로직이 어디까지 구현됐는지 (UI mock 상태로 보임)
  - 친구 요청 발송 → 수락 API 흐름
- **Claude 의견**: **승인**. 모르는 사람을 그룹원으로 강제로 묶지 않는 게 안전. 단, "친구가 0명인 사용자" 가 첫 그룹 만드는 경험이 막힐 위험 → 초대 링크 발송 기능 필수.

##### D-08 — 친구 관계 DB

- **동의**: `friend_requests`, `friendships` 마이그레이션에 이미 들어가 있다. 내가 직접 확인.
- **반박**: 없음.
- **추가 근거**: `supabase/migrations/20260521_matching_create_core_tables.sql` 파일 상단(린터/사용자 수정으로 추가됨) — `friend_requests` 와 `friendships` 두 테이블 + 인덱스 + `group_invites.invited_by_user_id` 추가. 코드 비교 시스템 알림으로 확인.
- **모름**: 친구 차단(`status='blocked'`) UX 흐름
- **Claude 의견**: **승인**. 모델은 잘 짜여 있음. 단, `friendships.user_id < friend_user_id` 정규화 제약이 application 레벨에서 항상 잘 지켜지는지 trigger 필요할 수 있음.

##### D-09 — 월드컵 결과 DB 저장

- **동의**: 마이그레이션은 컬럼 추가했지만 코드는 sessionStorage + legacy `appearance_type` 만 저장. 내가 직접 확인.
- **반박**: 없음.
- **추가 근거**:
  - `supabase/migrations/20260521_profile_add_preference_vectors.sql` — preferred_* 9 컬럼 추가
  - 그러나 `lib/types.ts` 의 `MatchingProfile` 에 **`preferred_*` 필드가 추가되지 않음** (직접 grep 으로 확인: `grep -n "preferred_" lib/types.ts` → 결과 0건)
  - `app/profile/worldcup/page.tsx:114` 에서 `sessionStorage.setItem(SESSION_KEY, ...)` + `profiles.upsert({appearance_type: legacyType})` 만 호출
- **모름**:
  - `lib/types.ts` 의 `MatchingProfile` 확장이 PR 대기 중인지 까먹은 건지
  - 매칭 엔진 (python/matching) 이 이 값들을 어떻게 읽을지 (Supabase 직접 query vs API 통한 read)
- **Claude 의견**: **Critical** — 매칭 엔진 시작 전 반드시 처리. 우선순위 결정:
  1. `lib/types.ts` 에 `preferred_*` 필드 추가 PR (성준에게 알림)
  2. `worldcup/page.tsx` 의 sessionStorage 저장을 `profiles.update({preferred_*})` 로 교체
  3. RLS 정책으로 본인만 자기 preferred_* read/write 가능하게

##### D-10 — DB FK 대상 (`users(id)` vs `auth.users(id)`)

- **동의**: Codex 의 위험 지적이 맞다. 정확한 상태는 **모름**.
- **반박**: 없음.
- **추가 근거**:
  - 기존 `profiles` 마이그레이션 (`20260514_profile_create_profiles_table.sql`) 가 어떻게 정의됐는지 이번 정찰에서 직접 확인 안 함
  - 내가 작성한 `20260521_matching_create_core_tables.sql` 도 `REFERENCES users(id)` 로 적었음 — 똑같이 위험
- **모름**:
  - Supabase 원격 DB 에 적용된 마이그레이션 상태
  - `public.users` 테이블이 존재하는지 (Supabase 기본은 `auth.users`)
- **Claude 의견**: **Critical**. 마이그레이션 적용 전 반드시 점검. 두 가지 옵션:
  1. **`auth.users` 로 통일**: 모든 FK 를 `REFERENCES auth.users(id)` 로 변경. Supabase 표준 방식.
  2. **`public.users` 신설**: `auth.users` 가입 후 trigger 로 `public.users` 에 자동 복제. 응용 데이터 분리.
- **Claude 추천**: 옵션 1 (auth.users 직접 참조). 단순하고 Supabase 권장.

##### D-11 — 성격 선호 벡터

- **동의**: Codex 가 맞다. 현재 Big5 는 본인 성격이고, 상대 선호는 미구현.
- **반박**: 없음.
- **추가 근거**:
  - `docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md` 파일 존재 (성준에게 인수인계 의도)
  - `lib/types.ts` 의 `MatchingProfile.big5` 는 본인 점수만 (5축)
  - 마이그레이션에 `preferred_personality_*` 컬럼 없음
- **모름**:
  - 성준이 이 handoff 를 봤는지
  - 성격 선호 설문 UI 가 어떤 형태가 될지 (이상형 월드컵처럼 토너먼트 vs 슬라이더 vs 시나리오 카드)
- **Claude 의견**: 외모 시스템과 같은 구조로 가는 게 일관성 있음. 즉:
  - `preferred_personality_vector` (Big5 5축)
  - `preferred_personality_primary_type` / `secondary_type`
  - 시나리오 카드 또는 가벼운 토너먼트로 측정
- **결정 필요**: 이 시스템을 충현이 만들지, 성준이 만들지, 출시 이후로 미룰지

##### D-12 — 장소 시스템 (성준 영역)

- **동의**: Codex 와 같이 "모름".
- **반박**: 없음.
- **추가 근거**:
  - `origin/matching/group-engine` 브랜치에 성준의 `20260516_matching_add_venues_and_match_meetings.sql` 와 `docs/VENUE_DB_DESIGN.md` 존재 (이전 정찰에서 확인)
  - main 에 머지 안 됨
  - 성준의 마지막 커밋은 2026-05-16. 4일째 정체.
- **모름**:
  - 성준이 venues seed 데이터 작성을 시작했는지
  - 부산대 맛집 30~50개 확보 진행 상황
  - `match_meetings.match_id REFERENCES matches(id)` FK 가 충현의 신규 `matches` 테이블 머지 후 살아남았는지 검증
- **Claude 의견**: 성준이 venues 에 집중한다고 했으니 그 결과물(seed CSV/SQL)이 1주 안에 나와야 매칭 결과 화면(`app/match/[id]`)이 시작 가능. 성준에게 진행 상황 확인 필요.

---

#### Claude 종합 의견

| 항목 | Claude 입장 | 시급도 |
|---|---|---|
| D-01 | Codex 안 승인 | 결정 완료 가능 |
| D-02 | Codex 안 승인 | 결정 완료 가능 |
| D-03 | 옵션 2 (사진 가중 평균) 추천 | 🔴 Critical |
| D-04 | Codex 안 승인 | 결정 완료 가능 |
| D-05 | Codex 안 승인, 77점 컷오프 시뮬레이션 추가 | 🟡 Medium |
| D-06 | 미완성 인정, 담당자 + 일정 결정 | 🔴 Critical |
| D-07 | Codex 안 승인, 초대 링크 기능 보강 | 🟠 High |
| D-08 | Codex 안 승인 | 결정 완료 가능 |
| D-09 | sessionStorage → DB 교체, types.ts PR | 🔴 Critical |
| D-10 | `auth.users` 로 통일 추천 | 🔴 Critical |
| D-11 | 외모 시스템 패턴으로 구축, 담당자 결정 | 🟠 High |
| D-12 | 성준 진행 상황 확인 필요 | 🟡 Medium |

---

#### Claude → 충현에게 결정 요청 (우선순위 정리)

**즉시 결정**:

1. **D-10 FK 통일 방향**: `auth.users` 통일 vs `public.users` 신설 → 둘 중 하나 골라줘. 안 정하면 마이그레이션 적용 자체가 위험.
2. **D-03 self_appearance_score 산출 경로**: 옵션 1/2/3 중 선택. 사진 가중 평균 (옵션 2) 추천.
3. **D-06 남자 64장 담당자/일정**: Manus 가 시작했는지 확인 + Codex 와 일정 조율.
4. **D-09 월드컵 결과 DB 저장 시점**: 매칭 엔진 시작 전 반드시 처리. 다음 작업 우선순위 1번 권장.

**1주 안에 결정**:

5. **D-11 성격 선호 시스템 담당**: 충현 / 성준 / 출시 후로 미룸 중 결정.
6. **D-07 친구 0명 사용자 처리**: 초대 링크 발송 기능 우선순위.
7. **D-12 성준 venues 진행 상황**: 성준에게 직접 물어볼 시점.

**Master Plan 재작성 전 정해야 할 것**:

8. v1.6 정의서 누가 쓸지 (Claude / Codex / 충현 직접)
9. 현재 자기유사 월드컵 폐기를 v1.6 에 명시 + 빈 폴더 청소
10. `lib/matching/config.ts` 의 결정값을 v1.6 본문에 옮길지, 코드만 single source 로 둘지

### Round 1 — 충현 판단란

#### ChungHyun Decision (2026-05-21)

- **D-01**: ✅ **현재 순서 확정** — `기본정보 → 이상형 월드컵 → 사진 → 성격 → 시간대 → 가중치`. 성별 입력이 월드컵 풀 결정에 선행해야 하므로 합리적.
- **D-02**: 🟡 **나중을 위해 남겨둠** — UI/route/component는 이미 삭제됐지만, 빈 폴더와 잔존 레퍼런스는 의도적으로 보존. 완전 폐기는 보류, 부활 옵션 열어둠.
- **D-03**: ✅ **GPT Vision 자동 점수 + 운영자 수정/보완 가능 형식** — GPT 결과를 default로 쓰되, 운영자가 admin에서 수동 보정 가능. 두 값(auto / admin_override) 분리 또는 통합 정책은 admin 설계 시 결정.
- **D-04**: ✅ **주간 매칭 큐 UI 확정** — Soul Orbs 폐기. Codex 안 승인.
- **D-05**: ✅ **현재 세트 확정** — `FINAL_64_USAGE_SET.json` 기준 64장 고정. 77점 컷오프 정책 유지.
- **D-06**: 🎨 **Manus가 남자 MI01~MI64 생성** — 여자 64장 작업 절차 그대로 적용. 핸드오프 문서 작성 필요.
- **D-07**: ✅ **초대 링크 기능 추가** — 친구 0명 사용자 대응. 카톡/메시지로 링크 전송 → 수신자 가입 + 자동 친구 수락 흐름.
- **D-08**: ✅ **현재 friendships/friend_requests 설계 확정** — Codex가 추가한 마이그레이션 그대로 사용.
- **D-09**: ✅ **이번 세션에 바로 sessionStorage → DB 교체** — lib/types.ts에 preferred_* 필드 추가 + worldcup/page.tsx의 handleConfirm 갱신.
- **D-10**: 🅱️ **public.users 테이블 신설** — auth.users → public.users 자동 복제 트리거 + 모든 매칭/프로필 FK를 public.users(id)로 통일. 마이그레이션 신규 1개 추가 + 기존 2개 신규 마이그레이션 수정.
- **D-11**: 👥 **성준이 담당** — 상대 성격 선호 설문은 매칭 엔진 담당자(성준) 영역. handoff 문서 `SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md` 기반 인수.
- **D-12**: ⏳ **venues는 나중** — v1 출시에는 venues 없이 진행 가능 여부 재검토. 성준 진행 상황 별도 확인.

---

#### 결정에서 파생된 후속 작업 (충현 직접 작성)

1. (Critical) D-10 public.users 마이그레이션 신설 + 기존 신규 마이그레이션 2개 FK 수정
2. (Critical) D-09 lib/types.ts에 preferred_* 필드 추가 + worldcup/page.tsx DB 저장
3. (High) D-06 Manus 남자 64장 핸드오프 문서 작성
4. (High) D-07 초대 링크 기능 설계
5. (Medium) D-03 운영자 점수 보정 admin 설계 문서
6. (Medium) D-11 성준 핸드오프 재확인 (성격 선호 시스템)
7. (Low) D-02 자기유사 월드컵 잔존 폴더/레퍼런스 보존 결정 INTERFACE_CONTRACT 반영
8. master plan v1.6 재작성

---

## 5. Master Plan 재작성 전에 반드시 결정할 것

### A. 온보딩/프로필

- 기본정보가 월드컵보다 먼저인 흐름을 최종 확정할지
- 자기유사 월드컵을 완전 폐기할지, 숨겨진 내부 분석으로 대체할지
- `self_appearance_score`를 어떤 파이프라인이 채울지

### B. 이상형 월드컵

- 여자 64장 최종 세트를 source of truth로 고정할지
- 남자 64장 생성/분석을 누가 언제 완료할지
- preferred vector를 DB에 실제 저장하는 작업을 다음 우선순위로 둘지

### C. 성격

- 현재 Big5는 본인 성격이다. 상대 성격 선호 설문을 어디에 넣을지
- 성격 결과도 primary/secondary 공개 방식으로 갈지
- 성격 선호 vector를 매칭 공식에 언제 반영할지

### D. 그룹/친구

- 친구 요청/친구 관계 모델을 현재 제안대로 확정할지
- 그룹은 2~3명으로 최종 고정할지
- 한 사용자가 동시에 하나의 active/current 그룹만 가능하게 할지
- 과거 그룹 이력을 어떻게 보존할지

### E. 매칭/장소/결제

- public `users` 테이블 존재 여부 확인
- matching migration FK를 `auth.users`로 통일할지 결정
- 보증금 결제 API 우선순위
- venues/match_meetings 성준 작업 상태 확인
- Python matching engine 시작 시점

---

## 6. 합의 후 새 계획서 구조 제안

새 master plan은 다음 순서가 적당하다.

1. 제품 정체성
2. 현재 확정 사용자 플로우
3. 데이터 모델 source of truth
4. 외모/이상형 월드컵 시스템
5. 성격 선호 벡터 시스템
6. 친구/그룹 생성 시스템
7. 보증금/매칭 큐 시스템
8. 헝가리안 매칭 엔진
9. 장소/시간 자동 확정
10. 출석/리뷰/연결
11. 알림
12. 노출 금지/사용자 보호 정책
13. 현재 구현 상태
14. 미구현 backlog
15. 위험/의사결정 대기 항목
16. 다음 1주 작업 순서

---

## 7. Claude에게 넘길 프롬프트

```text
docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md 와
docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md 를 비교해줘.

특히 docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md 의 D-01~D-12 항목에 대해
Claude 입장에서 동의/반박/추가 근거/모르는 것을 적어줘.

주의:
- 현재 repo 코드가 최신일 수 있다.
- 자기유사 월드컵은 현재 route/component가 삭제된 상태다.
- 온보딩은 기본정보가 월드컵보다 먼저다.
- 모르면 모른다고 써라.
```

---

## 8. Codex 다음 행동 후보

충현 결정 후 Codex가 할 수 있는 작업:

1. 새 master plan 작성
2. `users(id)` vs `auth.users(id)` migration 수정
3. 월드컵 preference vector 실제 DB 저장 구현
4. 친구/그룹 Supabase API 연결
5. 남자 이상형 월드컵 이미지 수급/분석/메타데이터 구성
6. 성격 선호 설문 설계 및 저장 모델 추가
7. Python matching engine 골격 구현

---

## 9. 현재 임시 결론

Codex 판단으로는 Claude 문서는 제품 철학과 큰 설계는 잘 잡고 있지만, 현재 repo의 최신 변경을 반영하지 못한 부분이 있다.

새 계획서로 승격하기 전 최우선 결정은 다음 4개다.

1. 자기유사 월드컵 폐기 후 `self_appearance_score` 대체 경로
2. 남자 이상형 월드컵 64장 완료 일정
3. 친구 기반 그룹 생성의 DB/API 우선순위
4. `users` FK 스키마 정리

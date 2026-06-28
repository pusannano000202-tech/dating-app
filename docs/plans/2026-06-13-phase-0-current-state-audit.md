# 2026-06-13 Phase 0 Current State Audit

작성일: 2026-06-13  
담당자 방: `audit-current-state`  
기준: `git status --short`, 필수 문서 5개, 현재 로컬 working tree  
브랜치: `profile/post-worldcup-decisions-2026-05-21`  
기준 커밋: `98e703a Merge remote-tracking branch 'origin/main' into profile/post-worldcup-decisions-2026-05-21`

## 0. 감사 결론

현재 dirty working tree는 하나의 기능이 아니라 아래 변경 묶음이 섞인 상태다.

1. Booting 브랜드/밝은 UI 개편
2. `/dev/preview` 로그인 우회와 로컬 검토 모드
3. 이메일 OTP 기반 로그인/환경 변수 정리
4. 매칭 가중치 4개 정책
5. 매칭 진입 전 준비 게이트
6. 무료 베타 정책과 legacy deposit/refund 문구 숨김
7. 데일리카드 16:00-20:00 사용자 직접 뽑기 정책
8. 그룹/큐 화면 디자인과 dev mock
9. 문서 정리와 팀 운영 문서

지금 새 기능을 더 얹기보다, 팀장방에서 "무엇을 살릴지"를 먼저 확정해야 한다. 특히 `lib/types.ts`, `supabase/migrations/`, `docs/engineering/INTERFACE_CONTRACT.md`, `lib/supabase.ts` 계열은 협업 규칙상 단독 확정하면 안 된다.

## 1. 변경/신규 파일 분류

### 1.1 유지할 제품 변경 후보

아래 파일들은 제품 방향과 맞다. 다만 일부는 리뷰/검증 게이트가 필요하다.

| 묶음 | 파일 | 상태 | 판단 |
|---|---|---:|---|
| Booting 브랜드/홈 | `app/page.tsx` | M | 홈이 랜딩/로그인 후 대시보드로 분리되고 Booting 브랜드가 적용됨. 유지 후보. |
| Booting 브랜드/홈 | `components/BootingLogo.tsx` | 신규 | 홈, 로그인, 관리자, 프로필 완료/수정에서 사용됨. 유지. |
| Booting 브랜드/홈 | `components/MatchingPool.tsx` | M | 밝은 UI 톤으로 조정. 유지 후보. |
| Booting 브랜드/홈 | `components/matching/ActiveMatchingHomeCard.tsx` | 신규 | 홈의 진행 중 매칭 진입점. 유지 후보. 실제 데이터 fallback 확인 필요. |
| 글로벌 디자인 | `app/globals.css` | M | dark Destiny 톤에서 밝은 Booting 톤으로 전환. 유지 후보이나 전체 화면 영향 큼. |
| 글로벌 디자인 | `tailwind.config.ts` | M | `boot.*` 색상 토큰 추가. 유지 후보. |
| 로그인/Auth UI | `app/(auth)/layout.tsx` | M | 로그인 설명을 이메일 인증 링크 기준으로 변경. 보류성 유지. |
| 로그인/Auth UI | `app/(auth)/login/page.tsx` | M | 휴대폰/OAuth 중심에서 이메일 OTP + dev preview 진입으로 전환. 기능은 유효하나 AGENTS의 휴대폰 OTP와 충돌. 팀장 결정 필요. |
| Auth callback | `app/auth/callback/route.ts` | M | redirect 안전성/환경 정리 계열로 보임. 유지 후보, auth 전체 결정과 묶어 리뷰. |
| Supabase 환경 | `.env.local.example` | M | publishable key, app origin, dev auth bypass 추가. 유지 후보. |
| Supabase 환경 | `lib/utils.ts` | M | Supabase URL/public key helper, app origin helper 추가. 유지 후보이나 공용 영향 큼. |
| Supabase 환경 | `lib/supabase.ts` | M | public key helper 사용. 공용 파일이라 리뷰 필수. |
| Supabase 환경 | `lib/supabase-server.ts` | M | server client도 public key helper 사용. 리뷰 필요. |
| Supabase 환경 | `app/api/health/route.ts` | M | health check를 auth health endpoint/public key helper 기준으로 변경. 유지 후보. |
| Supabase 환경 | `tests/config/supabase-config.test.ts` | M | publishable key/app origin 테스트 추가. 유지 후보. |
| 타입체크 범위 | `tsconfig.json` | M | nested `gwating-app` exclude. 이전 빌드 이슈 방지용으로 유지. |
| 프로필 UI | `app/profile/complete/page.tsx` | M | Booting 브랜드 적용. 유지 후보. |
| 프로필 UI | `app/profile/edit/page.tsx` | M | Booting 브랜드/로고 적용. 유지 후보. |
| 프로필 UI | `app/profile/layout.tsx` | M | 레이아웃 톤 조정. 유지 후보. |
| 프로필 UI | `app/profile/basic/page.tsx` | M | dev preview 세션이면 저장 없이 다음 단계 진행. 제품 변경보다는 dev preview와 묶어 유지. |
| 프로필 UI | `app/profile/worldcup/page.tsx` | M | dev preview 세션에서 Supabase 없이 진행, 다음 단계를 survey로 변경. 유지 후보. |
| 프로필 UI | `app/profile/survey/page.tsx` | M | 성격 테스트 후 photos로 이동, Booting 톤 적용, dev preview fallback. 유지 후보. |
| 프로필 UI | `app/profile/photos/page.tsx` | M | dev auth/Booting 흐름 관련 변경. 유지 후보. |
| 프로필 UI | `components/profile/Big5Result.tsx` | M | Booting 톤 적용. 유지 후보. |
| 프로필 UI | `components/profile/Big5Survey.tsx` | M | Booting 톤 적용. 유지 후보. |
| 프로필 UI | `components/profile/PersonalityPreferenceResult.tsx` | M | Booting 톤 적용. 유지 후보. |
| 프로필 UI | `components/profile/PersonalityPreferenceSurvey.tsx` | M | Booting 톤 적용. 유지 후보. |
| 프로필 단계 | `components/profile/StepProgress.tsx` | M | 가입 단계가 학교/이상형/성향/사진으로 축소됨. 제품 플로우 결정 필요. |
| 매칭 가중치 4개 | `app/profile/preferences/page.tsx` | M | 4개 가중치 입력 UI 사용. 유지 후보. |
| 매칭 가중치 4개 | `components/profile/PreferenceWeightInputs.tsx` | 신규 | 숫자 입력 방식 핵심 컴포넌트. 유지. |
| 매칭 가중치 4개 | `components/profile/PreferenceRecipePreview.tsx` | 신규 | 4개 비중 시각화. 유지 후보. |
| 매칭 가중치 4개 | `lib/matching/types.ts` | M | engine 전용 가중치가 `appearance/personality/height/bodyType`으로 변경. 성준 리뷰 필요. |
| 매칭 가중치 4개 | `lib/matching/group-summary.ts` | M | 그룹 평균 가중치도 4개로 변경. 성준 리뷰 필요. |
| 매칭 가중치 4개 | `tests/matching/core.test.ts` | M | 4개 가중치 테스트 반영. 유지 후보. |
| 매칭 시작 게이트 | `app/match/start/page.tsx` | 신규 | 성향 선호/가능 시간/매칭 비중을 그룹 전 단계로 안내. 유지 후보, 문구/조건 재검토 필요. |
| 매칭 시작 게이트 | `app/profile/personality-preference/page.tsx` | M | redirect/dev setup cookie 추가. 유지 후보. |
| 매칭 시작 게이트 | `app/profile/schedule/page.tsx` | M | safe redirect/dev setup cookie 추가. 유지 후보. |
| 매칭 시작 게이트 | `lib/client-redirect.ts` | 신규 | 클라이언트 redirect 안전 처리. 유지 후보. |
| 매칭 시작 게이트 | `app/api/match-pool/enter/route.ts` | M | 큐 진입 전 멤버별 성향/시간/비중 완료 확인 추가. 유지 후보이나 live DB/E2E 확인 필요. |
| 그룹/큐 | `app/group/create/page.tsx` | M | 준비 상태, 큐 레이더, 무료 베타 문구, dev mock이 크게 섞임. 기능은 살리되 분리 필요. |
| 그룹/큐 | `app/api/groups/route.ts` | M | 멤버/친구 준비 상태 필드 계열 변경으로 보임. 유지 후보, API 계약 확인 필요. |
| 그룹/큐 | `components/matching/QueueRadarCard.tsx` | 신규 | 큐 진입 완료 시각화 핵심. 유지 후보, 파일이 큼. |
| 그룹/큐 | `app/match/page.tsx` | M | match index/결과 진입 UI 계열 변경. 유지 후보. |
| 무료 베타 | `lib/constants.ts` | M | `FREE_BETA_ENABLED = true`, deposit은 legacy placeholder로 명시. 유지 후보. |
| 무료 베타 | `app/match/[id]/continuation/page.tsx` | M | 무료 베타 기준 이어가기/정산 문구. 유지 후보. |
| 무료 베타 | `app/match/[id]/refund/page.tsx` | M | 무료 베타 기간 정산 없음 화면. 유지 후보. |
| 무료 베타 | `app/notifications/page.tsx` | M | 환불/노쇼/이어가기 알림 문구를 무료 베타 기준으로 변경. 유지 후보. |
| 데일리카드 | `app/api/matches/[id]/daily-cards/route.ts` | M | `pick_match_daily_card` POST 추가. 유지 후보, migration 적용 전에는 동작 불가. |
| 데일리카드/매치 상세 | `app/match/[id]/page.tsx` | M | 무료 베타/데일리카드 UI 변경이 큰 파일에 섞임. 유지 후보, 분리 검토 필요. |
| 점수 API | `app/api/score/route.ts` | M | 외모 점수 저장/응답 안정화 계열로 보임. 유지 후보, 별도 확인 필요. |
| 학교 인증 API | `app/api/school-email/request/route.ts` | M | 학교 이메일 인증 계열 수정. auth 결정과 묶어 리뷰. |
| 학교 인증 API | `app/api/school-email/verify/route.ts` | M | 학교 이메일 인증 계열 수정. auth 결정과 묶어 리뷰. |
| 관리자 | `app/admin/layout.tsx` | M | Booting 브랜드 적용. 유지 후보. |
| 관리자 | `app/admin/page.tsx` | M | 관리자 대시보드 UI 톤 조정. 유지 후보. |
| 관리자 | `app/admin/matches/review/page.tsx` | M | 관리자 매칭 리뷰 UI 톤 조정. 유지 후보. |
| 알림 | `components/NotificationBell.tsx` | M | 미세 UI 변경. 유지 후보. |

### 1.2 dev/preview 전용 변경

이 묶음은 로컬 디자인 검토에는 매우 유용하지만, production 차단 조건을 계속 검증해야 한다.

| 파일 | 상태 | 판단 |
|---|---:|---|
| `app/dev/preview/page.tsx` | 신규 | 로컬 검토용 첫 화면. 유지하되 production 노출 금지. |
| `lib/dev-auth.ts` | 신규 | `NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'`와 non-production일 때만 dev auth 허용. 유지하되 위험 파일. |
| `lib/dev-match-setup.ts` | 신규 | dev preview에서 성향/시간/비중 완료 쿠키를 표시. 유지하되 실제 완료 상태와 혼동 금지. |
| `middleware.ts` | M | `/dev/preview` 진입 시 `booting_dev_auth=1` 쿠키 발급, dev auth면 보호 라우트 통과. 유지하되 최상위 위험 파일. |
| `tests/config/booting-branding.test.ts` | 신규 | dev preview/branding 회귀 테스트. 유지 후보. |
| `app/profile/basic/page.tsx` | M | dev preview fallback. 유지. |
| `app/profile/worldcup/page.tsx` | M | dev preview fallback. 유지. |
| `app/profile/survey/page.tsx` | M | dev preview fallback. 유지. |
| `app/profile/personality-preference/page.tsx` | M | dev setup completion cookie. 유지. |
| `app/profile/schedule/page.tsx` | M | dev setup completion cookie. 유지. |
| `app/profile/preferences/page.tsx` | M | dev setup completion cookie. 유지. |
| `app/group/create/page.tsx` | M | dev group/friend/deposit/queue mock이 페이지 내부에 섞임. 유지하되 Phase 4 분리 대상. |
| `app/(auth)/login/page.tsx` | M | dev preview 진입 버튼/쿠키 발급이 로그인 화면에 있음. 유지 여부는 팀장 결정 필요. |

### 1.3 문서 변경

| 파일 | 상태 | 판단 |
|---|---:|---|
| `AGENTS.md` | 신규 | 사용자 제공 AGENTS 지침과 동일한 프로젝트 컨텍스트. 유지. |
| `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md` | M | 최신 결정/상태 갱신. 유지. |
| `docs/plans/README.md` | M | 계획 문서 인덱스 갱신. 유지. |
| `docs/plans/2026-06-12-thread-context-consolidated-audit.md` | 신규 | 현재 결정을 잘 요약한 기준 문서. 유지. |
| `docs/plans/2026-06-12-codex-team-workflow-reset-plan.md` | 신규 | 팀장방/담당자방 운영 기준. 유지. |
| `docs/plans/2026-06-12-preference-weight-number-input-plan.md` | 신규 | 4개 가중치 숫자 입력 계획. 유지. |
| `docs/plans/2026-06-02-pre-meeting-excitement-info-plan.md` | 신규 | pre-meeting 카드/흥미 정보 계획. 유지하되 최신 정책과 충돌 여부 표시 필요. |
| `docs/engineering/2026-06-12-auth-login-handoff.md` | 신규 | auth/login handoff. 유지하되 휴대폰 OTP vs email OTP 결정 필요. |
| `docs/engineering/INTERFACE_CONTRACT.md` | M | 4개 가중치 계약 반영. 공용 계약이라 리뷰 필수. |
| `docs/SUNGJUN_MEETING_AGENDA_2026-06-01.md` | M | 09:00 자동 공개가 stale임을 상단에 표시. 유지. |
| `docs/product/matching/DAILY_CARD_SPEC_2026-05-28.md` | M | 09:00 초안 stale 안내 추가. 유지. |
| `docs/product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` | M | 09:00 초안 stale 안내 추가. 유지. |

### 1.4 migration 변경

| 파일 | 상태 | 판단 |
|---|---:|---|
| `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` | 신규 | 데일리카드 16:00-20:00 draw window, `pick_match_daily_card`, missed forfeited 처리. 제품 방향과 맞지만 상대방 확인 없이 main merge 금지. 실제 Supabase 적용 여부 확인 필요. |

### 1.5 삭제/보류 후보

| 파일 | 상태 | 판단 |
|---|---:|---|
| `components/profile/PreferenceSliders.tsx` | M | 현재 코드 import 없음. 새 `PreferenceWeightInputs.tsx`로 교체된 것으로 보인다. 삭제 후보. 단, 1회 `rg`/typecheck 후 제거. |
| `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md` | 신규 | 루트에 있는 산발 문서. 내용 확인 후 `docs/archive/` 이동 또는 삭제 후보. |
| `app/group/create/page.tsx` | M | 버릴 파일은 아니지만 dev mock, 무료 베타, 큐 UI, 실제 API가 한 파일에 과밀. 보류/분리 후보. |
| `app/match/[id]/page.tsx` | M | 버릴 파일은 아니지만 데일리카드/무료 베타/상세 UI가 큰 diff로 섞임. 보류/분리 후보. |

## 2. 지금 살릴 것

팀장방에서 바로 살려도 되는 우선순위는 아래 순서다.

1. `/dev/preview` 로컬 검토 모드
   - 근거: 최신 문서에서 디자인 검토를 막지 않는 기준선으로 확정됨.
   - 살릴 파일: `app/dev/preview/page.tsx`, `lib/dev-auth.ts`, `lib/dev-match-setup.ts`, `middleware.ts`, `tests/config/booting-branding.test.ts`.
   - 조건: production에서 `NEXT_PUBLIC_DEV_AUTH_BYPASS`가 켜지지 않도록 배포 env 확인.

2. Booting 브랜드와 밝은 UI 개편
   - 근거: 여러 화면이 이미 BootingLogo/boot 색상 토큰에 연결됨.
   - 살릴 파일: `components/BootingLogo.tsx`, `app/globals.css`, `tailwind.config.ts`, `app/page.tsx`, 로그인/프로필/관리자 UI 변경.
   - 조건: 주요 화면 5개 브라우저 확인 필요.

3. 매칭 가중치 4개 정책
   - 근거: 최신 제품 결정과 `CURRENT_IMPLEMENTATION_STATUS.md` 기준에 부합.
   - 살릴 파일: `components/profile/PreferenceWeightInputs.tsx`, `components/profile/PreferenceRecipePreview.tsx`, `app/profile/preferences/page.tsx`, `lib/matching/types.ts`, `lib/matching/group-summary.ts`, `tests/matching/core.test.ts`.
   - 조건: `lib/types.ts`와 `INTERFACE_CONTRACT.md`는 공용 계약 파일이라 리뷰 게이트 필요.

4. 무료 베타 사용자 화면
   - 근거: 초기 배포는 전면 무료 베타라는 최신 결정과 일치.
   - 살릴 파일: `lib/constants.ts`, `app/group/create/page.tsx`, `app/match/[id]/page.tsx`, `app/match/[id]/continuation/page.tsx`, `app/match/[id]/refund/page.tsx`, `app/notifications/page.tsx`.
   - 조건: DB/RPC는 아직 deposit/refund legacy이므로 "무료 베타 DB 정리 완료"라고 말하면 안 됨.

5. 데일리카드 16:00-20:00 직접 뽑기
   - 근거: 최신 결정과 일치.
   - 살릴 파일: `app/api/matches/[id]/daily-cards/route.ts`, `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`, 관련 product docs stale 안내.
   - 조건: migration 실제 적용 여부와 로그인 계정 E2E 검증 필요.

6. 매칭 시작 게이트
   - 근거: 매칭 비중은 가입 프로필이 아니라 매칭 진입 전 설정이라는 최신 흐름과 맞음.
   - 살릴 파일: `app/match/start/page.tsx`, `app/profile/personality-preference/page.tsx`, `app/profile/schedule/page.tsx`, `app/profile/preferences/page.tsx`, `app/api/match-pool/enter/route.ts`, `lib/client-redirect.ts`.
   - 조건: 성준이 읽는 매칭 엔진 입력 계약과 맞는지 확인 필요.

## 3. 버릴 후보

바로 삭제하지 말고, 별도 cleanup 티켓에서 확인 후 처리한다.

| 후보 | 이유 | 권장 처리 |
|---|---|---|
| `components/profile/PreferenceSliders.tsx` | 현재 코드 import 없음. 새 숫자 입력 컴포넌트로 대체됨. | 삭제 후보. `rg PreferenceSliders`와 typecheck 통과 후 제거. |
| `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md` | 루트 산발 문서이며 앱 구조와 직접 연결되지 않음. | 내용 확인 후 `docs/archive/` 이동 또는 삭제. |
| stale 09:00 데일리카드 본문 | 문서 상단에 stale 안내는 들어갔지만 본문에는 09:00 언급이 남아 있음. | 당장 삭제보다는 docs cleanup phase에서 본문 정리. |
| legacy deposit/refund 사용자 문구 | 무료 베타와 충돌하는 화면 문구는 대부분 숨겨졌으나 DB/RPC 이름은 남아 있음. | 화면 문구는 살리고 DB cleanup은 별도 migration 계획으로 분리. |

## 4. 보류할 것

아래는 가치가 있지만 지금 확정하면 충돌 위험이 있다.

| 항목 | 보류 이유 | 다음 확인 |
|---|---|---|
| 이메일 OTP 로그인 전환 | AGENTS에는 휴대폰 OTP가 기술 스택으로 적혀 있음. 현재 코드/테스트는 email OTP 기준. | 실제 MVP 인증 방식을 팀장방에서 결정. |
| `lib/types.ts` 4개 가중치 변경 | 제품 결정과 맞지만 공용 타입 파일이다. | PR/상대방 리뷰 대상. |
| `docs/engineering/INTERFACE_CONTRACT.md` 4개 가중치 변경 | 공용 계약 문서다. | 성준 리뷰 대상. |
| `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` | 제품 방향과 맞지만 신규 migration이다. | Supabase 적용 여부와 상대방 확인 필요. |
| `lib/supabase.ts`, `lib/supabase-server.ts`, `lib/utils.ts` | publishable key 지원은 유효하지만 공용 Supabase 클라이언트 경로다. | auth/env 전체 리뷰 필요. |
| `middleware.ts` dev auth bypass | preview에는 필요하지만 보호 라우트 전체에 영향. | production env 차단 테스트 필요. |
| `app/group/create/page.tsx` | 핵심 화면이지만 1,137줄로 너무 큼. | Phase 4에서 page shell + components로 분리. |
| `app/match/[id]/page.tsx` | 핵심 화면이지만 1,135줄로 너무 큼. | 데일리카드/무료 베타 UI 분리 검토. |
| `app/api/match-pool/enter/route.ts` 준비 게이트 | 서버 상태 기반이라 방향은 좋음. 다만 `preference_weights != null`만 보며 4개 key 유효성은 약함. | 4개 key 검증 추가 계획 필요. |
| `components/matching/QueueRadarCard.tsx` | 현재 큐 디자인 핵심이지만 475줄 단일 컴포넌트. | 유지 후 하위 컴포넌트 분리 검토. |

## 5. 위험 파일 목록

위험도는 "충돌/운영 영향/리뷰 필요성" 기준이다.

| 위험도 | 파일 | 이유 |
|---|---|---|
| 높음 | `lib/types.ts` | 공용 타입. AGENTS와 협업 문서상 PR + 상대방 리뷰 필수. |
| 높음 | `docs/engineering/INTERFACE_CONTRACT.md` | 공용 계약 문서. 임의 확정 금지. |
| 높음 | `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` | 신규 DB migration. 상대방 확인 없이 main merge 금지. 실제 적용 여부 미확인. |
| 높음 | `middleware.ts` | dev auth bypass가 보호 라우트 전체에 영향. production 차단 실패 시 치명적. |
| 높음 | `lib/supabase.ts` | 공용 Supabase browser client. auth 전체 영향. |
| 높음 | `lib/supabase-server.ts` | 서버 Supabase client. API/SSR 전체 영향. |
| 높음 | `lib/utils.ts` | Supabase 설정 판정 helper. 설정 누락/오판 시 전체 앱 영향. |
| 높음 | `app/(auth)/login/page.tsx` | 인증 방식을 휴대폰/OAuth에서 email OTP로 바꿈. 제품/기술 스택 결정 충돌. |
| 높음 | `app/api/match-pool/enter/route.ts` | 큐 진입 서버 조건 변경. 실제 사용자가 큐 진입 못 할 수 있음. |
| 높음 | `app/group/create/page.tsx` | 그룹 생성/초대/무료 베타/dev mock/큐 UI가 섞인 대형 파일. |
| 높음 | `app/match/[id]/page.tsx` | 매치 상세/데일리카드/무료 베타 게이트가 섞인 대형 파일. |
| 중간 | `.env.local.example` | 새 env 키 이름이 실제 배포 설정과 불일치하면 auth가 막힘. |
| 중간 | `app/globals.css` | 전역 테마 변경으로 모든 화면에 영향. |
| 중간 | `tailwind.config.ts` | 디자인 토큰 변경. 모든 UI 영향. |
| 중간 | `tsconfig.json` | nested app exclude는 필요하지만 타입체크 범위 변경. |
| 중간 | `app/api/matches/[id]/daily-cards/route.ts` | migration 적용 전 POST 호출 실패 가능. |
| 중간 | `components/profile/StepProgress.tsx` | 가입 단계 축소가 실제 onboarding 요구와 다를 수 있음. |
| 중간 | `components/profile/PreferenceSliders.tsx` | 삭제 후보인데 아직 modified 상태. 정리 전 혼동 가능. |
| 중간 | `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md` | 루트 untracked 산발 문서. PR에 섞이면 안 됨. |

## 6. Phase 0 검증 결과

2026-06-13 팀장방에서 현재 working tree 기준으로 새로 확인했다.

### 6.1 명령 검증

| 검증 | 결과 | 메모 |
|---|---:|---|
| `npm run typecheck` | PASS | `tsc --noEmit` 통과. |
| `npm run lint` | PASS | `next lint` 통과. |
| `npm run test:config` | PASS | 22/22 통과. |
| `npm run test:matching` | PASS | 22/22 통과. |

주의: 이번 Phase 0에서는 dev server를 유지하기 위해 `npm run build`를 새로 실행하지 않았다. 2026-06-12 상태 문서에는 build PASS 기록이 있으나, 현재 dirty working tree 기준의 fresh build 증거는 아직 없다.

### 6.2 브라우저 검증

브라우저는 `http://localhost:3003` 로컬 서버 기준으로 확인했다.

| URL/흐름 | 결과 | 확인 내용 |
|---|---:|---|
| `/` | PASS | 홈이 열리고 `오늘은 뭘 해볼까요?`, `친구추가`, `매칭찾기`, `주간 매칭 큐`가 보임. 로그인 튕김/에러/문자 깨짐 없음. |
| `/dev/preview` | PASS | 디자인 확인 모드가 열리고 홈, 기본 정보, 이상형 월드컵, 성향 설문, 사진 업로드, 매칭 준비, 그룹 만들기 링크가 보임. 에러/문자 깨짐 없음. |
| `/match/start` | PASS | `매칭찾기 준비 완료`, `설정이 전부 끝났어요`, `그룹 만들고 매칭 찾기`가 보임. 로그인 튕김 없음. |
| `/profile/preferences` | PASS | 4개 가중치 설명 화면이 열림. `학교`, `취미`, `시간대` 가중치가 노출되지 않음. 로그인 튕김/문자 깨짐 없음. |
| `/group/create` | PASS with note | 직접 진입 시 로딩 후 그룹/프로필 준비 상태가 보임. 로그인 튕김/에러/문자 깨짐 없음. |
| `/group/create?from=home-queue` -> `이번 주 매칭 큐에 들어가기` | PASS | 버튼 클릭 후 `매칭 큐 진입 완료`, `남자 8팀`, `여자 6팀`, `우리 2명 대기중`, `홈으로 나가기`, `매칭 결과 확인하기`, `큐에서 빠지기`가 보임. |

### 6.3 확인된 결론

- preview 경로의 로그인 튕김 문제는 현재 기준 주요 검토 경로에서 재현되지 않았다.
- 큐 레이더 화면은 `/group/create?from=home-queue`에서 큐 진입 버튼을 눌렀을 때 정상 노출된다.
- `/group/create` 직접 진입은 큐 완료 화면이 아니라 그룹 준비 상태부터 보여준다. 이 동작을 유지할지, preview에서는 바로 큐 검토 상태로 보낼지는 다음 Phase에서 결정해야 한다.
- `git diff --shortstat` 기준 tracked 변경만 59개 파일, 2,065 insertions, 1,073 deletions다. 여기에 untracked 신규 파일/마이그레이션/문서가 추가로 있다.

## 7. 팀장방 결정 결과

2026-06-13 사용자 결정으로 아래 항목을 Phase 0 기준선에 반영한다.

| 항목 | 결정 | 처리 |
|---|---|---|
| MVP 인증 방식 | 이메일 인증/이메일 OTP 기준 | 현재 구현 방향을 유지한다. AGENTS의 휴대폰 OTP 표기는 향후 재검토 대상으로 둔다. |
| 매칭 가중치 | 현재 기준 4개 유지: 외모, 성격, 키, 체형 | `appearance`, `personality`, `height`, `body_type` 계약을 기준으로 삼는다. |
| 초기 배포 과금 | 완전 무료 | deposit/refund/app-fee UX는 사용자 화면에서 계속 뒤로 뺀다. |
| 데일리카드 | 사용자가 직접 카드 뽑는 방식 | 16:00-20:00 draw window 정책을 유지한다. |
| 신규 DB migration | DB 작업으로 분리 | `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`은 별도 DB worker/phase로 넘긴다. |
| `group/create` 정리 | 다음 Phase에서 진행 | 기능 변경이 아니라 코드 구조 정리로 이해 완료. Phase 1 worker brief로 넘긴다. |

### 7.1 `group/create` 정리가 의미하는 것

`app/group/create/page.tsx`는 지금 1,137줄짜리 한 파일 안에 아래 내용이 같이 들어 있다.

- 친구 초대 UI
- 그룹 멤버 상태 UI
- 무료 베타 참여 확인 UI
- 매칭 큐 진입 버튼
- 큐 레이더 완료 화면
- dev preview/mock 데이터
- 실제 API 호출 흐름

즉, 사용자가 보는 기능을 바꾸자는 말이 아니라 **한 파일에 너무 많이 들어간 코드를 나눌지** 묻는 것이다. 지금 상태로 계속 디자인 수정하면 작은 문구나 버튼을 바꿀 때도 그룹/큐/무료베타/dev mock이 같이 얽혀서 다시 꼬일 가능성이 높다.

결정: 다음 Phase에서 `group/create`를 바로 삭제하거나 갈아엎는 것이 아니라, 화면은 유지하면서 아래처럼 쪼갠다.

- `GroupCreatePageShell`: 페이지 전체 흐름
- `GroupMemberStatusPanel`: 친구/멤버 준비 상태
- `InviteFriendPanel`: 초대 입력/링크 복사
- `FreeBetaQueuePanel`: 무료 베타 참여 확인과 큐 진입 버튼
- `QueueRadarCard`: 큐 진입 완료 레이더
- `dev group mock`: dev preview 전용 데이터로 분리

Phase 1 작업 지시서: `docs/plans/2026-06-13-phase-1-group-create-refactor-worker-brief.md`

## 8. 아직 팀장방 결정이 남은 사항

1. 공용 계약 리뷰 요청 여부
   - `lib/types.ts`, `docs/engineering/INTERFACE_CONTRACT.md`, `lib/matching/types.ts`, `lib/matching/group-summary.ts`의 4개 가중치 변경을 성준 리뷰에 올릴지 결정해야 한다.

2. dev preview 허용 범위
   - `/dev/preview`와 dev auth cookie를 어느 환경까지 허용할지, 배포 env에서 어떤 테스트로 막을지 결정해야 한다.

3. 무료 베타 DB cleanup 시점
   - 화면 문구는 무료 베타로 살리고, deposit/refund DB/RPC cleanup migration은 별도 계획으로 뺄지 결정해야 한다.

4. 삭제 후보 처리
   - `PreferenceSliders.tsx` 삭제, 루트 산발 문서 이동/삭제를 cleanup 티켓으로 바로 열지 결정해야 한다.

5. fresh build 검증 시점
   - 현재 Phase 0에서는 typecheck/lint/test/browser까지만 새로 확인했다. 다음 worker 작업을 시작하기 전 `npm run build`를 한 번 더 돌릴지 결정해야 한다.

## 9. 권장 다음 순서

1. Phase 1 worker brief 기준으로 `app/group/create/page.tsx` 분리 작업 진행
2. 공용 계약 변경 묶음 리뷰 요청
3. DB worker/phase로 `20260602_z54_daily_card_draw_policy.sql` 검증/적용 작업 분리
4. dev preview production 차단 검증
5. `npm run build` fresh 검증
6. `PreferenceSliders.tsx`와 루트 산발 문서 cleanup

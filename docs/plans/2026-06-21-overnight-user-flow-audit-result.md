# 2026-06-21 야간 사용자 흐름 감사 결과

## 1. 한 줄 결론

현재 앱은 프론트 흐름과 mock/dev preview가 빠르게 붙어 있지만, 배포 기준에서는 `실제 DB 저장`, `mock 상태`, `정책 결정 필요`가 섞여 있다. 먼저 안전하게 처리할 수 있는 것은 부산대 학과 검색 source 보강과 사용자 흐름 문서화이며, 결제 실연동/DB migration/공용 타입 변경은 아직 바로 건드리면 안 된다.

## 1.5 성준 회신 반영 결론

성준 회신 기준으로 보면, 지금 가장 큰 위험은 "성준 코드와 충돌"이 아니라 "성준 기준에는 없는 이름을 우리 쪽에서 이미 실제 스키마처럼 다루는 것"이다.

- 성준 `dating-app` 본체에서 확실히 굳은 것은 Toss 보증금 결제 레이어다.
- `match_meetings`, `venues`, `enter_match_pool`, `connections` RPC/테이블, `member_match_setup_ready`, `current_user_match_setup`, `16~20시 직접 뽑기`는 성준 기준에는 대응물이 없다고 봐야 한다.
- `gwating-app`에는 일정 조율, 데일리 Q&A, 당일 채팅 UX가 있지만 localStorage/mock 프로토타입이다.
- 현재 우리 로컬 계약 문서는 `preference_weights` 4개 기준인데, 성준 회신은 7개 기준이라고 말한다. 이건 코드 수정 전에 계약 합의가 필요하다.
- 따라서 지금은 새 migration이나 공용 타입을 추가하지 말고, 프론트에서 가능한 수정과 문서 정리만 먼저 진행한다.

## 2. 현재 브랜치와 dirty 작업트리

- 현재 브랜치: `profile/post-worldcup-decisions-2026-05-21`
- 원격 대비: `origin/profile/post-worldcup-decisions-2026-05-21`보다 2커밋 앞섬
- 커밋 금지 상태: 사용자 지시상 아직 커밋하지 않음

### 프론트 변경

- `app/(auth)/login/page.tsx`
- `app/friends/page.tsx`
- `app/group/create/page.tsx`
- `app/group/invite/[token]/page.tsx`
- `app/match/page.tsx`
- `app/match/start/page.tsx`
- `app/notifications/page.tsx`
- `app/page.tsx`
- `app/profile/schedule/page.tsx`
- `components/MatchingPool.tsx`
- `components/matching/DailyCardHintWizard.tsx`
- `components/matching/HomeTodayTaskCard.tsx`
- `components/matching/group-create/*`
- `components/profile/BasicInfoForm.tsx`
- `components/profile/SchedulePicker.tsx`
- `components/matching/CurrentGroupPreview.tsx`
- `components/matching/HomeInfoButton.tsx`
- `components/ui/*`

### API/DB 연결 변경

- `app/api/admin/matches/[id]/route.ts`
- `app/api/friend-requests/route.ts`
- `app/api/profiles/check-nickname/route.ts`

### 결제/환불 관련 변경

- `app/match/[id]/continuation/page.tsx`
- `app/match/[id]/refund/page.tsx`는 현재 dirty 목록에는 없지만 감사 대상이다.
- `lib/refund/fee-flow.ts`는 현재 보증금 10,000원과 앱 기여금 계산의 핵심이다.

### 문서/테스트 변경

- `docs/handoff/README.md`
- `tests/config/booting-branding.test.ts`
- `docs/plans/2026-06-21-overnight-user-flow-frontend-backend-plan.md`

### 로컬/mock helper

- `lib/matching/dev-preview-group.ts`
- `lib/matching/pre-match-card-draft.ts`
- `app/profile/match-card/*`

## 3. 사용자 전체 동선 상태표

| 순서 | 사용자 행동 | 현재 상태 | 근거 파일/API | 문제 | 다음 조치 |
| --- | --- | --- | --- | --- | --- |
| 1 | 이메일/Google 로그인 | 부분 구현 | `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts` | 앱 코드는 있으나 Supabase/Google/Vercel 설정이 없으면 배포에서 실패 | 대시보드 설정 체크리스트 별도 작성 |
| 2 | 기본정보 입력 | 실제 구현됨 | `app/profile/basic/page.tsx`, `components/profile/BasicInfoForm.tsx` | 학과 목록이 사용자가 준 최신 목록보다 짧다 | `lib/pnu-departments.ts` 보강 |
| 3 | 닉네임 중복 확인 | DB 강제 구현, 적용 검증 필요 | `app/api/profiles/check-nickname/route.ts`, `app/api/profiles/claim-nickname/route.ts`, `supabase/migrations/20260622_profile_display_name_claims.sql` | 정규화 claim 테이블과 profiles trigger로 신규 중복 저장을 막는다. production Supabase 적용은 아직 하지 않음 | migration 리뷰/적용 후 실제 DB 검증 |
| 4 | 학과 검색/선택 | 구현 후 검증 일부 완료 | `components/profile/BasicInfoForm.tsx`, `lib/pnu-departments.ts`, `tests/profile/pnu-departments.test.ts` | 학과 source와 검색 함수는 보강됨. 실제 브라우저 화면 검증은 아직 필요 | `/profile/basic` 브라우저 확인 |
| 5 | 이상형 월드컵 | 실제 구현됨에 가까움 | `app/profile/worldcup/page.tsx`, `components/profile/IdealWorldcup.tsx` | 기본정보 성별을 반대로 바꿔 후보를 고르는 코드가 있으나 화면 검증 필요 | 남자/여자 양쪽 route 검증 |
| 6 | 성격 검사 | 부분 구현 | `app/profile/survey/page.tsx`, `lib/matching/score.ts` | 성격 제거 여부가 아직 정책 결정 필요 | 결정 전 제거 금지 |
| 7 | 선호 성향 | 실제 구현됨에 가까움 | `app/profile/personality-preference/page.tsx`, `lib/matching/match-setup-status.ts` | 우리 로컬은 4개 가중치 기준인데, 성준 회신은 7개 가중치 기준이다 | 코드 수정 전 계약 합의 |
| 8 | 사진 업로드 | 실제 구현됨 | `app/profile/photos/page.tsx` | Storage bucket 설정/권한은 배포 설정 확인 필요 | Supabase Storage 설정 체크 |
| 9 | 가능 시간 입력 | 실제 구현됨 | `app/profile/schedule/page.tsx` | UI/문구는 현재 dirty 변경 있음 | 화면 검증 필요 |
| 10 | 매칭 비중/선호 나이 | 실제 구현됨에 가까움 | `app/profile/preferences/page.tsx`, `lib/matching/score.ts` | 나이 점수 계산 함수는 있으나 실제 매칭 엔진 입력까지 검증 필요 | 나이 loader/RPC 확인 |
| 11 | 사전 카드 | DB 저장 구현, 적용 검증 필요 | `app/profile/match-card/page.tsx`, `app/api/profile/match-card-draft/route.ts`, `supabase/migrations/20260622_matching_pre_match_card_drafts.sql` | 로그인 사용자는 `pre_match_card_drafts`에 저장한다. production Supabase 적용은 아직 하지 않음 | migration 리뷰/적용 후 실제 DB 검증 |
| 12 | 친구 요청 | 부분 구현 | `app/api/friend-requests/route.ts`, `app/friends/page.tsx` | 닉네임 기반 API는 있으나 DB 중복/초대 UX 검증 필요 | 브라우저 route 확인 |
| 13 | 그룹 생성/초대 | 부분 구현 | `app/group/create/page.tsx`, `components/matching/group-create/*` | dev preview와 실제 그룹 상태가 섞일 위험 | source 통일 확인 |
| 14 | 매칭 찾기 gate | 실제 구현됨에 가까움 | `app/match/start/page.tsx`, `app/api/match-pool/enter/route.ts`, `lib/matching/match-setup-status.ts` | 성향/시간/비중과 멤버별 사전 카드 DB 완료를 함께 검사한다. 단 migration 적용 전 production에서는 검증 불가 | migration 적용 후 실제 그룹으로 확인 |
| 15 | 보증금 결제 | mock 구현 + Toss 흡수 후보 | `app/api/deposits/route.ts`, `app/api/payments/deposit/*`, `lib/payments/deposit.ts` | 성준 회신 기준 실결제는 Toss 단일이다. provider 목록은 `mock`, `toss`만 유지한다 | Toss 기준 env/confirm/cancel만 별도 정리 |
| 16 | 환불/앱 기여금 | 부분 구현 | `app/match/[id]/refund/page.tsx`, `app/api/matches/[id]/refund/route.ts`, `lib/refund/fee-flow.ts` | 0~10,000원 앱 기여금 선택, 1,000원 단위 slider/preset, 3천-2천-1천 제안 흐름은 코드에 반영됨. 다만 실제 DB RPC 결과와 브라우저 UX 검증은 남음 | refund route와 실제 화면 검증 |
| 17 | 데일리카드 | 우리 브랜치 일부 구현 + 성준 gwating 프로토타입 존재 | `app/api/matches/[id]/daily-cards/route.ts`, `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`, `gwating-app/app/match/qa` 계열 | 성준 `gwating-app`은 자동 분배/localStorage/mock이고, 우리 16~20 직접 뽑기와 정책이 다르다 | 정책 합의 전 DB 확장 금지 |
| 18 | 연락처/채팅 공개 | 우리 브랜치 일부 구현 + 성준 gwating 프로토타입 존재 | `app/api/matches/[id]/connections/route.ts`, `app/api/matches/[id]/chat/route.ts`, `gwating-app/app/match/chat` | 성준 기준 `connections` RPC/테이블과 `match_meetings` 실체가 없다고 회신함 | 실제 공개 시점/스키마 합의 필요 |
| 19 | 관리자 검토/노쇼 | 부분 구현 | `app/admin/matches/[id]/page.tsx`, `app/api/admin/matches/[id]/route.ts`, `app/api/matches/[id]/finalize-no-show/route.ts` | 인증사진 Storage 흐름은 확인 필요 | MVP 범위 결정 필요 |

## 4. 실제 구현됨

- 기본정보 저장: `app/profile/basic/page.tsx`에서 `profiles` upsert와 `users.phone` upsert를 수행한다.
- 사진 업로드: `app/profile/photos/page.tsx`에서 Supabase Storage upload, `photos` insert, `profiles.is_profile_complete` upsert를 수행한다.
- 가능 시간 저장: `app/profile/schedule/page.tsx`에서 `profiles.available_timeslots`를 저장한다.
- 매칭 비중/선호 나이 저장: `app/profile/preferences/page.tsx`에서 `profiles.preference_weights`, `preferred_age_min`, `preferred_age_max`를 저장한다.
- 월드컵 성별 분기 코드: `app/profile/worldcup/page.tsx`에서 저장된 `profiles.gender`를 읽고 반대 성별 후보를 `IdealWorldcup`에 넘긴다.
- 나이 점수 함수: `lib/matching/score.ts`에 `ageFitScore`가 있고 선호 나이 범위를 반영한다.
- 사전 카드 초안 DB 저장: `app/api/profile/match-card-draft/route.ts`가 `pre_match_card_drafts`에 user별 초안을 upsert한다.
- 닉네임 claim: `profile_display_name_claims`와 `trg_profiles_guard_display_name_claim`이 신규 중복 닉네임 저장을 막는다.

## 5. 부분 구현됨

- 로그인: 이메일 OTP와 Google OAuth 코드는 있으나 Supabase/Google/Vercel 대시보드 설정이 필요하다.
- 닉네임 중복 확인: DB claim 구조는 추가됐지만 migration 적용 전까지 운영 DB에서는 검증할 수 없다.
- 친구 요청: 닉네임 기반 요청 생성은 있으나 실제 화면 검증이 필요하다.
- 매칭 찾기 gate: 서버 route가 그룹 멤버 전원의 성향/시간/비중/사전 카드 완료를 검사한다. 단 새 migration이 실제 Supabase에 적용되어야 운영 검증 가능하다.
- 보증금/결제: mock provider는 동작하도록 설계되어 있으나 실결제 provider 호출은 아직 준비 단계다.
- 결제 provider: 현재 우리 코드의 `lib/payments/deposit.ts`는 성준 회신 반영 후 `mock`, `toss`만 유지한다. 실제 외부 승인 호출은 아직 없고, Toss 단일 흡수 대상이다.
- 환불/앱 기여금: backend 계산 구조와 사용자 요구의 1,000원 단위, 3천/2천/1천 제안 흐름은 반영됐다. 실제 RPC 결과와 브라우저 UX 검증은 남아 있다.
- 데일리카드/연락처/채팅: route와 migration은 있으나 실제 화면 흐름 검증이 필요하다.

## 6. 로컬/mock만 있음

- `app/profile/match-card/page.tsx`: dev/비로그인 preview에서는 localStorage fallback을 유지한다.
- `lib/matching/pre-match-card-draft.ts`: dev preview와 구버전 local 상태 호환용 cookie helper로 남아 있다.
- `lib/matching/dev-preview-group.ts`: 홈/매칭/그룹 preview source.
- Supabase 미설정 또는 인증 없는 preview에서 닉네임 중복 확인은 preview mode로 available 처리한다.
- mock 보증금 결제는 `mock_pay_deposit` RPC로 paid 상태만 만든다.

## 7. 미구현 또는 증거 부족

- 부산대 학과 source는 사용자 제공 목록으로 보강했고 `npm run test:profile`에서 검증했다. 실제 UI 브라우저 확인은 아직 필요하다.
- 환불 페이지는 `0~10,000원`, `1,000원 단위`, `3,000원 -> 2,000원 -> 1,000원` 제안 흐름까지 코드에 반영됐다. 실제 refund RPC 결과와 사용자 화면 확인은 아직 필요하다.
- 사전 카드 DB 저장 코드는 추가됐지만 production Supabase에는 적용하지 않았다.
- 닉네임 DB claim 코드는 추가됐지만 production Supabase에는 적용하지 않았다.
- 실제 Toss 승인 호출은 아직 없다. Kakao/PortOne은 성준 회신 기준 이번 흡수 기본 대상이 아니며, provider 목록에서도 제외했다.
- `app/api/payments/deposit/confirm/route.ts`는 `provider !== 'mock'`일 때 실제 승인 검증 대신 `awaiting_provider_webhook` 응답을 반환한다.
- `app/api/payments/deposit/webhook/route.ts`도 provider payload를 실제 서명 검증하거나 DB에 반영하지 않고 수신 자리만 둔 상태다.
- 결제 webhook이 실제 provider 이벤트를 검증해 DB를 맞추는지는 미완성이다.
- 인증사진 기반 노쇼 판단은 구현 증거가 부족하다.
- 홈/매칭/그룹/알림이 같은 상태 source로 완전히 통일됐는지는 브라우저 검증 필요하다.

## 8. 사용자 결정 필요

1. 보증금 기본액 10,000원 유지 + 환불 단계 앱 기여금 0~10,000원 선택 구조 확정 여부.
2. 앱 기여금 UI를 슬라이더, 스텝 버튼, 스크롤 선택 중 무엇으로 갈지.
3. 3,000원만요 -> 2,000원만요 -> 1,000원만요 구걸 UX를 어느 정도 강하게 보여줄지.
4. 성격 검사를 제거할지, 입력 부담만 줄이고 내부 점수로 유지할지.
5. 사전 카드/닉네임 claim migration을 성준 리뷰 후 적용할지.
6. “비슷한 나이” 기준을 동갑, +-1세, +-2세, 나이대 중 무엇으로 표현할지.
7. 연락처 공개 시점이 매칭 확정 직후인지, 만남 당일인지, `scheduled_start` 도달 시점인지.
8. `preference_weights`를 우리 현재 4개 기준으로 유지할지, 성준 회신의 7개 기준으로 다시 합의할지.
9. 데일리카드를 우리 16~20시 직접 뽑기 방식으로 갈지, 성준 `gwating-app`의 자동 분배 방식으로 갈지.
10. `match_meetings`, `venues`, `connections`, `group_members` 같은 스키마를 우리 브랜치 기준으로 살릴지, 성준 기준에 맞춰 새 계약부터 다시 잡을지.

## 9. 바로 수정 가능한 프론트 항목

- `/profile/basic`에서 보강된 학과 검색 UI가 실제로 후보를 보여주는지 브라우저 확인.
- 환불 페이지 금액 step과 구걸 UX는 코드상 반영됐으므로, 실제 화면/route 검증으로 전환.
- 홈/매칭/그룹에서 같은 preview group source를 쓰는지 정리.
- 매칭 찾기 전 상대 카드가 결과처럼 보이지 않도록 문구/위치 조정.

## 10. DB/API 변경이 필요한 항목

- 사전 카드 DB 저장은 코드/migration 추가 완료. local/staging 적용 검증 필요.
- 결제 provider 실연동.
- 결제 webhook provider signature 검증.
- 성준 Toss confirm/cancel 방식과 현재 `checkout_ready`/`awaiting_provider_webhook` 임시 route의 차이 정리.
- 닉네임 DB claim 정책은 코드/migration 추가 완료. local/staging 적용 검증 필요.
- 인증사진 기반 노쇼 판정.
- 성격 제거 시 `match_setup_status`, 매칭 score, onboarding 흐름 재설계.
- `preference_weights` 4개/7개 계약 합의.
- 성준 기준에는 없는 `match_meetings`, `venues`, `connections`, `enter_match_pool` 계열을 실제로 쓸지 계약 합의.
- `gwating-app` localStorage Q&A/채팅 프로토타입을 Supabase 저장 구조로 옮길지 결정.

## 10.5 이번 추가 점검에서 확정한 증거

### 닉네임/친구 요청

- `app/api/profiles/check-nickname/route.ts`는 `is_profile_display_name_available` RPC로 정규화 claim 기준 가능 여부를 반환한다.
- `app/api/profiles/claim-nickname/route.ts`는 `claim_profile_display_name` RPC로 닉네임을 확정한다.
- `app/api/friend-requests/route.ts`는 `receiver_nickname`으로 `resolve_profile_display_name` RPC를 호출해 친구 요청 대상을 찾는다.
- `receiver_phone`은 insert 시 `null`로 들어가므로, 현재 신규 요청 흐름은 전화번호 중심이 아니라 닉네임 중심에 가깝다.
- `profile_display_name_claims`와 `trg_profiles_guard_display_name_claim`이 신규 중복 닉네임 저장을 DB에서 막는다.

### 매칭 찾기 gate

- `app/api/match-pool/enter/route.ts`는 다음 조건을 서버에서 확인한다.
  - 로그인한 사용자.
  - `group_id` 존재.
  - 사용자가 해당 그룹 멤버인지.
  - 사용자가 그룹 리더인지.
  - 활성 멤버가 2명 이상인지.
  - 활성 멤버 수가 `groups.size`에 도달했는지.
  - 모든 멤버의 `personality_preference_completed_at`, `available_timeslots`, `preference_weights`가 완료됐는지.
- 위 조건이 통과해야 `enter_match_pool` RPC를 호출한다.
- 단, 성준 최신 회신 기준으로 `enter_match_pool`은 성준 기준 스키마에 없다고 했으므로, 이 route는 우리 브랜치 구현 후보로 분류하고 계약 합의가 필요하다.

### 이상형 월드컵 성별 분기

- `app/profile/worldcup/page.tsx`는 실제 Supabase 모드에서 `profiles.gender`를 읽는다.
- 성별이 없으면 월드컵을 진행하지 않고 기본정보 보완 안내를 보여준다.
- `gender === 'male'`이면 `female`, 그 외 `male`을 `IdealWorldcup`에 넘겨 반대 성별 후보를 보여주는 구조다.
- dev preview에서는 기본값을 `female`로 두기 때문에 남성 후보 월드컵을 기본 실행한다. 실제 성별별 화면 검증은 브라우저에서 추가 확인해야 한다.

### 결제/환불

- `app/api/payments/deposit/confirm/route.ts`는 `provider !== 'mock'`일 때 실제 Toss 승인 검증 대신 `awaiting_provider_webhook`을 반환한다.
- `app/api/payments/deposit/webhook/route.ts`는 provider readiness와 payload 수신 자리만 있고, 서명 검증과 DB 반영은 없다.
- `app/api/matches/[id]/refund/route.ts`는 `app_fee_amount`를 받아 `refund_amount = DEPOSIT_AMOUNT - app_fee_amount`로 계산한 뒤 `submit_refund_request` RPC를 호출한다.
- 따라서 환불 금액 계산 연결은 있지만, 실제 환불/정산의 최종 상태 전이는 DB RPC 검증이 필요하다.

## 10.6 하위 에이전트 읽기 전용 감사 반영

### Noether: DB/API 스키마 감사

- 현재 우리 브랜치에는 `venues`, `match_meetings`, `enter_match_pool`, `connections`, `group_members`, `friend_requests`, `deposits`가 실제 migration/API에 존재한다.
- `venues`, `match_meetings`는 `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`에 있다.
- `enter_match_pool`은 `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`에 있고, `app/api/match-pool/enter/route.ts`에서 호출한다.
- `friend_requests`, `group_members`, `deposits`, `connections`는 `supabase/migrations/20260521_matching_create_core_tables.sql`에 있다.
- 따라서 "성준 기준에는 없음"과 "우리 현재 브랜치에는 있음"이 동시에 맞다. 결론은 삭제가 아니라 `우리 로컬 구현 후보 / 합의 필요 스키마`로 분리하는 것이다.
- `enter_match_pool` RPC 자체는 z50 기준 보증금 선결제를 요구하지 않는다. 보증금 선결제 정책을 큐 진입 조건으로 둘 경우 RPC 또는 route를 다시 설계해야 한다.
- 현재 `preference_weights` 코드 근거는 4키다. DB는 JSONB라 4키/7키 제약이 없다.
- `profiles.display_name`은 사용자 표시값으로 남기고, 신규 중복 방지는 `profile_display_name_claims`와 profiles trigger가 담당한다.

### McClintock: 프론트 동선 감사

- P1: `/match`와 `/notifications`의 임시 매칭 단계에서 상대 그룹 규모, 성별, 학과 같은 결과성 정보가 빠르게 보인다. 매칭 찾기 전/가매칭 단계에서 너무 많이 보여주면 사용자가 "이미 매칭된 상대가 보이는 것"처럼 느낄 수 있다.
- P1: 홈 설명은 큐 숫자와 상대 카드는 매칭 화면에서 본다고 말하지만, 랜딩 홈의 `MatchingPool`은 큐 숫자를 보여준다. 홈/매칭 역할 분리가 덜 됐다.
- P2: `HomeTodayTaskCard`, `GroupHeader`, `group/create` 문구가 "친구 초대만", "2명 이상"처럼 들려 실제 조건인 정원 완료, 멤버별 설정 완료, 리더 큐 진입보다 쉬워 보인다.
- P2: 혼성 그룹/대표 성별 기준 설명이 홈 정보, 풀 카드, 레이더 카드에 흩어져 있다. 큐 진입 완료 화면의 남자/여자 팀 숫자에도 대표 성별 기준 설명이 필요하다.
- P3: 친구 초대는 대체로 로그인/회원가입 후 수락 흐름이 명시되어 있다. 다만 `초대중`은 `수락 대기`가 더 직관적이다.

### 바로 반영한 프론트 문구 수정

- `components/matching/group-create/status.ts`: 친구 초대 상태를 `초대중`에서 `수락 대기`로 변경.
- `components/matching/group-create/FriendListPanel.tsx`: 초대된 친구 버튼 라벨을 `초대 중`에서 `수락 대기`로 변경.
- `components/matching/group-create/InviteFriendPanel.tsx`: pending invite 라벨을 `초대 중`에서 `수락 대기`로 변경.
- `components/matching/group-create/GroupHeader.tsx`: "2명 이상"만 강조하던 문구를 "정원 + 멤버별 성향/시간/비중 완료" 조건으로 수정.
- `components/matching/HomeTodayTaskCard.tsx`: "친구 초대만"으로 오해될 수 있는 홈 CTA 문구를 서버 gate 조건에 맞게 수정.
- `components/matching/QueueRadarCard.tsx`: 혼성그룹 가능과 남자/여자 팀 수가 대표 성별 기준이라는 설명을 큐 완료 화면에도 추가.
- `app/match/page.tsx`: pending 매칭 카드에서 상대 그룹 규모/성별을 바로 보여주지 않고 `가매칭 후보가 도착했어요`로 낮춤. 확정 이후에는 기존처럼 상대 그룹 정보를 보여준다.
- `app/notifications/page.tsx`: `match_created` 알림의 상대 그룹/학과/학교 칩을 제거하고, `상대 정보는 확정 후 단계 공개`와 다음 행동 중심으로 변경.
- `app/page.tsx`: 비로그인 랜딩 홈에서 `MatchingPool` 큐 숫자 카드를 제거하고, 숫자 없는 3단계 흐름 안내로 변경. 로그인 후 홈 설명처럼 큐 숫자와 상대 카드는 매칭 화면에서 확인하는 구조로 맞춤.
- `tests/config/booting-branding.test.ts`: 홈이 `MatchingPool`을 직접 포함하지 않고 `LandingFlowRow`를 쓰는 새 기준을 테스트로 고정.

## 11. 이번 자율 실행에서 하지 말아야 할 것

- production Supabase 변경.
- 실제 결제사 호출.
- 새 migration 추가.
- `lib/types.ts`, `lib/supabase.ts`, `supabase/migrations/` 무단 수정.
- 보증금 기본액과 앱 기여금 개념을 섞어서 변경.
- 성준 디자인 통째 복사.
- 성준 기준에 없는 스키마 이름을 합의 없이 실제 표준처럼 확정.
- `preference_weights`를 4개에서 7개로, 또는 7개에서 4개로 임의 변경.
- `gwating-app` localStorage 프로토타입을 DB 연동 완료 기능처럼 보고.

## 12. 다음 명령 추천

```text
팀장방, 감사 결과 기준으로 DB/API 변경 없이 가능한 프론트 항목부터 진행해.
1순위는 `/profile/basic` 학과 검색 브라우저 확인, 2순위는 환불 앱 기여금 UX의 1,000원 단위/3천-2천-1천 구걸 흐름 정리, 3순위는 홈/매칭/그룹 preview source 통일 점검이다.
공용 파일이나 migration은 건드리지 말고, 수정 후 typecheck/lint/test:config/test:profile 범위로 검증해.
```

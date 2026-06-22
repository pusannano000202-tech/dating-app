# 야간 장시간 작업 진행 인수인계

## 현재 목표

`docs/plans/2026-06-21-overnight-user-flow-frontend-backend-plan.md` 기준으로 장시간 자율 실행 작업을 진행한다.

## 현재 브랜치

- `profile/post-worldcup-decisions-2026-05-21`
- 원격 대비 3커밋 앞섬
- 현재 추가 수정분은 아직 커밋하지 않았다.

## 현재까지 진행

1. 계획서 확인 완료.
2. 현재 dirty 작업트리 확인 완료.
3. 감사 결과 문서 생성:
   - `docs/plans/2026-06-21-overnight-user-flow-audit-result.md`
4. 부산대 학과 source 보강을 구현했다.
5. `npm run test:profile` 검증을 통과했다.
6. 환불/앱 기여금 UX를 1,000원 단위와 3,000원/2,000원/1,000원 제안 흐름으로 조정했다.
7. `npm run test:config` 검증을 통과했다.
8. 성준 회신을 계획서와 감사 결과에 반영했다.
9. `npm run typecheck`, `npm run lint` 검증을 통과했다.
10. 코드리뷰 결과 문서를 생성했다:
   - `docs/plans/2026-06-21-overnight-code-review-result.md`
11. 홈/매칭/그룹 로컬 preview source를 점검했고, 그룹 생성 화면의 보증금 요약 user_id가 preview 멤버 id와 어긋나던 문제를 수정했다.
12. `curl` 기반 route-level 확인을 수행했다.
13. 추가 코드 감사로 닉네임 친구요청, 매칭 큐 진입 gate, 이상형 월드컵 성별 분기, 결제/환불 route 상태를 확인했다.
14. 하위 에이전트 2개를 읽기 전용으로 사용했다.
   - Noether: DB/API 스키마 증거 감사.
   - McClintock: 홈/매칭/그룹/알림 프론트 동선 감사.
15. 감사 결과와 코드리뷰 문서에 하위 에이전트 결과를 반영했다.
16. DB/API 변경 없이 가능한 프론트 문구를 일부 정리했다.
   - `초대중`, `초대 중` -> `수락 대기`.
   - 홈의 `친구 초대만 마치면 매칭 찾기 가능` 문구를 서버 gate 조건에 맞게 수정.
   - 그룹 헤더를 `정원 + 멤버별 성향/시간/비중 완료` 조건으로 수정.
   - 큐 레이더 카드에 혼성그룹 가능/대표 성별 기준 설명 추가.
17. `/match`와 `/notifications`의 pending/match_created 결과성 정보 노출을 낮췄다.
   - `/match` pending 카드는 상대 그룹 규모/성별 대신 `가매칭 후보가 도착했어요`로 표시.
   - `/notifications` `match_created` 카드는 상대 학과/학교/그룹 상세 칩 대신 확정 후 공개 안내와 다음 행동 칩으로 표시.
   - 확정 매칭에서는 상대 그룹 규모/대표 성별을 계속 보여준다.
18. 비로그인 랜딩 홈의 `MatchingPool` 큐 숫자 카드를 제거하고, 숫자 없는 3단계 흐름 안내로 대체했다.
19. `tests/config/booting-branding.test.ts`를 새 홈 역할 기준에 맞게 수정했다.
20. 성준 회신 기준을 반영해 결제 provider 목록을 `mock`, `toss`로 좁혔다.
   - `mock`은 로컬/검토용이다.
   - 실결제 흡수 대상은 Toss 단일이다.
   - KakaoPay/PortOne은 이번 MVP 결제 provider에서 제외했다.
21. `/dev/preview`의 성준 흡수 상태 문구를 낮췄다.
   - `venues`, `match_meetings`는 "흡수 완료"가 아니라 "우리 브랜치 후보 스키마 + 성준 기준 계약 합의 필요"로 표시한다.
   - 홈 디자인도 성준 디자인 통째 복사가 아니라 우리 톤 기준 정리로 표시한다.

## 핵심 판단

- 보증금은 10,000원 기준이 현재 코드/테스트/DB mock RPC에 고정돼 있다.
- 사용자가 원하는 것은 보증금 1,000원 전환이 아니라, 환불 단계에서 앱 기여금을 0~10,000원 사이 1,000원 단위로 고르는 UX다.
- `lib/refund/fee-flow.ts`는 앱 기여금 -> 환불 금액 계산을 이미 지원한다.
- `app/match/[id]/refund/page.tsx`는 이번 작업에서 1,000원 단위 선택과 3,000원/2,000원/1,000원 제안 흐름으로 조정했다.
- `lib/pnu-departments.ts`는 사용자가 제공한 부산대 학과 목록 기준으로 보강했다.
- `components/profile/BasicInfoForm.tsx`는 학과 input 포커스 시 browseable 후보를 띄우도록 연결했다.
- 기본정보 -> 이상형 월드컵은 코드상 `profiles.gender`를 읽고 반대 성별 후보를 보여준다. 브라우저 검증은 아직 필요하다.
- 나이 매칭은 `lib/matching/score.ts`에 `ageFitScore`가 있지만 실제 매칭 엔진 입력까지 이어지는지는 추가 확인 필요하다.
- 성준 회신 기준으로 실제로 굳은 백엔드는 Toss 보증금 결제 레이어다.
- 성준 기준에는 `match_meetings`, `venues`, `enter_match_pool`, `connections` RPC/테이블, `16~20시 직접 뽑기`가 없다고 봐야 한다.
- `gwating-app`의 일정 조율/데일리 Q&A/당일 채팅은 UX 참고용 localStorage/mock 프로토타입이다.
- `preference_weights`는 우리 로컬 계약 문서가 4개 기준이고 성준 회신은 7개 기준이라, 코드 수정 전 계약 합의가 필요하다.
- 현재 우리 결제 provider 목록은 성준 회신 반영 후 `mock`, `toss`만 유지한다. Toss checkout/confirm/cancel/webhook 서버 코드는 들어왔지만, sandbox env와 dashboard 설정이 없어 실제 외부 E2E 검증은 아직 없다. KakaoPay/PortOne은 이번 흡수 대상에서 제외했다.
- 홈과 매칭은 이미 `DEV_PREVIEW_GROUP_MEMBERS`를 공유하고 있었다. 그룹 생성 화면도 멤버는 같은 source였지만 보증금 요약만 `dev-user-1`, `dev-user-2`를 써서 불일치가 있었다.
- 이번 수정으로 group-create dev 보증금 요약은 `DEV_PREVIEW_CURRENT_USER_ID`, `DEV_PREVIEW_FRIEND_MINJI_ID`를 사용한다.
- 현재 우리 브랜치에는 `venues`, `match_meetings`, `enter_match_pool`, `connections`, `group_members`, `friend_requests`, `deposits`가 migration/API로 존재한다.
- 단, 성준 최신 회신 기준에는 위 이름 중 일부가 없다고 했으므로 `우리 로컬 구현 후보 / 합의 필요 스키마`로 분리해야 한다.
- `app/api/match-pool/enter/route.ts`는 그룹 멤버 여부, 리더 여부, 최소 2명, 정원 충족, 모든 멤버의 성향/시간/비중 완료를 검사한다.
- 하지만 z50의 `enter_match_pool` RPC 자체는 보증금 선결제를 요구하지 않는다.
- 닉네임 친구요청은 현재 `profile_display_name_claims` 기준 RPC로 닉네임을 user_id로 해석한다. 전화번호 중심 신규 요청은 아니다.
- `/match`, `/notifications`의 pending/match_created 단계 결과성 정보 과노출은 이번 수정으로 낮췄다.
- 홈 랜딩의 `MatchingPool` 큐 숫자 노출과 "큐/상대 카드는 매칭 화면에서" 설명 충돌은 `MatchingPool` 제거와 3단계 흐름 안내로 정리했다.

## 수정 파일

현재 이번 목표에서 새로 만든 파일:

- `docs/plans/2026-06-21-overnight-user-flow-audit-result.md`
- `docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md`
- `tests/profile/pnu-departments.test.ts`
- `docs/plans/2026-06-21-overnight-code-review-result.md`

현재 이번 목표에서 수정한 파일:

- `lib/pnu-departments.ts`
- `components/profile/BasicInfoForm.tsx`
- `tsconfig.profile-tests.json`
- `lib/refund/fee-flow.ts`
- `app/match/[id]/refund/page.tsx`
- `tests/config/refund-fee-flow.test.ts`
- `docs/plans/2026-06-21-overnight-user-flow-frontend-backend-plan.md`
- `docs/plans/2026-06-21-overnight-user-flow-audit-result.md`
- `lib/matching/dev-preview-group.ts`
- `components/matching/group-create/dev-state.ts`
- `docs/plans/2026-06-21-overnight-code-review-result.md`
- `components/matching/HomeTodayTaskCard.tsx`
- `components/matching/QueueRadarCard.tsx`
- `components/matching/group-create/FriendListPanel.tsx`
- `components/matching/group-create/GroupHeader.tsx`
- `components/matching/group-create/InviteFriendPanel.tsx`
- `components/matching/group-create/status.ts`
- `app/match/page.tsx`
- `app/notifications/page.tsx`
- `app/page.tsx`
- `tests/config/booting-branding.test.ts`
- `lib/payments/deposit.ts`
- `tests/config/deposit-policy.test.ts`
- `app/dev/preview/page.tsx`

이전부터 dirty 상태였던 파일은 감사 문서에 분류되어 있다.

## 검증 결과

- `npm run test:profile` 실행 완료.
- 결과: 13개 테스트 통과, 실패 0.
- `npm run test:config` 실행 완료.
- 결과: 29개 테스트 통과, 실패 0.
- `npm run typecheck` 실행 완료.
- 결과: 통과.
- `npm run lint` 실행 완료.
- 결과: ESLint 경고/오류 없음.

추가 검증:

- dev preview source 통일 수정 후 `npm run typecheck` 재실행 완료.
- dev preview source 통일 수정 후 `npm run test:config` 재실행 완료.
- dev preview source 통일 수정 후 `npm run test:profile` 재실행 완료.
- dev preview source 통일 수정 후 `npm run lint` 재실행 완료.
- 결과: 모두 통과.
- `curl` route 확인:
  - `/` 200, `현재 함께하는 친구`, `매칭 현황` marker 확인.
  - `/match` 200, `현재 함께하는 친구`, `매칭 현황` marker 확인.
  - `/profile/basic` 200, 로그인 튕김 없음. 단, 클라이언트 렌더 marker는 HTTP 본문에서 확인 안 됨.
  - `/group/create` 200, 로그인 튕김 없음. 단, 클라이언트 렌더 marker는 HTTP 본문에서 확인 안 됨.
- 브라우저 자동화는 현재 Node REPL sandbox meta 오류로 실행하지 못했다.
- 추가 감사/문구 수정 후 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
  - `npm run test:config` 통과. 29개 테스트 통과.
  - `npm run test:profile` 통과. 13개 테스트 통과.
  - `rg "초대중|초대 중|친구 초대만|2명 이상 모이면" app components -S` 결과 없음. PowerShell exit 1은 검색 결과 없음 의미.
- pending/match_created 정보 노출 수정 후 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
  - `npm run test:config` 통과. 29개 테스트 통과.
  - `npm run test:profile` 통과. 13개 테스트 통과.
- 홈 랜딩 `MatchingPool` 제거 후 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
  - `npm run test:config` 통과. 29개 테스트 통과.
  - `npm run test:profile` 통과. 13개 테스트 통과.
- 성준 회신 반영 후 결제 provider를 `mock`, `toss`로 좁힌 뒤 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
  - `npm run test:config` 통과. 29개 테스트 통과.
  - `npm run test:profile` 통과. 13개 테스트 통과.
- `/dev/preview` 상태 문구 조정 후 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
- 로컬 3004 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/group/create` 200.
  - 실제 화면 눈검수는 아직 필요하다.
- 인앱 브라우저 자동화 재시도:
  - `node_repl/js`가 `sandbox-state-meta: missing field sandboxPolicy` 오류로 실패했다.
  - 따라서 이번 턴의 화면 검증은 HTTP route 응답과 테스트 검증으로 제한된다.

## 다음 작업

1. 실제 브라우저에서 `/profile/basic` 학과 input 포커스 시 후보가 뜨는지 확인한다.
2. 실제 브라우저에서 `/group/create` 보증금 요약과 그룹 멤버가 같은 사람으로 보이는지 확인한다.
3. 성준 Toss `prepare/confirm/cancel/orders/toss helper/internal secret` 구조를 실제 코드로 흡수할지 별도 phase로 분리한다.
4. `preference_weights` 4개/7개 계약 충돌은 구현하지 말고 성준과 합의 질문으로 남긴다.
5. `gwating-app` Q&A/채팅 프로토타입은 UX 참고 대상으로만 보고, Supabase 스키마 합의 전 DB 구현으로 옮기지 않는다.
6. 보증금 선결제를 큐 진입 전 조건으로 둘지, 가매칭 후 조건으로 둘지 결정한 뒤 `enter_match_pool` route/RPC를 맞춘다.
7. `/match`, `/notifications`, 비로그인 랜딩 홈의 변경은 실제 브라우저에서 사용자 체감 확인이 필요하다.
8. 실제 브라우저에서 `/profile/basic` 학과 검색 후보와 `/group/create` 보증금 요약/멤버 표시도 함께 확인한다.

## 2026-06-23 추가 진행

### 그룹 멤버/혼성 집계

- 실제 그룹 멤버 내보내기 UI를 `친구 관리 -> 그룹에서 내보내기` 흐름으로 정리했다.
- `get_group_member_summaries(UUID)`가 active 멤버의 `gender`도 반환하도록 새 migration을 추가했다.
- 그룹 화면은 active 멤버 기준으로 `남자 그룹`, `여자 그룹`, `혼성 그룹`, `성별 확인 중`을 다시 계산한다.
- 남남이었다가 남녀로 그룹 구성이 바뀌는 경우, `left_at IS NULL`인 현재 멤버만 기준으로 집계하도록 테스트를 추가했다.
- 커밋 `7fcd738 feat: support group size matching and mixed queue stats`는 GitHub 원격 브랜치에 push 완료했다.

### 결제/Vercel 배포 preflight

- `scripts/check-payment-env.mjs`가 Toss 배포 모드에서 `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`, `PAYMENT_PROVIDER=toss`까지 요구하도록 강화했다.
- 키가 있어도 provider mode가 `mock`이면 Vercel 배포 전 검사에서 실패하게 했다.
- 실제 secret 값은 코드/문서/테스트에 쓰지 않았다.
- 현재 로컬 `.env.local`에는 Supabase 공개 설정만 있고 Toss 관련 env와 server-only env는 없다.
- `vercel` CLI는 현재 로컬에서 잡히지 않고, `.vercel/project.json`도 없다.
- Supabase 플러그인 계정에서는 성준이 넘긴 새 Supabase 프로젝트가 보이지 않아, 이 세션에서 새 DB migration 적용 검증은 못 했다.

### 로컬 route 회복

- 오래 떠 있던 Next dev 서버가 `.next` 청크를 잃어 500을 내던 문제를 확인했다.
- 워크스페이스 내부 `.next`만 경로 확인 후 삭제하고 3004 dev 서버를 재시작했다.
- 재확인 결과:
  - `/dev/preview` 200
  - `/group/create?size=2` 200
  - `/match/dev-match-pending` 200
  - `/match/dev-match-1` 200

## 2026-06-22 추가 진행

### 추가 수정

22. 기본정보 화면의 모바일 입력 UX를 더 정리했다.
   - 닉네임 중복 확인 버튼은 화면상 `중복 확인`으로 짧게 보이되, 접근성 라벨은 `닉네임 중복 확인`으로 유지했다.
   - 체형 선택은 모바일에서 2열, 데스크톱에서 4열로 보이게 바꿨다.
   - 학과/학년 입력은 모바일에서 세로로 쌓이게 바꿨다.
   - 학과 검색 후보에는 학과명 아래 단과대명을 함께 보여준다.
23. `lib/pnu-departments.ts`에 `getDepartmentCollege()`를 추가했다.
   - 검색 후보에서 `컴퓨터공학전공 -> 정보의생명공학대학`처럼 소속 단과대를 표시하기 위한 순수 helper다.
24. 매칭 큐 숫자 시각화를 보정했다.
   - `components/MatchingPool.tsx`에서 남자/여자 팀 수가 0이면 막대도 0으로 표시한다.
   - 이전에는 0팀이어도 최소 막대가 보여서 실제 대기 팀이 있는 것처럼 보일 수 있었다.
25. 그룹 생성 화면의 큐 진입 버튼 아이콘을 결제 카드에서 레이더 아이콘으로 바꿨다.
   - 큐 진입은 결제 자체가 아니고, 보증금 결제는 가매칭/확정 단계에서 따로 다뤄야 하므로 의미를 분리했다.
26. 알림의 `match_created` 카드 문구를 조정했다.
   - `상대 그룹`이라는 맥락은 주되, 상세 정보는 `상세는 확정 후 공개`로 숨긴다.
   - 사용자가 가매칭을 결과 확정으로 오해하지 않게 하는 목적이다.
27. `npm run test:matching`이 오래된 `.tmp/matching-tests` 산출물을 실행하지 않도록 `package.json` 스크립트를 보강했다.
   - 기존에는 source에서 사라진 예전 테스트 JS가 `.tmp`에 남아 있으면 같이 실행되어 실패할 수 있었다.

### 추가 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 29개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run build` 통과.
  - 첫 시도는 `.next` 캐시가 예전 route manifest를 물고 있어 `/api/group-invites/accept` page data 수집에서 실패했다.
  - 실제 source file은 존재했다.
  - 프로젝트 내부 `.next`만 경로 확인 후 삭제하고 재빌드했으며, 깨끗한 빌드는 통과했다.
- 로컬 3004 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/profile/basic` 200.
  - `/group/create` 200.
  - `/match/dev-match-pending` 200.
  - `/match/dev-match-1` 200.
- `.next` 삭제 때문에 기존 dev server가 500을 반환해서, 3004를 잡고 있던 이 프로젝트의 Next dev server만 재시작했다.
  - 재시작 후 위 8개 route가 다시 200으로 응답했다.

### 아직 남은 검증 한계

- 인앱 브라우저 자동화는 계속 `sandbox-state-meta: missing field sandboxPolicy` 오류로 연결되지 않았다.
- Playwright는 프로젝트에 설치되어 있지 않다.
- 따라서 이번 추가 검증은 `Invoke-WebRequest` route 200, 테스트, 빌드 기준이다.
- 실제 모바일 화면에서 글자 겹침/하단 탭 가림/학과 후보 팝오버 위치는 사용자가 직접 눈검수하거나 브라우저 도구가 복구된 뒤 확인해야 한다.

### 다음 우선순위

1. 실제 브라우저에서 `/profile/basic`을 열고 학과 input 포커스/검색/선택이 편한지 확인한다.
2. 실제 브라우저에서 `/match`와 `/group/create`의 “현재 함께하는 친구”가 같은 source로 보이는지 확인한다.
3. `/notifications`에서 가매칭 알림이 상대 상세를 너무 빨리 까지 않는지 눈으로 확인한다.
4. 커밋 전에는 `git status`를 다시 분류하고, staged diff 요약을 먼저 보고한다.
5. 성준과 합의가 필요한 항목은 아직 코드로 밀지 않는다.
   - `preference_weights` 4개/7개.
   - 보증금 결제 시점: 큐 진입 전인지, 가매칭 후인지.
   - `match_meetings`, `venues`, `connections`, `enter_match_pool`의 최종 스키마.
   - 16~20시 직접 뽑기와 gwating 자동분배 중 어떤 정책을 채택할지.

## 2026-06-22 전체 완료 기준 재개 점검

### 이번 추가 수정

28. 기본정보 저장 전 닉네임 중복 확인을 더 강하게 걸었다.
   - `components/profile/BasicInfoForm.tsx`
   - 사용자가 `중복 확인`을 누르지 않고 저장해도 `/api/profiles/check-nickname`으로 실제 DB 기준 확인을 먼저 수행한다.
   - 중복이거나 조회가 실패하면 저장하지 않고 사용자에게 다시 입력하라고 안내한다.
   - DB unique constraint는 아직 없으므로 최종 중복 방지는 별도 migration 합의가 필요하다.
29. 로컬 preview에서 친구 초대가 바로 그룹 합류처럼 보이던 동작을 제거했다.
   - `app/group/create/page.tsx`
   - 친구 목록에서 초대를 누르면 dev 상태에서도 `in_group`이 아니라 `invited`가 되고, pending invite만 추가된다.
   - 즉 친구가 로그인/회원가입 후 수락해야 그룹에 들어온다는 실제 흐름과 맞춘다.
30. 사전 카드 문구를 실제 저장 상태에 맞게 낮췄다.
   - `app/profile/match-card/page.tsx`
   - `app/match/start/page.tsx`
   - `components/matching/group-create/FreeBetaQueuePanel.tsx`
   - 현재 단계는 `사전 카드 초안`이며 현재 기기에 임시 저장된다.
   - 상대 공개용 카드는 가매칭 후 확정 카드 단계에서 DB에 저장해야 한다고 명확히 분리했다.
31. 큐 진입 서버 route에 현재 사용자 사전 카드 초안 검사를 추가했다.
   - `app/api/match-pool/enter/route.ts`
   - 기존에는 프론트 버튼만 사전 카드 초안을 요구했고 서버 route는 성향/시간/비중만 검사했다.
   - 이제 현재 사용자 cookie 기준 사전 카드 초안이 없으면 `pre_match_card_required`로 거절한다.
   - 단, 다른 멤버의 사전 카드까지 서버에서 검사하려면 DB 저장 구조가 필요하다.
32. 위 핵심 gate를 `tests/config/booting-branding.test.ts`에 고정했다.
   - 닉네임 DB 조회 게이트.
   - 매칭 큐 진입 전 사전 카드 초안 cookie gate.

### 이번 추가 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 30개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run build` 통과.
- 3004 dev server 재시작 후 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/profile/basic` 200.
  - `/profile/worldcup` 200.
  - `/profile/preferences` 200.
  - `/profile/schedule` 200.
  - `/profile/match-card` 200.
  - `/group/create` 200.
  - `/match/dev-match-pending` 200.
  - `/match/dev-match-1` 200.

### 전체 완료 기준에서 아직 막힌 것

- 닉네임 중복의 최종 DB 강제:
  - 현재는 API 조회 + 프론트 저장 게이트다.
  - `profiles.display_name` unique 또는 별도 normalized nickname 컬럼은 migration 합의가 필요하다.
- 사전 카드 DB 저장:
  - 현재 `/profile/match-card`는 pre-match 초안 localStorage/cookie다.
  - 기존 `match_card_submissions`는 `match_id`가 있어야 저장 가능하므로, 큐 진입 전 카드 저장에는 새 테이블/API 합의가 필요하다.
- Toss 실결제:
  - 현재 production Toss 실결제는 실행하지 않았다.
  - `mock`은 로컬 검토용이고, `toss` route는 checkout/confirm/cancel/webhook 서버 코드가 들어와 있다.
  - sandbox confirm/cancel/webhook까지 실제로 검증하려면 Toss sandbox key, Vercel 또는 ngrok webhook URL, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` 설정이 필요하다.
- 연락처/채팅 공개:
  - route/API 표면은 있지만 실제 공개 조건은 `match_meetings`, `connections`, 채팅 스키마 최종 합의가 필요하다.
- 데일리카드 정책:
  - 충현안 `16~20시 직접 뽑기`와 성준 gwating `자동분배`가 아직 충돌한다.
  - 정책 결정 전 DB/API로 밀면 이중 구현이 생긴다.
- `preference_weights`:
  - 현재 로컬 계약은 4개 기준이다.
  - 성준 회신에는 7개 기준이 있었으므로 계약 확정 전 변경 금지.

### 다음 사람이 바로 이어갈 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md의 "2026-06-22 전체 완료 기준 재개 점검"부터 읽고 이어서 진행해.
현재 변경분은 아직 커밋하지 말고, 먼저 git status를 분류한 뒤 staged diff 요약을 보고해.
그 다음 우선순위는:
1. 닉네임 중복 DB 강제를 migration으로 갈지 별도 profiles nickname table로 갈지 설계 보고.
2. 사전 카드 초안을 DB에 저장할 새 pre_match_card_drafts 스키마/API 설계 보고.
3. Toss sandbox confirm/cancel/webhook을 성준 결제 레이어 기준으로 흡수할 범위 보고.
production Supabase/Vercel/Toss는 건드리지 마.
```

## 2026-06-22 Toss webhook Query API reconciliation 보강

### 공식 문서 기준 정정

- Toss 일반 결제 웹훅(`PAYMENT_STATUS_CHANGED`, `DEPOSIT_CALLBACK`, `CANCEL_STATUS_CHANGED`)은 `tosspayments-webhook-signature`를 검증하는 방식이 아니다.
- Toss 공식 LLM quick reference 기준으로 일반 결제 웹훅은 `paymentKey`로 Payment Query API를 다시 호출해서 상태를 검증해야 한다.
- `tosspayments-webhook-signature`는 payout/seller 웹훅 쪽에 해당한다.
- 따라서 이번 작업은 "서명 검증 구현"이 아니라 "웹훅 body에서 식별자만 추출 → Toss Query API 재조회 → DB reconciliation"으로 구현했다.

### 추가 수정

46. Toss Query API helper를 추가했다.
   - `lib/payments/toss.ts`
   - `getTossPayment(paymentKey)`
   - `getTossPaymentByOrderId(orderId)`
   - GET 요청에는 `Idempotency-Key`를 붙이지 않도록 POST 요청과 분리했다.
47. `/api/payments/deposit/webhook`을 placeholder에서 실제 reconciliation route로 바꿨다.
   - `app/api/payments/deposit/webhook/route.ts`
   - body에서 `paymentKey` 또는 `orderId`만 추출한다.
   - Toss Query API로 결제 상태를 다시 조회한다.
   - 조회된 `totalAmount`가 `DEPOSIT_AMOUNT`와 다르면 거절한다.
   - Toss `DONE`은 deposit `paid`로 반영한다.
   - Toss `CANCELED`, `PARTIAL_CANCELED`는 deposit `refunded`로 반영한다.
   - 이미 `refunded`인 deposit에 늦게 도착한 `DONE` webhook은 `ignored_already_refunded`로 무시해서 paid로 되돌리지 않는다.
   - 기존 deposit notes는 덮어쓰지 않고 webhook note를 append한다.
   - DB 반영은 `SUPABASE_SERVICE_ROLE_KEY`가 있을 때만 가능하다.
48. 설정 테스트에 webhook Query API 재조회 방식을 고정했다.
   - `tests/config/deposit-payment-routes.test.ts`
   - 일반 결제 webhook에서 `tosspayments-webhook-signature`를 쓰지 않는다는 점도 테스트로 고정했다.

### 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 33개 테스트 통과.

### 남은 완료 기준

- Toss sandbox 실제 E2E는 아직 검증하지 못했다.
  - 현재 로컬 env에 `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`가 없다.
  - production Toss 실결제는 건드리지 않았다.
- webhook route는 Query API reconciliation 코드까지 들어갔지만, 실제 Toss dashboard webhook 등록/ngrok 또는 배포 URL 테스트는 아직 못 했다.
- 새 migration 2개는 production Supabase에는 적용하지 않았다.
- 데일리카드 정책은 여전히 `16~20 직접 뽑기`와 `gwating 자동분배` 중 선택이 필요하다.
- `preference_weights` 4개/7개 계약 충돌은 아직 수정하지 않았다.

### 다음 사람이 바로 이어갈 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md의 "2026-06-22 Toss webhook Query API reconciliation 보강"부터 읽고 이어서 진행해.
현재 우선순위는:
1. 전체 검증(typecheck/lint/test:config/test:profile/test:matching/build) 재실행.
2. 3004 route 200 확인.
3. 현재 변경분 커밋 정리.
4. Toss sandbox env/dashboard/ngrok 또는 Vercel preview URL로 실제 webhook E2E 검증 준비 목록 작성.
production Supabase/Vercel/Toss는 건드리지 마.
```

## 2026-06-22 환불 route 외부 Toss settlement 보강

### 추가 수정

44. `/api/matches/[id]/refund`가 DB 환불 처리 이후 외부 결제 settlement 상태를 함께 보고하도록 보강했다.
   - `app/api/matches/[id]/refund/route.ts`
   - 기존 `submit_refund_request` RPC는 계속 사용한다.
   - RPC 처리 후 응답에 `external_refund`를 추가한다.
   - `refund_amount = 0`이면 외부 결제 취소가 필요 없으므로 `not_required/refund_amount_zero`를 반환한다.
   - mock 결제(`MOCK_` payment key) 또는 결제키가 없는 경우 `not_required/mock_or_missing_payment_key`를 반환한다.
   - `SUPABASE_SERVICE_ROLE_KEY` 또는 Supabase URL이 없으면 Toss 취소를 시도하지 않고 `not_checked/server_settlement_not_configured`를 반환한다.
   - Toss 설정이 부족하면 `pending_provider_configuration`으로 분리한다.
   - Toss 취소가 실제로 가능하면 서버 helper `cancelTossPayment()`를 통해 취소하고, deposit notes에 `external_refund=toss:...`를 남긴다.
45. 설정 테스트에 환불 route가 외부 Toss settlement를 별도 상태로 보고한다는 정적 증거를 추가했다.
   - `tests/config/deposit-payment-routes.test.ts`

### 검증 결과

- `npm run typecheck` 1차 실패:
  - 원인: Supabase service client의 local DB 타입 generic이 지나치게 넓거나 좁게 추론됨.
  - 조치: route 안에서 필요한 `matches`, `deposits`만 최소 DB 타입으로 정의하고 `SupabaseClient<SettlementDatabase, 'public'>`로 명시.
- `npm run typecheck` 재실행 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 32개 테스트 통과.
- 추가 전체 검증:
  - `npm run typecheck` 통과.
  - `npm run lint` 통과.
  - `npm run test:config` 통과. 32개 테스트 통과.
  - `npm run test:profile` 통과. 14개 테스트 통과.
  - `npm run test:matching` 통과. 38개 테스트 통과.
  - `npm run build` 통과.
- 3004 dev preview 세션 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/profile/basic` 200.
  - `/profile/worldcup` 200.
  - `/profile/preferences` 200.
  - `/profile/schedule` 200.
  - `/profile/match-card` 200.
  - `/group/create` 200.
  - `/match/start` 200.
  - `/match/dev-match-pending` 200.
  - `/match/dev-match-1` 200.

### 남은 완료 기준

- Toss sandbox 실제 E2E는 아직 검증하지 못했다.
  - 현재 로컬 env에 `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`가 없다.
  - production Toss 실결제는 건드리지 않았다.
- webhook route는 Toss 일반 결제 기준에 맞춰 `paymentKey/orderId`로 Toss Payment Query API를 재조회한 뒤 DB reconciliation을 수행한다.
  - Toss 일반 결제 webhook은 `tosspayments-webhook-signature` 검증 대상이 아니다.
  - 실제 dashboard webhook 등록과 sandbox E2E 검증은 아직 남아 있다.
- 새 migration 2개는 production Supabase에는 적용하지 않았다.
  - `20260622_matching_pre_match_card_drafts.sql`
  - `20260622_profile_display_name_claims.sql`
- 데일리카드 정책은 여전히 `16~20 직접 뽑기`와 `gwating 자동분배` 중 선택이 필요하다.
- `preference_weights` 4개/7개 계약 충돌은 아직 수정하지 않았다.

### 다음 사람이 바로 이어갈 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md의 "2026-06-22 환불 route 외부 Toss settlement 보강"부터 읽고 이어서 진행해.
현재 우선순위는:
1. Toss webhook sandbox E2E 검증은 성준 결제 레이어 기준과 env/dashboard 설정 가능 여부를 보고한 뒤 별도 phase로 진행.
2. 데일리카드 16~20 직접뽑기 vs gwating 자동분배 정책을 확정한다.
3. 새 migration 2개를 local/staging Supabase에서 적용 검증한다.
production Supabase/Vercel/Toss는 건드리지 마.
```

## 2026-06-22 Toss sandbox 결제 승인/취소 route 보강

### 추가 수정

44. Toss 서버 helper를 추가했다.
   - `lib/payments/toss.ts`
   - 공식 Toss Payments API 기준으로 서버에서만 `POST /v1/payments`, `POST /v1/payments/confirm`, `POST /v1/payments/{paymentKey}/cancel`을 호출한다.
   - `TOSS_SECRET_KEY`는 서버 helper 안에서만 읽고, 프론트에는 노출하지 않는다.
   - 각 POST 요청에는 `Idempotency-Key`를 붙인다.
45. Toss 보증금 결제 시작 흐름을 `pending deposit -> checkout` 구조로 보강했다.
   - `app/api/payments/deposit/route.ts`
   - `app/api/deposits/route.ts`
   - 사용자가 그룹 멤버인지 확인한 뒤 `deposits.status = pending` row와 `toss_order_id`를 확보한다.
   - 이후 Toss checkout URL을 만들고 프론트에 반환한다.
   - 이미 `paid`/`held` 상태면 새 결제창을 만들지 않고 기존 상태를 반환한다.
46. Toss 승인 confirm 흐름을 placeholder에서 실제 서버 검증 구조로 바꿨다.
   - `app/api/payments/deposit/confirm/route.ts`
   - `paymentKey`, `orderId`, `amount`가 필요하다.
   - `orderId`가 현재 `group_id + user_id` 맥락과 맞는지 확인한다.
   - DB의 pending deposit row와 `toss_order_id`가 일치해야 한다.
   - Toss 승인 응답의 `orderId`, `totalAmount`, `status = DONE`을 확인한 뒤 `deposits.status = paid`로 바꾼다.
47. Toss 취소/cancel route를 내부 전용 환불 호출용으로 보강했다.
   - `app/api/payments/deposit/cancel/route.ts`
   - 브라우저 checkout 실패 GET redirect는 기존대로 유지한다.
   - 실제 `paymentKey` 취소 POST는 `PAYMENT_INTERNAL_SECRET`이 맞을 때만 실행한다.
   - `SUPABASE_SERVICE_ROLE_KEY`가 있어야 `toss_payment_key` 기준으로 deposit을 `refunded` 처리한다.
   - 사용자가 이 route를 직접 눌러서 임의 환불하는 구조가 아니다.
48. `/match/[id]` 보증금 버튼은 Toss checkout URL이 오면 결제창으로 이동하도록 바꿨다.
   - `app/match/[id]/page.tsx`
   - checkout URL이 없으면 설정 미완료 안내를 보여준다.
49. 설정 테스트를 새 결제 구조에 맞게 바꿨다.
   - `tests/config/deposit-payment-routes.test.ts`
   - route가 Toss를 직접 fetch하지 않고 `lib/payments/toss.ts` helper로 위임하는지 고정했다.
   - `tsconfig.config-tests.json`에 `lib/payments/**/*.ts`를 포함했다.

### 이번 검증 결과

- `npm run typecheck` 통과.
- `npm run test:config` 통과. 30개 테스트 통과.

### 여전히 남은 결제/환불 완료 기준

- production Toss 실결제는 실행하지 않았다.
- Toss sandbox key가 실제로 들어간 상태에서 checkout/confirm/cancel을 끝까지 호출해 본 것은 아니다.
- `/match/[id]/refund` 화면은 아직 `submit_refund_request` RPC로 DB 정산을 처리한다.
  - 실제 Toss 취소 호출은 `app/api/payments/deposit/cancel/route.ts`에 내부 전용 route로 마련했다.
  - 운영자 환불 트리거 또는 만남 인증 완료 트리거가 이 내부 cancel route를 호출하는 연결은 아직 남아 있다.
- webhook은 여전히 MVP 핵심 경로가 아니다.
  - 성준 회신 기준은 webhook보다 동기 confirm 중심이다.
  - webhook route는 Query API reconciliation 코드까지 들어왔지만, 실제 Toss dashboard 등록과 sandbox event 수신 검증은 후속 phase로 남긴다.
- Toss dashboard, Vercel env, Supabase service role env 설정은 사용자가 직접 해야 한다.

### 다음 우선순위

1. `npm run lint`, `npm run test:profile`, `npm run test:matching`, `npm run build`까지 전체 검증한다.
2. 로컬 route 200을 다시 확인한다.
3. Toss sandbox key가 있는 별도 환경에서 checkout/confirm/cancel을 실제로 검증한다.
4. `/match/[id]/refund`의 DB 정산과 내부 Toss cancel route를 어떤 운영 트리거로 연결할지 설계한다.
5. 새 migration 2개를 local/staging Supabase에 적용 검증한다.

## 2026-06-22 새 migration 2개 로컬 DB 적용 검증

### 검증 환경

- production Supabase는 건드리지 않았다.
- 로컬에 `supabase` CLI와 `supabase/config.toml`은 없었다.
- Docker Desktop은 켜져 있었고, 기존 Phase 5 로컬 Supabase 컨테이너가 살아 있었다.
  - DB 컨테이너: `supabase_db_phase5-local-supabase`
  - Postgres: 17.6
- 호스트에는 `psql`이 없어서 컨테이너 내부 `psql`로 검증했다.

### 적용한 migration

1. `supabase/migrations/20260622_matching_pre_match_card_drafts.sql`
2. `supabase/migrations/20260622_profile_display_name_claims.sql`

### 검증 결과

- 두 SQL 모두 로컬 DB에 오류 없이 적용됐다.
- 생성 객체 확인:
  - `public.pre_match_card_drafts`
  - `public.profile_display_name_claims`
  - `public.get_group_pre_match_card_readiness`
  - `public.normalize_profile_display_name`
  - `public.is_profile_display_name_available`
  - `public.resolve_profile_display_name`
  - `public.claim_profile_display_name`
- RLS policy 확인:
  - `pre_match_card_drafts` select/insert/update/delete self policy 존재.
  - `profile_display_name_claims` select self policy 존재.
- 동작 검증:
  - 테스트 auth user 2명을 만들고 같은 닉네임을 공백 정규화 기준으로 넣었을 때 `nickname_taken`으로 차단됐다.
  - 같은 그룹 2명 중 한 명은 사전 카드 `completed_items = 4`, 다른 한 명은 `3`으로 넣은 뒤 `get_group_pre_match_card_readiness()`를 호출했을 때 준비 완료 1명으로 계산됐다.
  - 테스트 데이터는 삭제했고, 임시 auth user 잔여 수 0을 확인했다.

### 남은 한계

- 이 검증은 `supabase` CLI의 `db reset` 검증은 아니다.
- existing Phase 5 local Supabase DB에 SQL을 직접 적용한 검증이다.
- production Supabase에는 적용하지 않았다.
- 성준 리뷰 후 staging/production 적용이 필요하다.

### 다음 우선순위 갱신

1. Toss sandbox key가 있는 별도 환경에서 checkout/confirm/cancel 실제 호출 검증.
2. `/match/[id]/refund`의 DB 정산과 내부 Toss cancel route 연결 설계.
3. 데일리카드 정책 합의: 16~20 직접 뽑기 vs gwating 자동분배.
4. `preference_weights` 4개/7개 계약 합의.

## 2026-06-22 전화번호 그룹 초대 신규 생성 차단

### 추가 수정

1. `app/api/group-invites/route.ts`에서 신규 전화번호 기반 그룹 초대 생성을 막았다.
   - `invited_phone`이 들어오면 `phone_invites_disabled`로 400을 반환한다.
   - 새 초대 생성은 기존 회원 `invited_user_id` 또는 공개 `link` 초대만 허용한다.
   - DB의 레거시 `invited_phone` 컬럼과 기존 row 조회는 그대로 둬서 공용 migration 충돌은 피했다.
2. `tests/config/booting-branding.test.ts`에 회귀 테스트를 추가했다.
   - 서버 route가 `phone` invite를 새로 만들지 않는지 확인한다.
   - 초대 패널 문구가 “로그인/회원가입 후 초대 수락” 흐름을 유지하는지 확인한다.
3. `app/group/invite/[token]/page.tsx`를 Booting 톤으로 정리했다.
   - 초대 링크만으로 바로 그룹에 들어가지 않고, 로그인/회원가입 후 수락해야 참여된다는 문구를 명확히 했다.
   - 보라/회색 계열의 옛 스타일 대신 `booting-band`, `glass-card`, 코랄/크림톤 위계로 맞췄다.

### 검증 결과

- `npm run test:config` 통과.
- `npm run typecheck` 통과.
- `npm run lint` 통과.

### 남은 한계

- DB 마이그레이션에는 과거 `invite_kind = 'phone'` 구조가 남아 있다.
- 기존 production/staging DB에 이미 있는 phone invite row를 어떻게 정리할지는 성준 리뷰와 운영 데이터 확인 후 결정해야 한다.
- 이번 수정은 “신규 앱 API에서 전화번호 그룹 초대를 만들지 못하게 막는 것”까지다.

## 2026-06-22 검증 재실행 및 로컬 서버 상태

### 검증 결과

- `npm run test:config` 통과.
- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:profile` 통과.
- `npm run test:matching` 통과.
- `npm run build` 통과.

### build 재시도 기록

- 첫 `npm run build`는 `.next/static/webpack/*.hot-update.json` 정리 중 `readlink EINVAL`로 실패했다.
- 원인은 dev server가 만든 HMR 캐시와 Windows/OneDrive 파일 처리 충돌로 판단했다.
- 3004 dev server를 멈춘 뒤, workspace 내부 `.next` 경로를 확인하고 `.next`만 삭제했다.
- clean 상태에서 `npm run build`를 다시 실행해 성공했다.

### 로컬 route 확인

- dev server를 다시 `http://localhost:3004`에 띄웠다.
- 확인 결과:
  - `/` 200
  - `/match` 200, 미로그인 상태에서는 `/login`으로 이동
  - `/group/create` 200, 미로그인 상태에서는 `/login`으로 이동
  - `/group/invite/dev-preview` 200
  - `/notifications` 200
  - `/profile/basic` 200
  - `/match/dev-match-pending` 200
  - `/match/dev-match-1` 200

## 리셋 후 재개 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md를 먼저 읽고, 다음 작업부터 이어서 진행해.
커밋은 하지 말고, 현재 dirty 작업트리를 보존하면서 진행해.
우선 실제 브라우저에서 `/`, `/match`, `/notifications`, `/profile/basic`, `/group/create`를 확인해서 이번 프론트 변경이 사용자 체감상 자연스러운지 검증해. 브라우저 자동화가 계속 막히면 curl/문서 근거로 검증 한계를 기록해.
그다음 git status를 분류하고 커밋에 넣을 파일/보류할 파일 후보를 보고해. 아직 커밋은 하지 마.
```

## 2026-06-22 사전 카드 DB 저장 승격

### 추가 수정

33. 큐 진입 전 사전 카드 초안 전용 DB 테이블을 추가했다.
   - `supabase/migrations/20260622_matching_pre_match_card_drafts.sql`
   - `pre_match_card_drafts`는 user별 1개 초안을 저장한다.
   - 내용(`content_text`)은 RLS로 본인만 읽고 쓸 수 있다.
   - 그룹 준비 확인은 `get_group_pre_match_card_readiness(group_id)` RPC가 완료 여부만 반환한다.
   - 친구/그룹원이 상대 카드 내용을 큐 진입 전에 미리 보는 구조가 아니다.
34. 사전 카드 초안 API를 추가했다.
   - `app/api/profile/match-card-draft/route.ts`
   - GET: 내 초안 조회.
   - POST: 10~500자, 6개 항목 중 4개 이상 완료 검증 후 upsert.
   - 완료 개수는 서버에서 `daily-card-authoring` helper로 다시 계산한다.
35. `/profile/match-card` 저장 흐름을 DB 우선으로 바꿨다.
   - 로그인 사용자는 API를 통해 DB에 저장한다.
   - dev/비로그인 preview에서는 로컬 임시 저장 fallback을 유지한다.
   - 저장 성공 문구도 `DB 저장`과 `현재 기기 임시 저장`을 구분한다.
36. `/match/start`, 홈 오늘 할 일, 그룹 화면이 cookie가 아니라 DB 초안 완료 여부를 읽도록 조정했다.
   - `app/match/start/page.tsx`
   - `components/matching/HomeTodayTaskCard.tsx`
   - `app/group/create/page.tsx`
37. 그룹 준비 상태와 큐 진입 서버 gate를 멤버 전원 사전 카드 기준으로 강화했다.
   - `app/api/groups/route.ts`
   - `app/api/match-pool/enter/route.ts`
   - 이제 큐 진입은 그룹원 모두 `성향/시간/비중/사전 카드`를 끝내야 가능하다.
   - 현재 사용자 카드가 없으면 `pre_match_card_required`.
   - 다른 멤버 카드가 없으면 `member_pre_match_card_incomplete`.
38. 관련 문구와 테스트를 새 기준으로 고정했다.
   - `components/matching/group-create/FreeBetaQueuePanel.tsx`
   - `components/matching/group-create/status.ts`
   - `tests/config/booting-branding.test.ts`
   - `tests/matching/group-create-status.test.ts`

### 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 30개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run build` 통과.
- 3004 dev server 재시작 후 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/profile/basic` 200.
  - `/profile/match-card` 200.
  - `/group/create` 200.
  - `/match/start` 200.
  - `/match/dev-match-pending` 200.
  - `/match/dev-match-1` 200.

### 남은 완료 기준

- 새 migration은 코드에 추가했지만 production Supabase에는 적용하지 않았다.
  - 협업 규칙상 성준/상대방 리뷰 후 적용해야 한다.
- 닉네임 중복 DB 강제는 아직 API 조회 게이트 수준이다.
  - `profiles.display_name` unique 또는 normalized nickname 테이블 설계가 다음 우선순위다.
- Toss sandbox confirm/cancel은 성준 결제 레이어 기준 차이 검토가 남아 있고, webhook은 Query API reconciliation 코드까지 보강했지만 실제 sandbox E2E는 아직 검증하지 않았다.
  - production Toss 실결제는 건드리지 않았다.
- 데일리카드 정책은 여전히 합의 필요다.
  - 충현안 `16~20시 직접 뽑기`와 성준 gwating `자동분배` 중 하나를 선택해야 한다.
- `preference_weights` 4개/7개 계약 충돌은 아직 수정하지 않았다.

### 다음 사람이 바로 이어갈 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md의 "2026-06-22 사전 카드 DB 저장 승격"부터 읽고 이어서 진행해.
현재 우선순위는:
1. 닉네임 중복 DB 강제 설계/구현.
2. Toss sandbox confirm/cancel 흡수 범위와 webhook sandbox E2E 준비 목록을 성준 결제 레이어 기준으로 보고.
3. 데일리카드 16~20 직접뽑기 vs gwating 자동분배 정책 결정 질문 정리.
production Supabase/Vercel/Toss는 건드리지 마.
```

## 2026-06-22 닉네임 중복 DB 강제

### 추가 수정

39. 닉네임 고유 claim 테이블과 DB guard를 추가했다.
   - `supabase/migrations/20260622_profile_display_name_claims.sql`
   - `profile_display_name_claims`는 정규화된 닉네임을 primary key로 보관한다.
   - 기존 `profiles.display_name`에 중복이 있어도 migration이 실패하지 않도록, backfill은 정규화 이름별 1명만 claim한다.
   - `profiles.display_name` 직접 insert/update도 trigger가 claim 테이블을 확인해서 중복이면 `nickname_taken`으로 막는다.
40. 닉네임 API를 claim 구조로 바꿨다.
   - `app/api/profiles/check-nickname/route.ts`
   - `app/api/profiles/claim-nickname/route.ts`
   - 중복 확인은 `is_profile_display_name_available`.
   - 저장 확정은 `claim_profile_display_name`.
41. 기본정보와 내정보 닉네임 저장 경로를 claim API로 통일했다.
   - `app/profile/basic/page.tsx`
   - `app/profile/edit/page.tsx`
   - claim 실패 시 profile 저장을 진행하지 않는다.
42. 친구 요청 닉네임 검색도 claim 테이블 기준 RPC로 바꿨다.
   - `app/api/friend-requests/route.ts`
   - `resolve_profile_display_name`으로 닉네임을 user_id로 해석한다.
43. 설정 테스트에 닉네임 DB claim 증거를 추가했다.
   - `tests/config/booting-branding.test.ts`

### 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 30개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run build` 통과.
- 3004 dev server 재시작 후 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/profile/basic` 200.
  - `/profile/edit` 200.
  - `/friends` 200.
  - `/group/create` 200.
  - `/match/start` 200.

### 남은 완료 기준

- 새 migration 2개는 코드에 추가됐지만 production Supabase에는 적용하지 않았다.
  - `20260622_matching_pre_match_card_drafts.sql`
  - `20260622_profile_display_name_claims.sql`
  - 둘 다 공용 DB 변경이므로 성준 리뷰 후 적용해야 한다.
- Toss sandbox confirm/cancel은 성준 결제 레이어 기준 차이 검토가 남아 있고, webhook은 Query API reconciliation 코드까지 보강했지만 실제 sandbox E2E는 아직 검증하지 않았다.
- 데일리카드 정책은 여전히 `16~20 직접 뽑기`와 `gwating 자동분배` 중 선택이 필요하다.
- `preference_weights` 4개/7개 계약 충돌은 아직 수정하지 않았다.

### 다음 사람이 바로 이어갈 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md의 "2026-06-22 닉네임 중복 DB 강제"부터 읽고 이어서 진행해.
현재 우선순위는:
1. Toss sandbox confirm/cancel 흡수 범위와 webhook sandbox E2E 준비 목록을 성준 결제 레이어 기준으로 보고.
2. 데일리카드 16~20 직접뽑기 vs gwating 자동분배 정책 결정 질문 정리.
3. 새 migration 2개를 local/staging Supabase에서 적용 검증.
production Supabase/Vercel/Toss는 건드리지 마.
```

## 2026-06-22 최신 이어갈 지점

현재 가장 최신 작업은 `닉네임 claim migration 로컬 DB 재검증과 ambiguity 수정`이다.

중요 정정:

- Toss 일반 결제 웹훅은 `tosspayments-webhook-signature` 검증 대상이 아니다.
- 공식 기준은 `paymentKey` 또는 `orderId`로 Toss Payment Query API를 다시 호출해서 상태를 검증하는 방식이다.
- 이 기준에 맞춰 `app/api/payments/deposit/webhook/route.ts`와 `lib/payments/toss.ts`를 보강했다.

최신 수정 파일:

- `supabase/migrations/20260622_profile_display_name_claims.sql`
- `tests/config/booting-branding.test.ts`
- `docs/plans/2026-06-21-overnight-user-flow-audit-result.md`
- `docs/plans/2026-06-21-overnight-code-review-result.md`
- `lib/payments/toss.ts`
- `app/api/payments/deposit/webhook/route.ts`
- `tests/config/deposit-payment-routes.test.ts`
- `docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md`

최신 검증:

- Docker의 `supabase_db_phase5-local-supabase`에 `psql`로 직접 접속해 `pre_match_card_drafts`, `profile_display_name_claims`, `group_members`, `profiles`, `users` 존재 확인.
- `20260622_profile_display_name_claims.sql` 재적용 성공.
- 트랜잭션 rollback 방식으로 실제 DB 동작 검증:
  - `claim_profile_display_name(' Minji ')`가 `Minji/minji`를 반환.
  - 같은 사용자는 `is_profile_display_name_available('minji') = true`.
  - 다른 사용자는 `is_profile_display_name_available('minji') = false`.
  - 다른 사용자의 `claim_profile_display_name('minji')`는 `nickname_taken`으로 차단.
  - `get_group_pre_match_card_readiness()`는 completed_items 4인 멤버만 `has_pre_match_card = true`, 3인 멤버는 false로 반환.
- 위 검증 중 `claim_profile_display_name`의 `normalized_name` 반환 컬럼과 SQL 컬럼이 충돌하는 ambiguity를 발견했고, migration에서 컬럼 참조를 `public.profile_display_name_claims.normalized_name` 및 `ON CONFLICT ON CONSTRAINT profile_display_name_claims_pkey`로 수정.
- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 33개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `.next`를 현재 workspace 내부 경로로 확인 후 삭제하고 `npm run build` 재실행 통과.
- `npm run build` 이후 기존 dev server가 같은 `.next`를 물고 있어 `/dev/preview`에서 `Cannot find module './9276.js'` 500을 냈다.
  - root cause: 코드 오류가 아니라 build가 dev server의 chunk cache를 덮어쓴 상태.
  - 조치: 3004 dev server를 중지하고 `.next`가 workspace 내부임을 확인한 뒤 삭제, dev server 재시작.
- 3004 dev server 재시작 후 route 확인:
  - `/dev/preview` 200.
  - `/` 200.
  - `/match` 200.
  - `/notifications` 200.
  - `/profile/basic` 200.
  - `/profile/worldcup` 200.
  - `/profile/preferences` 200.
  - `/profile/schedule` 200.
  - `/profile/match-card` 200.
  - `/group/create` 200.
  - `/match/start` 200.
  - `/match/dev-match-pending` 200.
  - `/match/dev-match-1` 200.

다음에 바로 할 일:

1. `npm run test:config`부터 다시 돌려 migration 회귀 테스트가 통과하는지 확인한다.
2. 전체 검증이 통과하면 현재 변경분을 stage하고 커밋한다.
3. 이후 남은 큰 항목은 Toss 실제 sandbox E2E, 데일리카드 정책 확정, `preference_weights` 4개/7개 계약 확정이다.
4. production Supabase/Vercel/Toss는 성준 리뷰와 dashboard/env 준비 전까지 건드리지 않는다.

## 2026-06-22 데일리카드 정책 회귀 방지

이번 이어달리기에서 추가 확인한 결론:

- 우리 현재 브랜치의 데일리카드 구현은 `16:00-20:00 직접 뽑기`다.
- DB 근거는 `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`이다.
  - `reveal_window_start`, `reveal_window_end`, `selected_at`, `selected_by_user_id`, `selected_slot`, `forfeited_at`을 사용한다.
  - `Asia/Seoul` 기준 16시~20시 window를 만든다.
  - `pick_match_daily_card`는 아직 선택되지 않고 놓치지 않은 카드만 `FOR UPDATE`로 잠근 뒤 `selected_at`을 기록한다.
  - `get_match_daily_cards`는 `selected_at IS NOT NULL`일 때만 상대 카드 `content_text`를 반환한다.
- API 근거는 `app/api/matches/[id]/daily-cards/route.ts`다.
  - GET은 `get_match_daily_cards`.
  - POST는 `pick_match_daily_card`.
- 화면 근거는 `app/match/[id]/page.tsx`다.
  - `16:00-20:00`, `no_draw_available`, `selected_at`, `forfeited_at` 상태를 사용한다.
- 회귀 방지 테스트를 추가했다.
  - `tests/config/daily-card-policy.test.ts`
  - 목적: 09:00 자동공개형이나 단순 조회 공개형으로 되돌아가는 것을 막는다.

중요:

- 이 테스트는 "우리 브랜치 구현 방향"을 고정하는 장치다.
- 성준 `gwating-app`의 자동분배 UX와 최종 제품 정책이 합의됐다는 뜻은 아니다.
- 최종 정책은 여전히 `16~20 직접 뽑기`와 `자동분배` 중 선택이 필요하다.

다음에 바로 할 일:

1. `npm run test:config` 실행.
2. 필요하면 `npm run test:matching` 실행.
3. 통과하면 변경분을 커밋한다.
4. 그 다음 남은 큰 항목은 Toss sandbox 실제 E2E와 `preference_weights` 4개/7개 계약 합의다.

## 2026-06-22 완료 감사와 route 검증 명령 추가

### 추가 수정

1. 장시간 계획 전체 완료 여부를 요구사항별로 다시 분류했다.
   - `docs/plans/2026-06-22-overnight-completion-audit.md`
   - 결론은 "앱 내부 구현/검증은 상당 부분 완료, 전체 목표는 외부 설정과 팀 합의 때문에 아직 완료 아님"이다.
2. 로컬 route 검증 스크립트를 추가했다.
   - `scripts/check-local-routes.mjs`
   - `npm run check:routes -- --base=http://localhost:3004`
   - `booting_dev_auth=1` cookie로 주요 preview route가 로그인으로 튕기지 않는지 확인한다.
3. `package.json`에 `check:routes` 명령을 추가했다.
4. 계획 허브에 완료 감사 문서를 연결했다.

### 아직 완료가 아닌 항목

- Toss sandbox checkout/confirm/cancel/webhook 실제 E2E.
- 새 Supabase migration 2개 production 적용.
- `preference_weights` 4개/7개 계약 확정.
- 데일리카드 `16~20 직접 뽑기` vs `자동분배` 정책 확정.
- 연락처/채팅 공개 시점과 노쇼/환불 운영 정책 확정.

### 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 37개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run check:payment-env` 통과. mock provider 기준 Supabase 공개 env 설정 확인.
- `npm run build` 통과.
- dev server를 `http://localhost:3004`에 다시 띄운 뒤 `npm run check:routes -- --base=http://localhost:3004` 통과.
  - `/dev/preview`, `/`, `/match`, `/notifications`, `/profile/basic`, `/profile/worldcup`, `/profile/preferences`, `/profile/schedule`, `/profile/match-card`, `/group/create`, `/group/invite/dev-preview`, `/match/start`, `/match/dev-match-pending`, `/match/dev-match-1` 모두 200.
- `npm run check:payment-env -- --provider=toss`는 예상대로 실패.
  - 누락: `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
  - 이 실패는 Toss sandbox E2E가 아직 외부 설정 없이는 완료될 수 없다는 증거다.

검증:

- `npm run test:config` 통과. 35개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.

남은 완료 기준:

- Toss sandbox 실제 checkout/confirm/cancel/webhook E2E는 아직 못 했다.
  - 필요한 값: `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
  - 필요한 외부 설정: Toss sandbox 상점, webhook URL, Vercel preview 또는 ngrok.
- `.env.local.example`에는 위 값을 넣을 자리를 추가했다.
  - 기본 provider는 로컬 검토용 `mock`이다.
  - Toss sandbox를 실제로 볼 때만 `NEXT_PUBLIC_PAYMENT_PROVIDER=toss` / `PAYMENT_PROVIDER=toss`로 바꾼다.
  - 실제 비밀값은 예시 파일에 넣지 않는다.
  - `tests/config/deposit-payment-routes.test.ts`에 env 예시 회귀 테스트를 추가했다.
  - `npm run test:config` 재실행 통과. 36개 테스트 통과.
- Toss sandbox 전용 preflight 명령을 추가했다.
  - `npm run check:payment-env`
  - `npm run check:payment-env -- --provider=toss`
  - 기본 mock 모드는 통과했다.
  - Toss 강제 모드는 현재 `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`가 없어 실패한다. 이 실패는 정상 차단이다.
  - 검증: `npm run check:payment-env` 통과.
  - 검증: `npm run check:payment-env -- --provider=toss`는 예상대로 위 4개 키 누락을 보고하고 차단.
  - 검증: `npm run test:config` 통과. 37개 테스트 통과.
- 외부 완료 게이트 문서를 추가했다.
  - `docs/plans/2026-06-22-overnight-external-completion-gates.md`
  - Toss E2E 순서, 사용자/성준 합의 질문, 완료 조건을 한 문서로 정리했다.
- 데일리카드 최종 제품 정책은 아직 합의 필요다.
  - 우리 현재 브랜치: 16~20 직접 뽑기.
  - 성준 `gwating-app`: 자동분배 UX 프로토타입.
- `preference_weights` 4개/7개 계약 충돌은 아직 수정하지 않았다.
  - 현재 서버 준비 조건은 `appearance`, `personality`, `height`, `body_type` 정확히 4개만 통과시킨다.
  - `school`, `hobby`, `time_fit`이 섞인 7키 데이터는 합의 전에는 매칭 준비 완료로 처리하지 않는다.

## 2026-06-22 Booting visual redesign pass

이번 추가 작업은 production Supabase, Vercel, Toss 실결제를 건드리지 않고 프론트 디자인과 이상형 월드컵 성별 버그만 수정했다.

수정한 핵심:

1. 이상형 월드컵 성별 반전 버그 수정.
   - `lib/gender.ts` 추가.
   - `남자/male/man/m/남`은 `male`, `여자/female/woman/f/여`는 `female`로 정규화.
   - 남자 사용자는 여자 후보, 여자 사용자는 남자 후보가 뜨도록 `app/profile/worldcup/page.tsx` 수정.
   - `tests/profile/gender-normalization.test.ts` 추가.
2. 사용자가 준 레퍼런스 색감 반영.
   - 크림 종이 배경, 짙은 브라운 카드, 코랄-오렌지 포인트로 `tailwind.config.ts`, `app/globals.css` 수정.
   - `booting-paper`, `booting-deep-card`, `booting-soft-card`, `booting-bottom-nav` 유틸리티 추가.
3. 공통 매칭 디자인 부품 추가.
   - `components/matching/ChemiRing.tsx`
   - `components/matching/DarkTeamProgressCard.tsx`
   - `components/matching/LockedOpponentCard.tsx`
   - `components/matching/MatchFoundSummary.tsx`
4. 홈/매칭/매칭상세/그룹/알림/프로필 편집 화면에 새 톤 적용.
   - 홈은 `오늘의 매칭` 중심, 짙은 팀 진행 카드와 잠긴 추천 상대 카드 추가.
   - 매칭 화면은 팀 준비 카드, 잠긴 상대 카드, 매칭 찾기 CTA를 우선 노출.
   - 매칭 상세는 `MATCH FOUND`, Chemi ring, 정보 pill, 상대 비공개 안내를 상단에 배치.
   - 하단탭은 홈/매칭/채팅/마이 톤으로 정리.
   - `/chat` 허브 추가. 실제 채팅은 확정 매칭 상세에서 열리는 구조를 유지.

검증 결과:

- `npm run test:profile` 통과. 18개 테스트 통과.
- `npm run typecheck` 통과.
- `npm run test:config` 통과. 37개 테스트 통과.
- `npm run lint` 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run build` 통과.
- `npm run check:routes -- --base=http://localhost:3004` 통과.
  - `/dev/preview`, `/`, `/match`, `/notifications`, `/profile/basic`, `/profile/worldcup`, `/profile/preferences`, `/profile/schedule`, `/profile/match-card`, `/group/create`, `/group/invite/dev-preview`, `/match/start`, `/match/dev-match-pending`, `/match/dev-match-1` 모두 200.

주의:

- 인앱 브라우저 자동화는 현재 Codex browser runtime 오류로 실패했다.
  - 오류 요지: `sandbox-state-meta: missing field sandboxPolicy`
  - 그래서 Codex 인앱 브라우저 직접 캡처는 못 했다.
- 대신 Playwright 임시 실행 + Chrome channel로 실제 localhost 화면을 캡처했다.
  - 수정 전 저장 위치: `C:\Users\82108\AppData\Local\Temp\booting-redesign-before`
  - 수정 후 저장 위치: `C:\Users\82108\AppData\Local\Temp\booting-redesign-after`
  - `00-dev-preview.png`
  - `01-home.png`
  - `02-match.png`
  - `03-match-pending.png`
  - `04-match-confirmed.png`
  - `05-group-create.png`
  - `06-notifications.png`
  - `07-profile-basic.png`
  - `08-profile-edit.png`
  - `09-chat.png`
- 눈검수 결과:
  - 비포/애프터 비교 기준으로 홈은 설명형 랜딩 느낌에서 실제 앱 대시보드 느낌으로 바뀜.
  - 비포/애프터 비교 기준으로 매칭 상세는 상태표 카드 중심에서 Chemi 결과 화면 중심으로 바뀜.
  - 홈은 크림 배경, 딥 브라운 팀 카드, 코랄 CTA로 변경 확인.
  - 매칭 화면은 팀 준비 카드와 잠긴 상대 카드가 먼저 보임.
  - 가매칭 상세는 `MATCH FOUND`, Chemi 70, 확정 후 공개 pill 확인.
  - 확정 상세는 Chemi 92, 학과/나이대/성별 구성 공개 확인.
  - 그룹/알림/프로필 편집은 새 배경과 카드 톤 적용 확인.
  - `/profile/basic` 첫 화면은 하단탭이 성별 카드 하단 영역을 살짝 덮는 느낌이 있지만, 스크롤 가능한 고정 탭 구조라 텍스트 자체가 겹치거나 깨지지는 않는다.
- Toss sandbox 실제 결제, Supabase production 적용, 성준 스키마 합의 항목은 이번 pass에서 건드리지 않았다.

# 야간 장시간 작업 진행 인수인계

## 현재 목표

`docs/plans/2026-06-21-overnight-user-flow-frontend-backend-plan.md` 기준으로 장시간 자율 실행 작업을 진행한다.

## 현재 브랜치

- `profile/post-worldcup-decisions-2026-05-21`
- 원격 대비 2커밋 앞섬
- 커밋 금지: 아직 보고 전이므로 커밋하지 않는다.

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
- 현재 우리 결제 provider 목록은 성준 회신 반영 후 `mock`, `toss`만 유지한다. 실제 외부 승인 검증은 아직 없고, `toss`도 checkout 준비/placeholder 응답 중심이다. KakaoPay/PortOne은 이번 흡수 대상에서 제외했다.
- 홈과 매칭은 이미 `DEV_PREVIEW_GROUP_MEMBERS`를 공유하고 있었다. 그룹 생성 화면도 멤버는 같은 source였지만 보증금 요약만 `dev-user-1`, `dev-user-2`를 써서 불일치가 있었다.
- 이번 수정으로 group-create dev 보증금 요약은 `DEV_PREVIEW_CURRENT_USER_ID`, `DEV_PREVIEW_FRIEND_MINJI_ID`를 사용한다.
- 현재 우리 브랜치에는 `venues`, `match_meetings`, `enter_match_pool`, `connections`, `group_members`, `friend_requests`, `deposits`가 migration/API로 존재한다.
- 단, 성준 최신 회신 기준에는 위 이름 중 일부가 없다고 했으므로 `우리 로컬 구현 후보 / 합의 필요 스키마`로 분리해야 한다.
- `app/api/match-pool/enter/route.ts`는 그룹 멤버 여부, 리더 여부, 최소 2명, 정원 충족, 모든 멤버의 성향/시간/비중 완료를 검사한다.
- 하지만 z50의 `enter_match_pool` RPC 자체는 보증금 선결제를 요구하지 않는다.
- 닉네임 친구요청은 `profiles.display_name` 조회 기반으로 구현되어 있고 전화번호 중심 신규 요청은 아니다. 다만 `profiles.display_name` unique 제약은 없어서 DB 레벨 중복 방지는 미완이다.
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

## 리셋 후 재개 명령

```text
팀장방, docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md를 먼저 읽고, 다음 작업부터 이어서 진행해.
커밋은 하지 말고, 현재 dirty 작업트리를 보존하면서 진행해.
우선 실제 브라우저에서 `/`, `/match`, `/notifications`, `/profile/basic`, `/group/create`를 확인해서 이번 프론트 변경이 사용자 체감상 자연스러운지 검증해. 브라우저 자동화가 계속 막히면 curl/문서 근거로 검증 한계를 기록해.
그다음 git status를 분류하고 커밋에 넣을 파일/보류할 파일 후보를 보고해. 아직 커밋은 하지 마.
```

# Phase 11 Frontend Flow Redesign Worker Brief

작성일: 2026-06-15
상태: 구현 승인 대기
담당 예상: 팀장방 총괄, Darwin 구현, 필요 시 Bernoulli DB/API 검토

## 1. 목표

현재 프론트는 사용자가 앱처럼 반복해서 쓰기 어렵다. 화면별 링크 카드가 흩어져 있고, 매칭 상세는 카드 작성, 무료 베타 참여, 매칭 확정, 하루 카드 공개, 채팅, 출석 흐름이 한 파일/한 화면에 길게 누적된다.

이번 phase의 목표는 사용자가 바로 체감하는 앱 동선을 먼저 고치는 것이다.

- 하단 탭으로 `홈 / 매칭 / 알림 / 내정보`를 고정한다.
- 홈을 `오늘 할 일` 중심으로 바꾼다.
- 매칭 상세의 카드 작성 영역을 `사전 힌트 작성` wizard로 바꾼다.
- 논쟁 월드컵은 이미지 A/B 카드로 선택하게 한다.
- 알림 문구는 “매칭이 확정되었습니다. 축하합니다!”처럼 사용자가 이해할 수 있게 바꾼다.
- 출시 전 기능 누락/위험은 프론트 작업과 DB/API 작업으로 분리한다.

## 2. 이번 phase에서 하지 않는 것

- production Supabase 적용 금지
- DB migration 수정 금지
- `lib/types.ts` 수정 금지
- 전체 디자인 시스템 교체 금지
- `app/match/[id]/page.tsx` 전체 대형 리팩터 금지
- 맛집 seed 데이터 확정 금지
- 네이버지도 API/SDK 연동 금지
- 결제/환불 UI 복구 금지

## 3. 현재 증거

| 문제 | 현재 위치 | 판단 |
| --- | --- | --- |
| 하단 앱 셸 없음 | `app/layout.tsx` | `children`만 렌더링하고 bottom nav 없음 |
| 홈이 링크 카드 중심 | `app/page.tsx`, `components/matching/ActiveMatchingHomeCard.tsx` | 사용자의 다음 행동이 한눈에 안 잡힘 |
| 매칭 목록이 상태별로 섞임 | `app/match/page.tsx` | pending/confirmed/completed가 같은 리스트에 있음 |
| 카드 작성이 한 화면에 펼쳐짐 | `app/match/[id]/page.tsx` | `DAILY_CARD_FIELDS.map()`으로 전체 항목 렌더 |
| 카드 작성/공개 용어 혼선 | `app/match/[id]/page.tsx` | 작성 단계와 하루 공개 단계가 모두 데일리카드처럼 보임 |
| 논쟁 이미지 미연결 | `public/daily-cards/debate/*`, `app/match/[id]/page.tsx` | 이미지 에셋은 있으나 선택 UI는 텍스트 버튼 |
| 알림 문구 약함 | `app/notifications/page.tsx` | `match_confirmed` 문구가 축하/다음 행동을 충분히 말하지 않음 |

## 4. 구현 배정

### 4.1 팀장방

역할:
- 최종 범위 확정
- 같은 파일 충돌 판단
- 검증 결과 취합
- 커밋 준비 보고

직접 수정:
- 필요 시 문서만 수정

### 4.2 Darwin

역할:
- 프론트 구현

수정 허용 파일:
- `app/layout.tsx`
- `app/page.tsx`
- `app/match/page.tsx`
- `app/match/[id]/page.tsx`
- `app/notifications/page.tsx`
- `components/navigation/AppBottomNav.tsx` 신규
- `components/matching/DailyCardHintWizard.tsx` 신규
- `components/matching/DebateChoiceCard.tsx` 신규
- 필요 시 `lib/matching/daily-card-authoring.ts`

수정 금지:
- `supabase/migrations/**`
- `app/api/**`
- `lib/types.ts`

### 4.3 Bernoulli

이번 구현에는 기본적으로 투입하지 않는다. 단, 아래 두 항목은 별도 DB/API phase로 넘긴다.

- `confirm_match` 이후 시간/장소 배정 순서 검증
- 하루 1장 공개 카드가 통합 `content_text` 전체를 공개하는 문제 검증

## 5. UX 설계

### 5.1 하단 탭

하단 탭은 모바일 앱의 기본 골격으로 둔다.

| 탭 | 경로 | 역할 |
| --- | --- | --- |
| 홈 | `/` | 오늘 할 일, 진행 상태 |
| 매칭 | `/match` | 매칭 목록, 확정/대기 확인 |
| 알림 | `/notifications` | 매칭 확정, 카드 입력 요청, 리마인더 |
| 내정보 | `/profile/edit` | 프로필 수정 |

숨김 경로:
- `/login`
- `/dev/preview`
- `/admin/**`
- `/match/[id]/chat`

이유:
- 로그인, preview, admin, 채팅은 몰입 화면이라 하단 탭이 방해된다.

### 5.2 홈 오늘 할 일

홈 첫 화면은 `오늘 할 일` 하나를 크게 보여준다.

상태별 카드:

| 상태 | 제목 | 설명 | 버튼 |
| --- | --- | --- | --- |
| 그룹 없음 | 친구와 그룹을 만들어볼까요? | 같이 과팅할 친구를 먼저 모아요 | 친구 추가 |
| 그룹 준비/큐 | 매칭을 찾는 중이에요 | 현재 큐 상태를 확인할 수 있어요 | 큐 상태 보기 |
| 가매칭 pending | 사전 힌트를 입력해주세요 | 상대에게 하루 한 장씩 공개될 힌트 재료예요 | 사전 힌트 작성 |
| 확정 confirmed | 매칭이 확정되었습니다. 축하합니다! | 약속 정보와 오늘의 카드를 확인하세요 | 매칭 확인 |
| 오늘 카드 가능 | 오늘의 카드를 뽑을 시간이에요 | 16:00-20:00 사이 직접 한 장을 골라요 | 카드 뽑기 |

1차 구현에서는 dev mock 기준으로도 이 카드가 보이게 한다.

### 5.3 매칭 목록

매칭 목록은 단순 리스트 대신 상태 의미를 보여준다.

- pending: `사전 힌트 작성 필요`
- confirmed: `약속 정보 확인`
- completed: `지난 매칭`

카드 CTA는 상태에 따라 달라진다.

### 5.4 사전 힌트 작성 wizard

기존 `내 데일리카드 항목` 영역을 `사전 힌트 작성`으로 바꾼다.

동작:
- 한 화면에 하나의 항목만 보여준다.
- 상단에 `1/7`, `2/7` 진행률을 보여준다.
- `이전`, `다음`, `저장` 버튼을 하단에 고정한다.
- 모든 항목을 한꺼번에 펼치지 않는다.
- `4개 이상 작성` 저장 조건은 1차에서는 유지한다.

항목 순서:

1. 좋아하는 노래 3곡
2. 음식 취향
3. 주말/시간 취향
4. 대화 스타일
5. 만남 때 질문
6. 인터넷 논쟁 카드
7. 요즘 빠진 것

### 5.5 논쟁 월드컵

논쟁 항목은 내부에서 다시 한 질문씩 A/B 선택 카드로 보여준다.

질문:
- 탕수육: 찍먹 / 부먹
- 민트초코: 가능 / 반민초
- 중식 메뉴: 짜장 / 짬뽕
- 냉면: 물냉 / 비냉

이미지 경로:

```text
public/daily-cards/debate/tangsuyuk-dip.png
public/daily-cards/debate/tangsuyuk-pour.png
public/daily-cards/debate/mint-choco-yes.png
public/daily-cards/debate/mint-choco-no.png
public/daily-cards/debate/jajang.png
public/daily-cards/debate/jjamppong.png
public/daily-cards/debate/naengmyeon-mul.png
public/daily-cards/debate/naengmyeon-bibim.png
```

### 5.6 알림 문구

`app/notifications/page.tsx`에서 문구를 다음처럼 바꾼다.

| kind | 제목 | 설명 |
| --- | --- | --- |
| `match_created` | 새 가매칭이 도착했어요 | 사전 힌트를 작성하고 참여를 확인해주세요. |
| `match_confirmed` | 매칭이 확정되었습니다. 축하합니다! | 약속 정보와 오늘의 카드를 확인하세요. |
| `meeting_reminder` | 오늘 만남이 예정되어 있어요 | 시간과 장소를 다시 확인해주세요. |

`데일리카드를 입력하세요` 유형의 별도 DB 알림은 아직 없음. 1차에서는 홈 오늘 할 일 카드와 pending 매칭 카드에서 먼저 노출한다.

## 6. 출시 전 기능 누락/위험 목록

이번 phase 구현과 별도 작업으로 분리할 항목이다.

| 우선순위 | 항목 | 담당 추천 | 이유 |
| --- | --- | --- | --- |
| P0 | `confirm_match` 후 시간/장소 배정 순서 검증 | Bernoulli | 실제 확정 후 약속 정보가 안 생기면 핵심 흐름이 끊김 |
| P0 | 하루 1장 공개 카드가 통합 작성 내용을 노출하는 문제 | Bernoulli | 사용자가 작성한 전체 내용이 한 번에 공개될 위험 |
| P1 | 부산대 맛집 3곳 선택 UI와 seed 데이터 | Bernoulli + McClintock | 음식 취향 카드가 현재 텍스트 중심 |
| P1 | dev preview와 실제 기능 문구 정합성 | Darwin | preview에서 출시 전 검토가 막히면 계속 혼선 |
| P2 | 채팅 메시지 정렬 검증 | Bernoulli 또는 Darwin | 최신순 RPC와 화면 렌더 순서 불일치 가능 |

## 7. 검증 계획

명령:

```bash
npm run typecheck
npm run lint
npm run test:matching
```

로컬 route:

```text
http://127.0.0.1:3003/
http://127.0.0.1:3003/match
http://127.0.0.1:3003/match/dev-match-pending
http://127.0.0.1:3003/match/dev-match-1
http://127.0.0.1:3003/notifications
```

브라우저 확인 항목:

- 하단 탭이 홈/매칭/알림/내정보로 보이는지
- 로그인/preview/admin/chat에서 하단 탭이 숨겨지는지
- 홈에서 오늘 할 일이 한눈에 보이는지
- pending 매칭에서 사전 힌트를 한 항목씩 넘길 수 있는지
- 논쟁 월드컵이 이미지 A/B 카드로 보이는지
- 저장 후 기존 card API 동작이 깨지지 않는지
- 알림 문구가 이해 가능한지

## 8. 완료 기준

- 사용자가 앱을 열었을 때 하단 탭으로 큰 영역을 이해할 수 있다.
- 홈에서 다음 행동이 하나로 보인다.
- 카드 작성은 한 화면에 길게 펼쳐지지 않는다.
- 논쟁 월드컵은 이미지 선택 UI로 보인다.
- 알림 문구가 매칭 확정/다음 행동을 분명히 말한다.
- 출시 전 위험 목록이 문서에 분리되어 있다.
- typecheck/lint/test:matching 결과가 보고된다.

## 9. 팀장방 판단

이 phase는 구현 승인만 나면 Darwin 단일 구현으로 진행한다.

같은 파일을 여러 worker에게 동시에 맡기지 않는다. 특히 `app/match/[id]/page.tsx`는 이미 큰 파일이라 Darwin 한 명에게만 맡기고, 팀장방이 diff를 검토한다.

## 10. 승인 후 Darwin 실행 프롬프트

아래 프롬프트는 사용자가 구현을 승인하면 Darwin worker에게 그대로 전달한다.

```text
역할명: Darwin
역할: 프론트 구현

반드시 먼저 읽을 문서:
- docs/coordination/AGENT_ROLES.md
- docs/coordination/TEAM_CONTEXT.md
- docs/coordination/WORKER_REPORT_TEMPLATE.md
- docs/plans/2026-06-15-phase-11-frontend-flow-redesign-worker-brief.md

목표:
Phase 11 지시서대로 프론트 동선을 1차 개선한다.

수정 허용 파일:
- app/layout.tsx
- app/page.tsx
- app/match/page.tsx
- app/match/[id]/page.tsx
- app/notifications/page.tsx
- components/navigation/AppBottomNav.tsx 신규
- components/matching/DailyCardHintWizard.tsx 신규
- components/matching/DebateChoiceCard.tsx 신규
- 필요 시 lib/matching/daily-card-authoring.ts

수정 금지:
- supabase/migrations/**
- app/api/**
- lib/types.ts
- package.json
- package-lock.json

작업 순서:
1. components/navigation/AppBottomNav.tsx를 만든다.
2. app/layout.tsx에 하단 탭을 붙인다. 단, /login, /dev/preview, /admin, /match/[id]/chat에서는 숨긴다.
3. app/page.tsx 홈 상단을 오늘 할 일 중심으로 정리한다.
4. app/match/page.tsx 매칭 카드 CTA를 상태별로 정리한다.
5. components/matching/DebateChoiceCard.tsx를 만들고 debate 이미지 경로를 연결한다.
6. components/matching/DailyCardHintWizard.tsx를 만들고, 한 화면에 한 항목만 보여준다.
7. app/match/[id]/page.tsx의 기존 DAILY_CARD_FIELDS.map 전체 펼침 영역을 wizard로 교체한다.
8. app/notifications/page.tsx의 match_created, match_confirmed 문구를 사용자가 이해하는 문장으로 바꾼다.

주의:
- 기존 사용자 변경을 되돌리지 않는다.
- app/match/[id]/page.tsx 전체 리팩터를 하지 않는다. 카드 작성 영역만 바꾼다.
- 기존 카드 저장 API는 유지한다. 저장 payload는 content_text 그대로 둔다.
- 4개 이상 작성 조건은 유지한다.
- 논쟁 월드컵은 이미지 A/B 카드로 보여주되, 내부 저장값은 기존 encode/decode 구조를 유지한다.
- 커밋하지 않는다.

검증:
- npm run typecheck
- npm run lint
- npm run test:matching
- 로컬 route 확인:
  - http://127.0.0.1:3003/
  - http://127.0.0.1:3003/match
  - http://127.0.0.1:3003/match/dev-match-pending
  - http://127.0.0.1:3003/match/dev-match-1
  - http://127.0.0.1:3003/notifications

보고:
WORKER_REPORT_TEMPLATE.md 형식으로 한국어 보고.
반드시 수정 파일, 검증 결과, 남은 문제를 적는다.
```

## 11. 팀장방 승인 전 체크

구현 시작 전 팀장방은 아래를 사용자에게 확인한다.

```text
Phase 11 구현 승인 여부:
- 하단 탭: 홈 / 매칭 / 알림 / 내정보
- 작성 단계 이름: 사전 힌트 작성
- 공개 단계 이름: 오늘의 카드
- 카드 작성 방식: 한 화면에 하나씩
- 알림 문구: 매칭이 확정되었습니다. 축하합니다!
```

사용자가 `그대로 구현`, `승인`, `진행`이라고 답하면 Darwin 단일 worker로 진행한다.

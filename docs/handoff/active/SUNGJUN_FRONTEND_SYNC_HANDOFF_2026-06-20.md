# 성준 Codex 인수인계: Phase 11 프론트/매칭진입 동기화

작성일: 2026-06-20
담당: 팀장방
대상 브랜치: `profile/post-worldcup-decisions-2026-05-21`

## 성준 Codex에 바로 입력할 프롬프트

아래 내용을 성준 Codex 새 대화방 첫 메시지로 붙여 넣으면 된다.

```text
너는 부산대 과팅앱의 성준 담당 Codex다.
현재 나는 그룹/매칭 엔진 담당이고, 충현/팀장방 쪽에서 Phase 11 프론트 흐름과 매칭 진입 조건을 정리해서 GitHub에 올린 상태다.

먼저 아래 순서로 최신 코드를 받아라.

git fetch origin
git checkout profile/post-worldcup-decisions-2026-05-21
git pull origin profile/post-worldcup-decisions-2026-05-21

받은 뒤 아래 문서를 먼저 읽어라.

docs/handoff/active/SUNGJUN_FRONTEND_SYNC_HANDOFF_2026-06-20.md
docs/plans/2026-06-18-phase-11-ui-verification-report.md
docs/engineering/INTERFACE_CONTRACT.md
docs/engineering/COLLABORATION.md

이번 반영분의 핵심은 이거다.

1. /match, /match/dev-match-pending, /match/dev-match-1 프론트 동선이 눌러볼 수 있는 앱 흐름으로 정리됐다.
2. 데일리카드는 textarea 1개가 아니라 항목별 카드 작성 UI로 진행된다.
3. 음식취향 카드는 부산대 근처 예시 3곳과 네이버지도 검색 링크가 붙었다.
4. 인터넷 논쟁카드는 여러 질문을 A/B로 순차 선택하는 방식이다.
5. 매칭찾기/큐 진입은 이제 그룹 정원 충족 + 성향 선호 + 가능 시간 + 매칭 비중 입력이 끝나야 가능하다.
6. DB migration은 이번 프론트 동기화 커밋에서 추가하지 않았다.

성준 쪽에서 우선 확인할 일:

- 너의 그룹/매칭 엔진 브랜치와 app/group/create, app/match, app/api/groups, app/api/match-pool/enter 충돌 여부를 비교해라.
- match-pool enter API에서 group.size 기준으로 그룹이 꽉 찼는지 확인하는 로직이 성준 엔진 흐름과 맞는지 확인해라.
- member_match_setup_ready, current_user_match_setup 응답 필드가 성준 API 응답 구조와 충돌하지 않는지 확인해라.
- 실제 Supabase 모드에서 성향 선호, 가능 시간, 매칭 비중 저장 후 큐 진입이 막힘없이 이어지는지 확인해라.
- DB/API 변경이 필요하면 새 migration으로 분리하고, z54/Phase4/Phase5 migration은 건드리지 마라.

검증 명령:

npm run typecheck
npm run lint
npm run test:matching
npm run build

로컬 확인:

npm run dev -- -p 3004
http://localhost:3004/
http://localhost:3004/match
http://localhost:3004/match/dev-match-pending
http://localhost:3004/match/dev-match-1
http://localhost:3004/group/create
```

## 이번 반영분 요약

### 1. 매칭 진입 조건 정리

`매칭찾기` 또는 그룹 큐 진입은 아래 조건을 만족해야 한다.

- 그룹 정원이 모두 채워져야 한다.
- 현재 사용자가 성향 선호를 완료해야 한다.
- 현재 사용자가 가능 시간을 입력해야 한다.
- 현재 사용자가 매칭 비중 4개를 입력해야 한다.
- 그룹원 전원이 위 매칭 준비를 끝내야 한다.
- 리더만 큐 진입을 실행할 수 있다.

관련 파일:

- `lib/matching/match-setup-status.ts`
- `lib/dev-match-setup.ts`
- `app/api/groups/route.ts`
- `app/api/match-pool/enter/route.ts`
- `app/match/start/page.tsx`
- `app/group/create/page.tsx`
- `components/matching/group-create/FreeBetaQueuePanel.tsx`

### 2. 프론트 동선 정리

사용자가 앱을 눌러보면서 흐름을 이해할 수 있게 아래 화면을 다듬었다.

- `/match`: pending/confirmed 매칭 CTA 분리
- `/match/dev-match-pending`: 사전 힌트 카드 작성 흐름
- `/match/dev-match-1`: 확정 매칭, 오늘 카드 공개, 채팅 진입
- `/notifications`: 매칭 관련 알림 링크
- `/profile/basic`: 화면 문구 일부 정리

관련 파일:

- `app/match/page.tsx`
- `app/match/[id]/page.tsx`
- `app/match/[id]/chat/page.tsx`
- `app/notifications/page.tsx`
- `app/profile/basic/page.tsx`
- `components/matching/DailyCardHintWizard.tsx`
- `components/matching/DebateChoiceCard.tsx`
- `components/matching/HomeTodayTaskCard.tsx`

### 3. 데일리카드 작성 방식

현재 프론트 기준 데일리카드는 한 textarea가 아니라 항목별 작성 방식이다.

- 첫인상 카드
- 음식취향 카드
- 노래 카드
- 영화/콘텐츠 카드
- 인터넷 논쟁 카드
- 자유 한마디 카드

논쟁카드는 `찍먹/부먹`, `민초 가능/반민초`처럼 여러 질문을 순차 선택한다.

음식취향 카드는 현재 네이버지도 API가 아니라 검색 링크 방식이다.

## 성준 쪽에서 조심할 충돌 지점

| 파일 | 충돌 가능 이유 | 처리 기준 |
| --- | --- | --- |
| `app/group/create/page.tsx` | 성준 그룹 생성 UI/상태와 팀장방 큐 조건 UI가 만날 수 있음 | 큐 진입 조건 UI는 유지하고, 실제 그룹 API 흐름만 성준 기준으로 맞춘다 |
| `app/api/groups/route.ts` | 그룹 응답에 `current_user_match_setup`이 추가됨 | 성준 API 응답 구조와 병합하되 필드는 유지한다 |
| `app/api/match-pool/enter/route.ts` | 큐 진입 차단 조건 강화됨 | 실제 엔진에서도 그룹 정원/전원 준비 완료 전 큐 진입 금지 |
| `app/match/[id]/page.tsx` | pending/confirmed dev preview 흐름 추가됨 | 실제 Supabase 로직과 dev preview 로직을 분리 유지 |
| `components/matching/DailyCardHintWizard.tsx` | 카드 작성 UI 중심 파일 | DB 저장 구조를 바꿀 때 프론트 직렬화 함수와 같이 확인 |

## 검증 완료 기준

팀장방에서 현재 브랜치 기준 아래 검증을 통과시킨 뒤 올린다.

- `npm run typecheck`
- `npm run lint`
- `npm run test:matching`
- `npm run build`

성준 쪽에서는 추가로 실제 Supabase 모드에서 아래를 확인해야 한다.

- 친구가 그룹에 들어오기 전에는 큐 진입 불가
- 그룹 정원이 다 차기 전에는 큐 진입 불가
- 성향 선호/가능 시간/매칭 비중이 비어 있으면 큐 진입 불가
- 모든 그룹원이 준비 완료하면 큐 진입 가능
- 큐 진입 후 매칭 엔진이 기대하는 그룹 상태와 충돌 없음

## 아직 DB/API로 넘길 항목

- 하루 1장 공개 카드가 항목 단위로 안전하게 공개되는지 DB 저장 구조 검증
- 음식점 seed/장소 DB 또는 네이버지도 API 연동
- 친구별 카드 작성 완료 상세 상태
- 카드 작성 요청/오늘 카드 가능 알림 이벤트 저장
- 16:00-20:00 카드 공개 정책의 UI/DB 동시 검증

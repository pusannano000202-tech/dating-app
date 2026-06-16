# Codex 새 채팅방 인수인계서 - 2026-06-16

## 0. 이 문서의 목적

이전 Codex 팀장방이 context window 부족으로 중단됐다.
이 문제는 코드 오류가 아니라, 채팅방에 쌓인 대화량이 너무 많아서 모델이 전체 맥락을 안정적으로 들고 갈 수 없다는 뜻이다.

새 채팅방은 이 문서를 먼저 읽고, 아래 작업 방식과 현재 상태를 그대로 이어받으면 된다.

## 1. 새 채팅방 첫 명령 추천

아래 문장을 새 채팅방에 그대로 붙여넣으면 된다.

```text
팀장방, docs/handoff/active/CODEX_CONTEXT_WINDOW_HANDOFF_2026-06-16.md를 먼저 읽고 현재 작업 상태를 이어받아라.
보고는 한국어로만, 쉬운 말로 직관적으로 해라.
Phase 11은 DB/API 변경 없이 프론트 디자인, 문구, 입력 UX만 수정한다.
먼저 git status, npm run lint, npm run typecheck를 확인하고,
/profile/basic, /match, /match/dev-match-pending, /match/dev-match-1을 사용자 관점에서 검토해라.
커밋 준비는 아직 하지 말고, 깨진 문구와 누르고 싶지 않은 UI부터 바로 고쳐라.
```

## 2. 우리 작업 방식

사용자는 "팀장방" 하나를 중심으로 작업을 지시한다.
팀장방은 작업을 분류하고, 필요하면 고정 역할의 하위 에이전트를 쓴다.

고정 역할은 아래 기준으로 운영한다.

| 이름 | 역할 | 기본 권한 |
|---|---|---|
| 팀장방 | 총괄, 우선순위, 충돌 판단, 최종 보고 | 전체 판단 |
| Noether | 구조/흐름 감사 | 읽기 전용 |
| McClintock | UX/디자인 감사 | 읽기 전용 |
| Bernoulli | DB/API/Supabase 검토 | DB 지정 시만 |
| Darwin | 프론트 구현 | 지정 파일만 |
| Pascal | 이미지/에셋 | `public/...` 중심 |

주의할 점:

- 보고는 영어 섞지 말고 한국어로 한다.
- 사용자는 직관적 보고를 선호한다. 어려운 용어를 쓰면 쉽게 풀어쓴다.
- 커밋은 구현과 검증이 끝난 뒤에만 준비한다.
- 사용자가 "구현해"라고 하면 계획만 말하지 말고 실제로 고친다.
- DB/API/Supabase 변경은 별도 Phase로 분리한다.
- `supabase/migrations/`, `lib/types.ts`, `lib/supabase.ts`, `app/layout.tsx`, `app/page.tsx`는 충돌 위험 파일이다. 수정 시 이유와 범위를 먼저 보고한다.

## 3. 프로젝트 현재 큰 방향

부산대 과팅 앱이다.
핵심 흐름은 다음과 같다.

1. 사용자가 이메일/휴대폰 인증으로 가입한다.
2. 기본정보를 입력한다.
3. 이상형 월드컵을 한다.
4. 성향 질문을 한다.
5. 사진을 업로드한다.
6. 친구를 초대해서 2명 또는 3명 그룹을 만든다.
7. 각 멤버가 자기 성향 선호, 가능 시간, 매칭 비중을 입력한다.
8. 그룹원 전원이 준비되면 매칭 큐에 들어간다.
9. 매칭 결과를 확인한다.
10. 만남 전까지 하루에 하나씩 데일리카드를 사용자가 직접 뽑는다.
11. 약속 시간/장소/연락처가 단계적으로 공개된다.

현재 초기 배포 정책:

- 결제/환불 UX는 뒤로 뺀다.
- 초기 배포는 완전 무료로 간다.
- 보증금/환불 표현은 사용자 화면에서 강하게 노출하지 않는다.
- 사용자 확보가 우선이다.

## 4. 이미 커밋된 큰 흐름

최근 커밋 기준:

- `2659060 feat: complete phase 7-10 match detail and chat flow`
- `77ef0a1 feat: align phase 6 sungjun frontend review flow`
- `76d45e0 fix: integrate phase 5 meeting schema baseline`
- `2f56be8 docs: add phase 5 category b meeting schema brief`
- `96495b1 fix: clean up phase 4 category a db lint`

진행된 단계 요약:

| Phase | 상태 | 요약 |
|---|---|---|
| Phase 0~2 | 완료 및 커밋됨 | 기준선 정리, preview 진입, 4개 가중치, 무료 정책 반영 |
| Phase 3 | 완료 및 커밋됨 | z54 데일리카드 16~20시 직접 뽑기 DB 정책 검증/수정 |
| Phase 4 | 완료 및 커밋됨 | DB lint Category A 정리 |
| Phase 5 | 완료 및 커밋됨 | 성준 브랜치의 `venues`, `match_meetings` 스키마 기준 흡수 |
| Phase 6 | 완료 및 커밋됨 | 성준 프론트 흐름 검토 및 우리 방향과 맞는 부분 정리 |
| Phase 7~10 | 완료 및 커밋됨 | 매칭 상세, 채팅, 결과 흐름 쪽 큰 틀 반영 |
| Phase 11 | 진행 중 | 프론트 동선, 데일리카드 작성/선택, 사용자가 누르고 싶게 만드는 UI 개선 |

## 5. 현재 브랜치와 작업판 상태

현재 브랜치:

```text
profile/post-worldcup-decisions-2026-05-21
```

현재 작업판은 깨끗하지 않다. 커밋 전 상태다.

수정된 파일:

```text
app/layout.tsx
app/match/[id]/page.tsx
app/match/page.tsx
app/notifications/page.tsx
app/page.tsx
app/profile/basic/page.tsx
components/profile/BasicInfoForm.tsx
docs/plans/ACTIVE_PLAN_INDEX.md
docs/plans/README.md
```

새로 생긴 파일/폴더:

```text
components/matching/DailyCardHintWizard.tsx
components/matching/DebateChoiceCard.tsx
components/matching/HomeTodayTaskCard.tsx
components/navigation/
docs/coordination/
docs/handoff/active/MANUS_FRONTEND_FLOW_HANDOFF_2026-06-15.md
docs/plans/2026-06-15-phase-11-frontend-flow-redesign-worker-brief.md
lib/matching/daily-card-authoring.ts
public/daily-cards/
tests/matching/daily-card-authoring.test.ts
```

현재 검증 결과:

```text
npm run lint      통과
npm run typecheck 통과
```

중요:

- 검증은 통과하지만 일부 화면 문구가 아직 깨진 한글로 보인다.
- 특히 `/profile/basic`, `/match`, `/match/[id]` 일부 문구는 사용자에게 보여주면 안 되는 수준의 깨진 텍스트가 남아 있다.
- 새 방 첫 작업은 커밋 준비가 아니라 "문구 복구 + 실제 브라우저 확인"이다.

## 6. Phase 11 현재 요청

사용자의 직전 핵심 요청:

```text
Phase 11 UI를 "사용자가 눌러보고 싶게" 만드는 기준으로 다시 봐.
기술적으로 되는지 말고, 실제 사용자가 입력하고 싶고 카드 눌러보고 싶게 보이는지 기준으로
/profile/basic, /match, /match/dev-match-pending, /match/dev-match-1을 순서대로 검토해.
DB/API 변경 없이 프론트 디자인과 문구, 입력 UX만 바로 수정해.
미구현인데 DB가 필요한 건 따로 목록화하고, 프론트에서 가능한 건 이번 턴에 구현해.
```

검토 대상 라우트:

| 라우트 | 파일 |
|---|---|
| `/profile/basic` | `app/profile/basic/page.tsx`, `components/profile/BasicInfoForm.tsx` |
| `/match` | `app/match/page.tsx` |
| `/match/dev-match-pending` | `app/match/[id]/page.tsx` |
| `/match/dev-match-1` | `app/match/[id]/page.tsx` |

## 7. 직전 중단 직전까지 된 일

`app/match/[id]/page.tsx`에서 깨졌던 JSX는 복구했다.

확인된 상태:

- `npm run lint` 통과
- `npm run typecheck` 통과
- `/match/[id]`의 오늘 카드 선택 UI 일부는 정상 JSX로 정리됨
- `지금 공개 카드 고르기`, `카드 1번`, `탭해서 고르기` 같은 문구가 들어감
- `/match/dev-match-pending`, `/match/dev-match-1`은 같은 동적 라우트 파일을 사용한다

주의:

- `/profile/basic` 문구 교체를 시도하던 중 context 부족으로 중단됐다.
- 현재 `/profile/basic` 상단에는 깨진 한글이 남아 있다.
- 새 방에서 이 부분을 먼저 고쳐야 한다.

## 8. 새 방에서 바로 해야 할 작업 순서

1. 현재 상태 확인

```bash
git status --short
npm run lint
npm run typecheck
```

2. `/profile/basic` 문구 복구

우선 고쳐야 할 파일:

```text
app/profile/basic/page.tsx
components/profile/BasicInfoForm.tsx
```

현재 `app/profile/basic/page.tsx`에는 깨진 문구가 있다.

교체 방향:

- 제목: `내 정보 등록`
- 설명: `매칭 전에 필요한 기본정보를 가볍게 채워요.`
- 체크리스트: `프로필 이름`, `기본 신체 정보`, `휴대폰`, `다음 단계`
- 문구는 짧고, 사용자가 "입력하면 다음으로 간다"는 느낌이 나야 한다.

3. `/match` 목록 화면 문구 복구

우선 고쳐야 할 파일:

```text
app/match/page.tsx
```

방향:

- "Touch to open" 같은 영어는 한국어로 바꾼다.
- 매칭 카드는 누를 수 있다는 느낌이 나야 한다.
- 상태별 문구:
  - 대기: `준비 이어가기`
  - 확정: `오늘 카드 확인`
  - 완료: `기록 보기`

4. `/match/dev-match-pending` 확인

우선 고쳐야 할 파일:

```text
app/match/[id]/page.tsx
```

방향:

- 사용자가 다음에 뭘 해야 하는지 한눈에 보여야 한다.
- 카드 입력, 보증금/무료 참여, 확정 버튼의 순서가 명확해야 한다.
- "기술 설명"보다는 "지금 누를 행동" 중심으로 문구를 바꾼다.

5. `/match/dev-match-1` 확인

방향:

- 데일리카드 뽑기 영역이 가장 먼저 눈에 들어와야 한다.
- 카드 3개는 실제 카드처럼 눌러보고 싶게 보여야 한다.
- 카드 선택 후에는 `오늘 카드 공개 완료` 느낌이 나야 한다.

6. 브라우저 확인

가능하면 Browser 플러그인으로 확인한다.
안 되면 `Invoke-WebRequest`로 최소 200 응답을 확인하고, 사용자가 직접 볼 수 있게 로컬 URL을 안내한다.

확인할 URL:

```text
http://127.0.0.1:3003/profile/basic
http://127.0.0.1:3003/match
http://127.0.0.1:3003/match/dev-match-pending
http://127.0.0.1:3003/match/dev-match-1
```

## 9. DB/API가 필요한 항목

이번 Phase 11에서는 하지 말고 목록으로만 남길 것:

| 항목 | 왜 DB/API가 필요한가 |
|---|---|
| 항목별 데일리카드 작성값 저장 | 현재 프론트 UI만으로는 멤버별 카드 항목 완료율을 영구 저장하기 어렵다 |
| 논쟁카드 여러 질문/선택 저장 | 질문별 선택, 집계, 상대 그룹 공개 방식이 필요하다 |
| 부산대 맛집 3곳 + 네이버지도 연동 | 장소 데이터, 외부 지도 링크/API, 후보 저장 구조가 필요하다 |
| 홈의 진행 중 매칭 결과 알림 | 실제 매칭/데일리카드 이벤트와 알림 테이블 연결이 필요하다 |
| 친구별 준비 상태 실시간 반영 | 그룹 멤버별 준비 상태와 구독/재조회 정책이 필요하다 |
| 데일리카드 실제 추천 알고리즘 | 카드 풀, 성향 기반 선택, 공개 시점 정책이 필요하다 |

## 10. 플러그인 사용 기준

이번 작업에서 우선순위:

- Browser: 로컬 화면 확인용. 가능하면 사용한다.
- Canva: 화면 컨셉 시안이나 발표용 디자인이 필요할 때만 쓴다. 코드 구현에는 필수 아님.
- Computer Use: 브라우저/앱 조작이 Browser로 안 될 때만 보조로 쓴다.
- Supabase: Phase 11에서는 쓰지 않는다. DB/API 변경 금지.
- Vercel: Phase 11에서는 쓰지 않는다. 배포 작업 아님.

## 11. 성준 작업과의 충돌 원칙

성준 쪽 작업은 그룹/매칭 엔진이 중심이다.
우리 쪽은 지금 프론트 검토 모드와 사용자 동선 정리 중심이다.

겹칠 수 있는 영역:

```text
app/group/
app/match/
components/matching/
supabase/migrations/
lib/types.ts
```

처리 원칙:

- 성준 브랜치 코드를 무조건 덮어쓰지 않는다.
- 우리 방향에 맞는 것은 별도 worktree/비교로 흡수한다.
- DB migration은 production에 직접 적용하지 않는다.
- 실제 Supabase는 사용자가 명시하기 전까지 건드리지 않는다.

## 12. 새 방이 기억해야 할 말투

사용자는 답답한 상황에서 빠르게 판단하고 싶어 한다.
따라서 보고는 아래처럼 한다.

좋은 보고:

```text
현재 상태:
- 빌드는 통과
- /profile/basic 문구 깨짐 남음
- /match 카드 클릭 UX는 일부 개선됨
- 아직 커밋하면 안 됨

다음 작업:
1. 깨진 문구 복구
2. 4개 라우트 브라우저 확인
3. DB 필요한 항목 따로 정리
```

피해야 할 보고:

```text
복잡한 영어 용어 나열
작업 전에 커밋부터 추천
기술적으로 가능하다는 설명만 하고 UI를 안 고침
사용자가 모르는 세부 구현어를 길게 설명
```

## 13. 다음 Phase 제안

Phase 11을 끝내는 기준:

- `/profile/basic`에서 깨진 글자가 없다.
- `/match`에서 각 매칭 카드가 누르고 싶게 보인다.
- `/match/dev-match-pending`에서 준비 단계가 명확하다.
- `/match/dev-match-1`에서 데일리카드 3개 선택 UI가 카드답게 보인다.
- DB/API가 필요한 미구현 항목이 따로 정리돼 있다.
- `npm run lint`, `npm run typecheck`가 통과한다.
- 가능하면 브라우저로 4개 라우트를 직접 확인한다.

그 다음 추천 Phase:

```text
Phase 12: 데일리카드 항목별 작성/선택 UX 완성
Phase 13: 논쟁카드 여러 질문 + 이미지 에셋 정리
Phase 14: 홈-알림-매칭상세 연결 흐름 정리
Phase 15: DB/API 연동이 필요한 항목만 별도 설계
```

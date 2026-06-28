# Codex Team Workflow Reset Plan

작성일: 2026-06-12  
대상 프로젝트: 부산대 과팅앱  
목적: 기능을 하나씩 즉흥 수정하는 방식에서 벗어나, 팀장 방 + 담당자 방 + 페이즈 게이트 방식으로 개발 흐름을 다시 세운다.

## 현재 팀장방 기준 최신 상태

이 문서는 아래 상태를 이미 반영된 기준선으로 둔다. 앞으로 담당자 방에 일을 줄 때는 이 상태를 되돌리지 않는다.

### 이미 처리된 진행 막힘

- `http://localhost:3003/dev/preview`에서 로그인 없이 앱 화면을 볼 수 있다.
- `/dev/preview`에서 "이상형 월드컵"을 눌러도 `/login`으로 튕기지 않는다.
- 인앱 브라우저에서 `/profile/worldcup` 진입 후 `64강`, `어떤 사람이 더 끌려?`, 이미지 2개 렌더링을 확인했다.
- `basic`, `worldcup`, `survey` 온보딩 페이지는 dev preview 세션이면 Supabase user가 없어도 다음 단계 확인이 가능하다.

### 최신 제품 결정

- 매칭 가중치는 4개만 유지한다: `appearance`, `personality`, `height`, `body_type`.
- 학교, 취미, 시간대는 가중치에서 제외한다.
  - 학교: 부산대 전제라 가중치로 받을 의미가 약하다.
  - 취미: 현재 프로필에 입력/판단 데이터가 없다.
  - 시간대: 가능 시간 입력은 별도 단계로 받는다.
- 데일리카드는 09:00 자동 공개가 아니라, 16:00-20:00 사이 사용자가 직접 뽑는 방식으로 간다.
- 초기 배포는 전면 무료 베타다. 보증금/환불/매칭비 정산 UX는 사용자 확보 이후로 미룬다.

### 이미 갱신된 문서

- `docs/plans/2026-06-12-thread-context-consolidated-audit.md`
- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`
- `docs/plans/README.md`

### 기준 검증

아래 검증은 2026-06-12 작업 기준으로 통과했다.

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

주의: `npm run build`를 dev server가 켜진 상태에서 실행하면 `.next`가 production build로 덮여 기존 dev server chunk가 깨질 수 있다. build 후 화면 검증을 계속하려면 `localhost:3003` dev server를 재시작한다.

## 0. 왜 리셋이 필요한가

지금 문제는 코드 한 군데가 이상한 수준이 아니다. 기능, 디자인, 로그인 우회, Supabase 실제 연결, 로컬 검토 모드, 성준 작업물, 충현 작업물이 한 흐름 안에서 계속 섞였다.

그 결과:

- 화면을 보며 고치려면 로그인/인증이 막는다.
- 인증을 우회하면 dev 코드와 실제 서비스 코드가 섞인다.
- UI는 바뀌는데 매칭 엔진에 실제로 반영되는지 바로 알기 어렵다.
- 문서는 많지만 현재 살아 있는 결정과 과거 기록이 잘 분리되지 않는다.
- 한 채팅에서 기획, 구현, 디버깅, 코드리뷰를 다 하면서 맥락이 계속 흐려진다.

앞으로는 `작업을 빨리 시작하는 것`보다 `작업 경계와 완료 기준을 먼저 고정하는 것`을 우선한다.

## 1. 새 운영 원칙

참고한 방식: `C:/Users/82108/Downloads/README.md`의 AI 사무실 방식.

이 프로젝트에 맞게 바꾸면 핵심은 아래다.

```text
팀장 방: 직접 코드를 막 고치지 않고, 작업을 나누고 완료 보고를 취합한다.
담당자 방: 정해진 범위 안에서만 구현/검토한다.
게이트: 한 단계가 끝나면 바로 다음으로 넘어가지 않고, 사용자 확인 후 진행한다.
```

### 팀장 방 규칙

- 현재 이 대화방을 기본 `팀장 방`으로 둔다.
- 팀장 방은 항상 아래 4가지를 관리한다.
  - 현재 목표
  - 진행 중인 담당자 방/작업
  - 완료된 산출물
  - 다음 게이트에서 결정해야 할 것
- 팀장 방에서 바로 코드를 고치는 일은 예외로 둔다.
  - 예외: 사용자가 직접 "바로 구현해"라고 한 단일 작업
  - 예외: 깨진 화면/빌드 오류처럼 진행을 막는 긴급 수리

### 담당자 방을 나누는 기준

아래 셋 중 하나라도 해당하면 새 작업 단위로 나눈다.

| 기준 | 질문 | 적용 예시 |
|---|---|---|
| 병렬성 | 동시에 해도 되는가? | UI 시안 검토와 DB 스키마 감사 |
| 역할 분리 | 판단 기준이 다른가? | 구현 방과 코드리뷰 방 |
| 재사용 | 나중에 다시 이어갈 일인가? | 매칭 엔진, 프로필 온보딩, 배포/환경 |

## 2. 지금 팀 상황 반영

현재 조건:

- 성준: 시험기간, 적극 구현 투입 어려움
- 충현: 시험 없음, Codex로 주도 가능
- 협업 도구: Claude Code는 쓰지 않고 Codex만 사용
- 목표: 성준이 돌아왔을 때도 어디까지 됐고 무엇을 보면 되는지 바로 이해 가능해야 함

권장 분담:

| 역할 | 담당 | 지금 할 일 |
|---|---|---|
| 제품/흐름 결정자 | 충현 | 화면 흐름, 우선순위, MVP 범위 결정 |
| 구현 실행 | 충현 + Codex | 프론트/로컬 검토/기본 API 연결 |
| 매칭 계약 리뷰 | 성준 | 시험 중에는 비동기 리뷰만. 핵심 인터페이스 변경 시 10-15분 검토 |
| 코드 감사/QA | Codex 별도 작업 단위 | 구현 후 검증, 불필요 파일 후보 정리 |

성준에게 지금 당장 많은 구현을 맡기지 않는다. 대신 아래 두 지점만 확인 요청한다.

1. 매칭 엔진이 읽어야 하는 `profiles` 필드와 `preference_weights` 의미
2. 그룹/큐/매칭 확정에서 상태값이 바뀌는 정확한 조건

## 3. 현재 코드 상태 요약

아래는 2026-06-12 현재 로컬 코드 기준으로 확인한 상태다.

### Git 상태

- 현재 브랜치: `profile/post-worldcup-decisions-2026-05-21`
- 최근 기준 커밋: `98e703a Merge remote-tracking branch 'origin/main'...`
- 작업 트리: 매우 dirty
  - 수정된 파일 다수
  - 신규 파일 다수
  - `AGENTS.md`, `app/dev/`, `components/matching/`, `lib/dev-auth.ts`, `lib/dev-match-setup.ts` 등이 아직 untracked

즉, 지금은 새 기능을 계속 얹기 전에 `현재 변경분을 분류`해야 한다.

### 큰 파일 / 위험 구역

| 파일 | 상태 | 판단 |
|---|---|---|
| `app/group/create/page.tsx` | 약 1041줄 | 그룹 생성, 초대, 보증금, 큐 진입, dev mock, 레이더 UI 트리거가 섞여 있음. 최우선 분리 대상 |
| `components/matching/QueueRadarCard.tsx` | 약 423줄 | 디자인 컴포넌트로는 유효하지만 시각/데이터/액션이 커짐. 추후 하위 컴포넌트 분리 가능 |
| `app/profile/preferences/page.tsx` | 약 255줄 | 4개 가중치 UI로 정리됨. live DB batch loader와 점수 계산 반영은 아직 확인 필요 |
| `app/match/start/page.tsx` | 매칭 준비 게이트 | 성향 선호, 가능 시간, 매칭 비중을 순서대로 안내. 문구/조건은 새 정책과 맞춰 재검토 필요 |
| `lib/matching/score.ts` | 순수 매칭 점수 | 전역 고정 가중치 기반. 사용자가 입력한 4개 가중치가 직접 반영되지 않음 |
| `lib/matching/types.ts` | 매칭 엔진 전용 타입 | 4개 가중치 기준으로 맞췄지만 실제 pool loader 입력 경로 확인 필요 |

### 기능별 현재 상태

| 영역 | 현재 구현 | 문제 |
|---|---|---|
| 로그인/Auth | Supabase Auth + 로컬 dev bypass | 실제 로그인 UX는 나중으로 뺐고, dev 우회와 실제 인증 경계가 명확해야 함 |
| 로컬 검토 모드 | `/dev/preview`, `lib/dev-auth.ts`, `lib/dev-match-setup.ts` | 화면 검토에는 유용. 프로덕션 차단 보장 필요 |
| 온보딩 기본정보 | `app/profile/basic`, `BasicInfoForm` | 큰 틀 유지 가능 |
| 학교 인증 | `app/profile/school`, school email API | 이메일/코드 방식 정리 필요 |
| 이상형 월드컵 | `app/profile/worldcup`, profile-worldcup docs | 외모 선호 벡터와 실제 저장/매칭 연결 확인 필요 |
| 성향 선호 | `app/profile/personality-preference`, `lib/matching/personality-preference.ts` | 매칭 준비 단계에 포함됨 |
| 사진 업로드 | `app/profile/photos`, `PhotoUpload` | Supabase Storage/AI 서버 연결 상태 재검증 필요 |
| 매칭 비중 | `app/profile/preferences`, `PreferenceWeightInputs` | UI는 4개 항목. 엔진 반영 미완 |
| 그룹 생성/초대 | `app/group/create`, `app/api/groups` | 실제 DB 흐름 + dev preview 흐름이 한 페이지에 섞임 |
| 매칭 큐 시각화 | `QueueRadarCard`, `ActiveMatchingHomeCard` | 디자인 검토용으로 유효. 실제 큐 통계/RPC와 분리 필요 |
| 결제/환불 | legacy deposit/refund 구조 일부 유지 | 초기 운영은 무료 베타. 사용자 화면은 결제/환불을 요구하지 않도록 유지하고 DB cleanup은 별도 phase |
| 관리자 | `app/admin/*` | 일부 구현 있음. MVP 필수 여부 재정의 필요 |

## 4. 지금 당장 쓸모없는 파일이 아니라, 정리 후보

바로 삭제하지 않는다. `docs/delete-candidates/README.md` 규칙대로 한 번 격리/검토 후 삭제한다.

### 삭제 후보

| 후보 | 근거 | 처리 |
|---|---|---|
| `components/profile/PreferenceSliders.tsx` | 새 `PreferenceWeightInputs`로 교체됨. 현재 `rg` 기준 import 없음 | 삭제 후보. 단, 1회 빌드/검색 후 제거 |
| `components/DestinyLogo.tsx` | 현재 `rg` 기준 import 없음 | 삭제 후보. 브랜드 전환 전 사용 계획 없으면 제거 |
| 루트의 `대한민국을 뜨겁게... (1).md` 파일 | 프로젝트 구조 밖에 있는 산발 문서로 보임 | 내용 확인 후 `docs/archive/` 또는 `docs/delete-candidates/` 이동 |
| `app/debug/sanji/page.tsx` | 문서상 출시 전 삭제로 표시된 debug preview | 출시 전 삭제 후보. 단 `SanjiCharacter`는 refund 페이지에서 사용 중이라 삭제 금지 |

### 보류

| 후보 | 보류 이유 |
|---|---|
| `components/SanjiCharacter.tsx` | debug에도 쓰이지만 `app/match/[id]/refund/page.tsx`에서 실제 사용 중 |
| `app/dev/preview` | 로컬 디자인 검토를 위해 필요. production guard 확인 후 유지 |
| `lib/dev-auth.ts`, `lib/dev-match-setup.ts` | 로그인 이슈로 UI 진행이 막히지 않게 하는 임시 장치. 출시 전 차단 점검 필요 |
| `python/appearance/` | 현재 프론트 작업에는 무겁지만 외모 AI 서버 후보라 바로 삭제 금지 |
| `docs/archive/*` | 오래된 문서지만 히스토리로 가치 있음. 현재 계획에서 참조 우선순위만 낮춤 |

### 유지

| 파일 | 이유 |
|---|---|
| `components/BootingLogo.tsx` | 홈, 로그인, 관리자, 프로필 완료 등에서 사용 중 |
| `components/MatchingPool.tsx` | 홈에서 사용 중 |
| `components/matching/QueueRadarCard.tsx` | 큐 진입 완료 디자인의 현재 핵심 |
| `components/matching/ActiveMatchingHomeCard.tsx` | 홈에서 진행 중인 매칭 확인 진입점 |

## 5. 제품 흐름을 다시 고정

사용자가 처음 계정을 만들 때:

```text
이메일/휴대폰 인증
→ 기본 정보
→ 학교 인증
→ 이상형 월드컵
→ 성향 질문
→ 사진 업로드
→ 프로필 완료
```

매칭을 찾을 때:

```text
홈에서 매칭 찾기
→ 성향 선호
→ 가능 시간
→ 매칭 비중(외모/성격/키/체형)
→ 그룹 만들기/친구 초대
→ 그룹원 준비 완료 확인
→ 무료 베타 참여 확인
→ 매칭 큐 진입
→ 큐 대기 화면
→ 결과 공개
```

중요 결정:

- `매칭 비중`은 가입 프로필이 아니라 매칭 진입 전 설정이다.
- `학교/취미/시간대`는 지금 가중치 UI에서 제거한다.
  - 학교: 부산대 전제라 가중치로 받을 의미가 약함
  - 취미: 현재 입력/판단 데이터 없음
  - 시간대: 가능 시간 입력은 별도 단계로 받음
- 실제 매칭 엔진은 사용자가 입력한 4개 비중을 점수 계산에 반영해야 한다.
- 보증금/환불은 MVP 초기 출시 흐름에서 제외한다. 기존 DB/RPC는 legacy compatibility로만 보고, 별도 cleanup migration 전까지 사용자 화면에서 앞세우지 않는다.

## 6. 앞으로의 페이즈

### Phase 0. 동결 및 현황 감사

목표: 더 얹기 전에 현재 변경분을 분류한다.

작업:

- `git status --short` 결과를 기준으로 파일을 분류한다.
- 변경 파일을 아래 네 그룹으로 나눈다.
  - 유지할 제품 변경
  - 로컬/dev 전용 변경
  - 문서/계획 변경
  - 삭제/보류 후보
- `npm run typecheck`, `npm run lint`를 기준선으로 통과시킨다.
- 주요 화면 5개를 로컬 브라우저에서 확인한다.
  - `/`
  - `/dev/preview`
  - `/match/start`
  - `/profile/preferences`
  - `/group/create`

완료 산출물:

- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md` 갱신
- 삭제 후보 목록 갱신
- 현재 로컬 실행 URL과 검증 결과

게이트 질문:

```text
현재 변경분 중 무엇을 살리고, 무엇을 버릴까?
```

### Phase 1. 제품 플로우 계약 확정

목표: 화면을 더 만들기 전에 실제 사용자 여정을 고정한다.

작업:

- 가입 플로우와 매칭 플로우를 각각 한 장으로 정리한다.
- 각 단계의 완료 조건을 DB 필드/RPC와 연결한다.
- dev preview 우회가 어디까지 허용되는지 정한다.

완료 산출물:

- `docs/plans/2026-06-xx-product-flow-contract.md`
- `app/match/start/page.tsx` 문구/조건 수정 계획
- `app/profile/*` 단계별 완료 조건 표

게이트 질문:

```text
이 순서가 실제 서비스에서 말이 되는가?
```

### Phase 2. 데이터/인터페이스 계약 정리

목표: UI가 저장하는 값과 매칭 엔진이 읽는 값을 맞춘다.

작업:

- `PreferenceWeights` 정책을 확정한다.
  - 현재 UI: `appearance`, `personality`, `height`, `body_type`
  - 현재 계약: `docs/engineering/INTERFACE_CONTRACT.md`도 동일 4개 key 기준
  - 제거 결정: `school`, `hobby`, `time_fit`
- `lib/matching/types.ts`의 `MatchingPreferenceWeights`와 UI 저장값의 매핑을 정의한다.
- `lib/matching/score.ts`가 사용자 입력 가중치를 실제 점수에 반영하도록 설계한다.

완료 산출물:

- `docs/engineering/INTERFACE_CONTRACT.md` 업데이트안
- 매칭 가중치 매핑 테스트
- `npm run test:matching` 기준선

게이트 질문:

```text
성준이 이 매칭 입력 계약에 동의하는가?
```

### Phase 3. 화면 구조 리디자인

목표: 디자인을 고치되 데이터 흐름을 망가뜨리지 않는다.

작업 순서:

1. 홈
2. 매칭 시작
3. 그룹 생성/초대
4. 큐 진입 완료
5. 프로필/매칭 비중

규칙:

- 한 번에 한 화면만 고친다.
- 화면마다 `before`, `target behavior`, `local verification`을 문서에 남긴다.
- API/DB 변경이 필요하면 화면 작업을 멈추고 Phase 2로 되돌린다.

완료 산출물:

- 각 화면별 짧은 UI spec
- 브라우저 검증 결과
- 필요한 경우 스크린샷

### Phase 4. 큰 파일 분리

목표: `app/group/create/page.tsx` 같은 거대 파일을 더 이상 키우지 않는다.

분리 추천:

```text
app/group/create/page.tsx
→ data loading / page shell만 유지

components/matching/GroupReadinessCard.tsx
components/matching/InviteFriendPanel.tsx
components/matching/FriendListPanel.tsx
components/matching/DepositStatusPanel.tsx
components/matching/QueueEntryPanel.tsx
components/matching/QueueRadarCard.tsx

lib/group/create-state.ts
lib/group/dev-preview-state.ts
```

완료 기준:

- `group/create/page.tsx` 400줄 이하
- dev preview 데이터가 별도 파일로 분리
- 실제 API 호출과 dev fallback이 함수 레벨로 분리

### Phase 5. 통합 QA

목표: 로컬에서 사용자가 실제로 눌러볼 수 있는 흐름을 만든다.

검증 시나리오:

- 로컬 dev bypass로 진입
- 홈 → 매칭 찾기
- 성향 선호 완료
- 가능 시간 완료
- 매칭 비중 완료
- 그룹 생성
- 초대/준비 완료 dev flow
- 큐 진입
- 홈에서 진행 중인 매칭 확인

필수 명령:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run test:profile
```

가능하면 추가:

```powershell
npm run build
```

## 7. 담당자 방 구성안

Codex만 쓴다는 전제에서, 스레드를 이렇게 나누는 것을 추천한다.

| 방 이름 | 역할 | 시작 시점 |
|---|---|---|
| `manager` | 팀장 방. 현재 방을 사용 | 항상 |
| `audit-current-state` | 현재 변경분/쓸모없는 파일/위험 파일 감사 | Phase 0 |
| `product-flow` | 가입/매칭 플로우 계약 작성 | Phase 1 |
| `matching-contract` | 매칭 가중치/엔진 입력 계약 | Phase 2 |
| `frontend-ui` | 화면 단위 디자인/구현 | Phase 3 |
| `group-refactor` | `group/create` 분리 | Phase 4 |
| `qa-browser` | 로컬 브라우저 검증/회귀 확인 | 각 Phase 마지막 |

중요:

- 담당자 방은 자기 범위 밖 파일을 수정하지 않는다.
- 팀장 방은 각 방의 완료 보고를 모아서 다음 게이트를 연다.
- 같은 파일을 두 방이 동시에 건드리지 않는다.

## 8. 작업 티켓 템플릿

앞으로 Codex에게 작업시킬 때 아래 템플릿을 쓴다.

```markdown
# Task
한 줄 목표:

## Scope
- 수정 가능 파일:
- 수정 금지 파일:
- 관련 문서:

## Required Behavior
- 

## Verification
- [ ] npm run typecheck
- [ ] npm run lint
- [ ] 브라우저 확인 URL:
- [ ] 확인할 화면 상태:

## Report Format
- 변경 요약
- 검증 결과
- 남은 리스크
```

## 9. 금지 규칙

- 계획 없이 DB migration 추가 금지
- `lib/types.ts`, `supabase/migrations`, `docs/engineering/INTERFACE_CONTRACT.md`를 조용히 수정 금지
- dev preview 코드를 실제 production 흐름처럼 설명 금지
- UI만 바꾸고 실제 데이터 반영 여부를 확인하지 않은 채 완료 처리 금지
- 깨진 한글/깨진 화면을 보고도 "일단 완료" 금지
- 한 화면 수정 중 다른 화면 대규모 리팩터 금지
- 성준 검토가 필요한 매칭 계약 변경을 혼자 확정 금지

## 10. 바로 다음 추천 작업

1. Phase 0 감사 문서를 기준선으로 삼고, 현재 dirty working tree를 기능 묶음별로 분류한다.
2. `app/match/start/page.tsx`의 매칭 비중 설명을 4개 항목 기준으로 맞춘다.
3. `PreferenceSliders.tsx`를 삭제 후보로 이동할지 결정한다.
4. `lib/matching/score.ts`에 사용자 가중치가 실제로 반영되도록 별도 계획을 세운다.
5. `app/group/create/page.tsx` 분리 계획을 쓴다.
6. 무료 베타 정책에 맞춰 deposit/refund DB cleanup migration 계획을 별도 작성한다.

내 추천 순서:

```text
Phase 0 감사
→ 매칭 가중치 엔진 반영
→ group/create 분리
→ 홈/그룹/큐 디자인 polish
→ 무료 베타 DB cleanup
→ 인증/Supabase 실제 운영 준비
```

이 순서가 좋은 이유는, 지금 가장 위험한 불일치가 "화면에서 고른 값이 실제 매칭에 반영되지 않는 문제"이기 때문이다. 디자인을 더 예쁘게 하기 전에 이 계약부터 맞춰야 한다.

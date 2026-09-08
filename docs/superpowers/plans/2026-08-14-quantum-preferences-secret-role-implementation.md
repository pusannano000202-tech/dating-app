# Quantum Preferences and Secret Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 취소 후 매칭 복귀, 재사용 가능한 평소 취향, 만남별 오늘 카드, 본인 전용 비밀 역할 5종과 종료 후 역할 맞히기를 개인정보 누출 없이 실제 저장·조회·검증 가능한 기능으로 만든다.

**Architecture:** 평소 취향, 만남별 오늘 카드, 같은 방 공개 스냅샷, 비밀 역할을 서로 다른 타입과 저장 경계로 분리한다. 브라우저는 인증된 Next.js API만 호출하고, API는 기본 거부 RLS 위에 최소 권한 `SECURITY DEFINER` RPC를 호출한다. 과거 마이그레이션은 수정하지 않고 후속 마이그레이션으로 취소 원자성, 안전 스냅샷 v2, 비밀 역할 배정·교환·맞히기 계약을 교체한다.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase Postgres/RPC/RLS, Node test runner, Playwright/브라우저 수동 QA

---

## 작업 파일 지도

### 새 파일

- `lib/matching/quantum-profile-preferences.ts`: 평소 취향, 오늘 카드, 공개 미리보기의 타입·검증·직렬화·연락처 차단 순수 함수
- `lib/matching/quantum-secret-roles.ts`: 역할 5종, 활동별 미션, 본인 역할·추측 상태의 파서와 표시 계약
- `app/api/profile/quantum-preferences/route.ts`: 본인 평소 취향 조회·저장 API
- `app/api/match/event-meeting-moment/route.ts`: 본인 만남별 오늘 카드 조회·저장 API
- `app/api/match/event-secret-role/route.ts`: 본인 비밀 역할 조회·1회 변경 API
- `app/api/match/event-role-guesses/route.ts`: 종료 후 역할 추측 조회·제출 API
- `components/profile/QuantumProfilePreferenceWizard.tsx`: 마이 화면의 재사용 취향 편집기
- `components/matching/QuantumMeetingMomentWizard.tsx`: 참여 직전 30초 오늘 카드 입력기
- `components/matching/QuantumSecretRoleCard.tsx`: 본인만 여는 봉인 역할 카드
- `components/matching/QuantumRoleGuessing.tsx`: 종료 후 같은 방 참가자 역할 맞히기
- `supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql`: 새 저장소, RLS, RPC, 취소 정리, 역할 배정·교환·추측 후속 마이그레이션
- `tests/matching/quantum-profile-preferences.test.ts`: 평소 취향·오늘 카드·안전 공개 순수 계약
- `tests/matching/quantum-secret-role.test.ts`: 역할 비공개·중복 방지·1회 교환·맞히기 계약
- `tests/matching/quantum-debate-card.test.ts`: A/B/건너뛰기·공개 최대 3개·비판단 경계
- `tests/matching/quantum-preference-secret-role-migration.test.ts`: SQL 보안·권한·원자성 정적 계약
- `tests/matching/quantum-preference-secret-role-api.test.ts`: API 인증·유효성·민감정보 미반환 계약

### 수정 파일

- `app/api/match/event-participation/route.ts`: 취소 RPC 반환값 전달, 평소 취향·오늘 카드 준비 경계 연결
- `components/matching/QuantumEventWheel.tsx`: 취소 처리 중 상태, 성공 알림, 남은 활성 약속 또는 `/match?choose=another` 이동
- `components/matching/QuantumEventRoomLobby.tsx`: 공개 역할 제거, 익명 좌석 클릭 시 안전한 평소 취향·오늘 카드만 표시
- `lib/matching/quantum-event-rooms.ts`: 공개 참가자 카드에서 `meetup_role` 제거, v2 안전 미리보기 파싱
- `app/profile/match-card/page.tsx`: 기존 단일 B카드를 평소 취향 관리 화면으로 전환하고 기존 저장값을 안전하게 읽기
- `components/matching/QuantumPrecardWizard.tsx`: 역할 입력 제거, 재사용 취향 전용 입력으로 축소 또는 새 편집기에 위임
- `components/matching/QuantumEventApplicationStatus.tsx`: 오늘 카드, 본인 역할, 종료 후 역할 맞히기 상태 연결
- `app/dev/event-room-lobby-preview/page.tsx`: 실제 개인정보 없이 v2 공개 카드·본인 역할·맞히기 시각 QA fixture 제공
- `tests/matching/quantum-event-participation.test.ts`: 취소 응답·중복 처리 계약
- `tests/matching/quantum-event-room-contract.test.ts`: 공개 역할 제거·익명 카드·본인 역할 분리 계약
- `tests/matching/quantum-event-room-backend.test.ts`: 취소 정리·방 권한·스냅샷 v2 계약

### 수정하지 않는 공용 위험 파일

- `lib/types.ts`
- `lib/supabase.ts`
- 기존 `supabase/migrations/*.sql`

## 고정 데이터 계약

```ts
export type QuantumDebateChoice = 'A' | 'B' | 'SKIP'

export type QuantumProfilePreference = {
  schemaVersion: 2
  mbti: string | null
  conversationEnergy: 'listener' | 'balanced' | 'speaker'
  planStyle: 'planner' | 'balanced' | 'spontaneous'
  interests: string[]
  favoriteMusic: string
  debateAnswers: Array<{
    questionId: string
    choice: QuantumDebateChoice
    shareOnCard: boolean
  }>
  questionBankVersion: string
  updatedAt: string | null
}

export type QuantumMeetingMoment = {
  occurrenceKey: string
  mood: 'calm' | 'bright' | 'curious' | 'energetic'
  expectation: 'conversation' | 'activity' | 'new_people' | 'easy_company'
  activityChoice: string
}

export type QuantumPublicParticipantPreview = {
  seatLabel: string
  gender: 'male' | 'female'
  profilePreference: {
    mbti: string | null
    conversationEnergy: QuantumProfilePreference['conversationEnergy']
    planStyle: QuantumProfilePreference['planStyle']
    interests: string[]
    favoriteMusic: string
    debateAnswers: Array<{ questionId: string; choice: QuantumDebateChoice }>
  } | null
  meetingMoment: Omit<QuantumMeetingMoment, 'occurrenceKey'> | null
}

export type QuantumSecretRoleKey =
  | 'explorer'
  | 'reactor'
  | 'observer'
  | 'bridge'
  | 'pace_maker'
```

공개 참가자 응답에는 `user_id`, 실명, 사진, 학과, 연락처, SNS, 외모 점수, `secret_role`, 내부 스냅샷 ID를 넣지 않는다.

역할 변경은 5명 방의 역할 중복을 만들지 않도록 요청자와 서버가 고른 다른 참가자의 역할을 한 번만 **비공개 원자 교환**한다. 다른 참가자와 교환 대상은 어느 클라이언트에도 노출하지 않는다.

---

### Task 1: 취소 계약 고정과 매칭 선택 화면 복귀

**Files:**
- Modify: `tests/matching/quantum-event-participation.test.ts`
- Modify: `app/api/match/event-participation/route.ts`
- Modify: `components/matching/QuantumEventWheel.tsx`

- [ ] **Step 1: 취소 RED 테스트 작성**

아래 계약을 테스트에 추가한다.

```ts
assert.match(route, /cancelled:\s*Boolean\(data\?\.cancelled\)/)
assert.match(route, /remaining_participation/)
assert.match(wheel, /router\.replace\('\/match\?choose=another'\)/)
assert.match(wheel, /if \(cancelling\) return/)
assert.match(wheel, /취소 처리 중/)
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-event-participation.test.js
```

Expected: 현재 API가 Boolean RPC 결과와 남은 참여를 반환하지 않고 UI가 `/match?choose=another`로 이동하지 않아 FAIL.

- [ ] **Step 3: API 취소 응답 구현**

`cancel_my_quantum_event_participation` RPC 결과를 다음 형태로 정규화한다.

```ts
type CancelParticipationResult = {
  cancelled: boolean
  remaining_participation: unknown | null
}

return NextResponse.json({
  cancelled: Boolean(data?.cancelled),
  participation: data?.remaining_participation ?? null,
})
```

RPC 오류는 현재 상태를 성공으로 위장하지 말고 500과 일반화한 오류 코드 `cancel_failed`를 반환한다.

- [ ] **Step 4: UI 취소 상태와 이동 구현**

확인창 이전부터 이중 클릭을 막을 수 있도록 취소 함수 첫 줄에서 `cancelling`을 확인한다. 성공 후 응답의 `participation`이 있으면 해당 현황을 표시하고, 없으면 성공 토스트를 보여준 뒤 `router.replace('/match?choose=another')`와 `router.refresh()`를 실행한다.

- [ ] **Step 5: GREEN 및 회귀 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-event-participation.test.js
npm run typecheck
```

Expected: 모두 PASS.

- [ ] **Step 6: 작업 단위 커밋**

```powershell
git add -- app/api/match/event-participation/route.ts components/matching/QuantumEventWheel.tsx tests/matching/quantum-event-participation.test.ts
git commit -m "fix(matching): return to discovery after cancellation"
```

---

### Task 2: 평소 취향·오늘 카드·논쟁 질문 순수 계약

**Files:**
- Create: `lib/matching/quantum-profile-preferences.ts`
- Create: `tests/matching/quantum-profile-preferences.test.ts`
- Create: `tests/matching/quantum-debate-card.test.ts`

- [ ] **Step 1: 평소 취향 RED 테스트 작성**

테스트는 다음을 확인한다.

```ts
assert.deepEqual(validateQuantumProfilePreference(validPreference), { ok: true })
assert.equal(validateQuantumProfilePreference({ ...validPreference, interests: ['한 개'] }).ok, false)
assert.equal(validateQuantumMeetingMoment(validMoment).ok, true)
assert.equal(validateQuantumMeetingMoment({ ...validMoment, activityChoice: '@danger' }).ok, false)
assert.equal(toPublicParticipantPreview(privateInput).secretRole, undefined)
assert.equal(toPublicParticipantPreview(privateInput).userId, undefined)
```

- [ ] **Step 2: 논쟁 질문 RED 테스트 작성**

```ts
assert.deepEqual(normalizeDebateChoice('A'), 'A')
assert.deepEqual(normalizeDebateChoice('B'), 'B')
assert.deepEqual(normalizeDebateChoice('SKIP'), 'SKIP')
assert.equal(pickSharedDebateAnswers(answers).length <= 3, true)
assert.equal(pickSharedDebateAnswers(answers).every((answer) => answer.shareOnCard), true)
assert.equal(JSON.stringify(buildMatchingSignals(validPreference)).includes('debate'), false)
```

- [ ] **Step 3: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-profile-preferences.test.js .tmp/matching-tests/tests/matching/quantum-debate-card.test.js
```

Expected: 새 모듈이 없어 FAIL.

- [ ] **Step 4: 최소 순수 구현**

`quantum-profile-preferences.ts`에 고정 데이터 계약 타입과 아래 공개 함수를 구현한다.

```ts
export function createEmptyQuantumProfilePreference(): QuantumProfilePreference
export function validateQuantumProfilePreference(value: unknown): QuantumPreferenceValidation
export function validateQuantumMeetingMoment(value: unknown): QuantumPreferenceValidation
export function normalizeDebateChoice(value: unknown): QuantumDebateChoice | null
export function pickSharedDebateAnswers(answers: QuantumDebateAnswer[]): QuantumDebateAnswer[]
export function toPublicParticipantPreview(value: unknown): QuantumPublicParticipantPreview
export function buildMatchingSignals(value: QuantumProfilePreference): {
  conversationEnergy: QuantumProfilePreference['conversationEnergy']
  planStyle: QuantumProfilePreference['planStyle']
}
```

서버와 프론트가 같은 금칙어 목록을 사용하도록 이메일, 전화번호, URL, 카카오·인스타·텔레그램·SNS 핸들 패턴을 이 모듈의 `containsBlockedPersonalContact` 하나로 통합한다.

- [ ] **Step 5: GREEN 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-profile-preferences.test.js .tmp/matching-tests/tests/matching/quantum-debate-card.test.js
```

Expected: PASS.

- [ ] **Step 6: 작업 단위 커밋**

```powershell
git add -- lib/matching/quantum-profile-preferences.ts tests/matching/quantum-profile-preferences.test.ts tests/matching/quantum-debate-card.test.ts
git commit -m "feat(profile): split reusable preferences from meeting card"
```

---

### Task 3: 비밀 역할 순수 계약과 보안 후속 마이그레이션

**Files:**
- Create: `lib/matching/quantum-secret-roles.ts`
- Create: `tests/matching/quantum-secret-role.test.ts`
- Create: `tests/matching/quantum-preference-secret-role-migration.test.ts`
- Create: `supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql`

- [ ] **Step 1: 역할·SQL RED 테스트 작성**

```ts
assert.deepEqual(new Set(SECRET_ROLE_KEYS).size, 5)
assert.equal(parseMySecretRole(publicParticipantPayload), null)
assert.equal(parseMySecretRole({ role: 'explorer', mission: '열린 질문 2번' })?.role, 'explorer')
```

SQL 테스트는 아래 문자열과 부재를 함께 검증한다.

```ts
assert.match(sql, /enable row level security/i)
assert.match(sql, /revoke all on table .*quantum_event_secret_role_assignments.* from public, anon, authenticated/is)
assert.match(sql, /get_my_quantum_event_secret_role/i)
assert.match(sql, /change_my_quantum_event_secret_role/i)
assert.match(sql, /submit_my_quantum_event_role_guesses/i)
assert.match(sql, /for update/i)
assert.match(sql, /remaining_participation/i)
assert.doesNotMatch(extractFunction(sql, 'get_quantum_event_room_participants'), /secret_role|role_key/i)
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-secret-role.test.js .tmp/matching-tests/tests/matching/quantum-preference-secret-role-migration.test.js
```

Expected: 모듈과 마이그레이션이 없어 FAIL.

- [ ] **Step 3: 역할 표시 계약 구현**

역할 이름, 공통 안전 기준, 활동별 미션을 상수로 만들고 외부 입력은 다섯 키 외에는 거절한다. 공개 참가자 파서에는 역할 필드를 정의하지 않는다.

- [ ] **Step 4: 신규 테이블과 기본 거부 RLS 구현**

마이그레이션에 다음 저장소를 만든다.

```sql
private.quantum_profile_preferences
private.quantum_event_meeting_moment_drafts
private.quantum_event_secret_role_assignments
private.quantum_event_role_guesses
```

모든 테이블에 RLS를 켜고 직접 브라우저 정책은 만들지 않는다. 테이블 권한을 `public`, `anon`, `authenticated`에서 회수하고 제한 RPC만 `authenticated`에 허용한다. 모든 `SECURITY DEFINER` 함수는 `SET search_path = ''`와 `auth.uid()` 검증을 사용한다.

- [ ] **Step 5: 취향·오늘 카드·안전 스냅샷 RPC 구현**

다음 함수 계약을 구현한다.

```sql
public.get_my_quantum_profile_preference() returns jsonb
public.save_my_quantum_profile_preference(p_payload jsonb, p_question_bank_version integer) returns jsonb
public.save_my_quantum_event_meeting_moment(p_event_key text, p_occurrence_key text, p_payload jsonb) returns jsonb
```

공개 스냅샷은 `profile_preference`와 `meeting_moment`만 가진 v2 JSON으로 생성한다. 이미 생성된 스냅샷은 평소 취향 수정으로 갱신하지 않는다.

- [ ] **Step 6: 역할 배정·1회 교환·맞히기 RPC 구현**

방 편성 행을 `FOR UPDATE`로 잠그고 5명 방은 다섯 역할을 중복 없이 배정한다. 변경 요청은 `changed_once=false`인 요청자와 다른 활성 참가자 한 명의 역할을 원자 교환하고 요청자의 `changed_once`만 true로 바꾼다. 역할 조회는 본인 행만 반환한다. 역할 맞히기는 종료 전 거절하고 정답 공개 시각 이전에는 역할 정답을 반환하지 않는다.

- [ ] **Step 7: 취소 원자 정리 구현**

`cancel_my_quantum_event_participation()`을 후속 교체해 현재 참여, 좌석 예약, 발신·수신 대기 초대, 공개 스냅샷, 오늘 카드, 비밀 역할을 한 트랜잭션에서 무효화한다. 결과는 다음 JSON이다.

```json
{
  "cancelled": true,
  "remaining_participation": null
}
```

이미 취소된 요청은 `cancelled:false`로 반환하고 취소 행을 활성 조회에 복원하지 않는다.

- [ ] **Step 8: GREEN 및 기존 SQL 회귀 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-secret-role.test.js .tmp/matching-tests/tests/matching/quantum-preference-secret-role-migration.test.js .tmp/matching-tests/tests/matching/quantum-event-room-backend.test.js
```

Expected: PASS. 원격 Supabase에는 적용하지 않는다.

- [ ] **Step 9: 위험 변경 단독 커밋**

```powershell
git add -- lib/matching/quantum-secret-roles.ts tests/matching/quantum-secret-role.test.ts tests/matching/quantum-preference-secret-role-migration.test.ts supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql
git commit -m "feat(matching): add private event role contracts"
```

---

### Task 4: 인증된 API 경계 구현

**Files:**
- Create: `app/api/profile/quantum-preferences/route.ts`
- Create: `app/api/match/event-meeting-moment/route.ts`
- Create: `app/api/match/event-secret-role/route.ts`
- Create: `app/api/match/event-role-guesses/route.ts`
- Create: `tests/matching/quantum-preference-secret-role-api.test.ts`
- Modify: `app/api/match/event-participation/route.ts`

- [ ] **Step 1: API RED 테스트 작성**

각 라우트가 `getApiRequestAuth`, 인증 실패 401, JSON 유효성 400, RPC 오류의 일반화, 허용 키만 응답하는지 정적 계약으로 고정한다.

```ts
for (const source of sources) {
  assert.match(source, /getApiRequestAuth/)
  assert.match(source, /status:\s*401/)
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/)
}
assert.doesNotMatch(secretRoleRoute, /target_user_id/)
assert.doesNotMatch(roomResponseParser, /meetup_role|secret_role/)
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-preference-secret-role-api.test.js
```

Expected: 새 라우트가 없어 FAIL.

- [ ] **Step 3: 취향·오늘 카드 API 구현**

평소 취향 `GET/PUT`, 오늘 카드 `GET/PUT`를 구현한다. 본문은 Task 2 순수 검증을 통과한 값만 RPC로 보내고, 빈 로딩 실패를 성공으로 덮어쓰지 않는다.

- [ ] **Step 4: 본인 역할·역할 맞히기 API 구현**

본인 역할 `GET`, 1회 변경 `POST`, 역할 추측 상태 `GET`, 추측 제출 `POST`를 구현한다. 역할 API에는 타인 사용자 ID를 받는 입력을 만들지 않는다. 역할 추측은 서버가 반환한 익명 좌석 키만 허용한다.

- [ ] **Step 5: 참여 API 준비 경계 연결**

참여 신청은 평소 취향과 오늘 카드가 준비됐는지 서버 RPC 결과로 확인한다. 클라이언트가 임의로 전달한 공개 카드나 역할 값을 신뢰하지 않는다.

- [ ] **Step 6: GREEN 및 인증 회귀 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-preference-secret-role-api.test.js .tmp/matching-tests/tests/auth/api-request-auth.test.js .tmp/matching-tests/tests/config/mobile-bearer-api-boundary.test.js
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: 작업 단위 커밋**

```powershell
git add -- app/api/profile/quantum-preferences/route.ts app/api/match/event-meeting-moment/route.ts app/api/match/event-secret-role/route.ts app/api/match/event-role-guesses/route.ts app/api/match/event-participation/route.ts tests/matching/quantum-preference-secret-role-api.test.ts
git commit -m "feat(api): expose private preference and role workflows"
```

---

### Task 5: 마이 취향 편집과 참여 직전 오늘 카드 UI

**Files:**
- Create: `components/profile/QuantumProfilePreferenceWizard.tsx`
- Create: `components/matching/QuantumMeetingMomentWizard.tsx`
- Modify: `app/profile/match-card/page.tsx`
- Modify: `components/matching/QuantumPrecardWizard.tsx`
- Modify: `components/matching/QuantumEventApplicationStatus.tsx`
- Modify: `tests/matching/quantum-precard.test.ts`

- [ ] **Step 1: UI RED 계약 작성**

```ts
assert.match(profilePage, /내 취향 카드/)
assert.match(profileWizard, /건너뛰기/)
assert.doesNotMatch(profileWizard, /오늘의 역할/)
assert.match(meetingMomentWizard, /오늘의 기분/)
assert.match(meetingMomentWizard, /기대하는 장면/)
assert.match(applicationStatus, /QuantumMeetingMomentWizard/)
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-precard.test.js
```

Expected: 역할 입력이 기존 카드에 남아 있고 오늘 카드 컴포넌트가 없어 FAIL.

- [ ] **Step 3: 마이 취향 편집기 구현**

MBTI는 선택, 대화 에너지·약속 스타일·관심사 3~5개·음악·논쟁 답변을 한 번 저장하게 만든다. 저장 중에는 버튼을 잠그고, 저장 성공 후 서버에서 다시 조회한 값을 화면에 반영한다. 연락처 금칙어 오류는 어떤 입력을 고쳐야 하는지 짧게 표시한다.

- [ ] **Step 4: 오늘 카드 30초 흐름 구현**

기분, 기대 장면, 활동별 선택을 세 개의 한 화면 선택 묶음으로 제공한다. 평소 취향이 준비된 재참여자는 이 화면만 거치고, 미준비자는 필요한 평소 취향 단계로 이동한다.

- [ ] **Step 5: 활동별 색상 구현**

Quantum Peach Air 바탕을 유지하면서 아이콘과 오늘 카드 띠에만 활동별 보조색을 적용한다. 카드 반경은 8px 이하, 색상 외 아이콘·문구로 상태를 중복 전달한다.

- [ ] **Step 6: GREEN 및 타입 검사**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-precard.test.js
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: 작업 단위 커밋**

```powershell
git add -- components/profile/QuantumProfilePreferenceWizard.tsx components/matching/QuantumMeetingMomentWizard.tsx app/profile/match-card/page.tsx components/matching/QuantumPrecardWizard.tsx components/matching/QuantumEventApplicationStatus.tsx tests/matching/quantum-precard.test.ts
git commit -m "feat(ui): separate saved tastes from today's meeting card"
```

---

### Task 6: 익명 참가자 카드·본인 봉인 역할·종료 후 맞히기 UI

**Files:**
- Create: `components/matching/QuantumSecretRoleCard.tsx`
- Create: `components/matching/QuantumRoleGuessing.tsx`
- Modify: `components/matching/QuantumEventRoomLobby.tsx`
- Modify: `lib/matching/quantum-event-rooms.ts`
- Modify: `app/dev/event-room-lobby-preview/page.tsx`
- Modify: `tests/matching/quantum-event-room-contract.test.ts`

- [ ] **Step 1: 공개 정보·역할 UI RED 테스트 작성**

```ts
assert.doesNotMatch(roomParser, /meetup_role/)
assert.doesNotMatch(lobby, /mapMeetupRole/)
assert.match(lobby, /참가자를 누르면 평소 취향과 오늘 카드를 볼 수 있어요/)
assert.match(secretRoleCard, /나만 볼 수 있는 역할/)
assert.match(secretRoleCard, /한 번 바꾸기/)
assert.match(roleGuessing, /만남이 끝난 뒤 열려요/)
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-event-room-contract.test.js
```

Expected: 기존 공개 카드가 `meetup_role`을 파싱·표시해 FAIL.

- [ ] **Step 3: 익명 좌석 카드 구현**

좌석에는 `참여자 1`, 성별, 카드 준비 상태만 보인다. 클릭 시 바텀시트 또는 대화상자에 MBTI 선택값, 대화 에너지, 약속 스타일, 관심사, 음악, 공개 논쟁 답변 최대 3개, 오늘 카드를 표시한다. 값이 없으면 추정값을 만들지 않고 `카드 준비 중`으로 표시한다.

- [ ] **Step 4: 본인 봉인 역할 카드 구현**

짙은 잉크색과 금색 봉인 아이콘을 사용하고, 처음에는 역할 제목을 가린다. 본인 조회 성공 후 열 수 있고 미션·안전 기준·활동별 문구를 표시한다. 시작 전이고 변경 전일 때만 `한 번 바꾸기`를 제공한다.

- [ ] **Step 5: 종료 후 역할 맞히기 구현**

종료 전에는 잠금 상태를 표시한다. 종료 후 자기 자신을 제외한 익명 좌석마다 역할 하나를 선택하고 제출한다. 제출 전에는 정답을 표시하지 않고, 공개 가능 상태에서만 결과와 정답을 보여준다.

- [ ] **Step 6: 개발 미리보기 fixture 구현**

실제 계정이나 개인정보 없이 5개 익명 좌석, 준비·미준비 카드, 본인 역할, 종료 전·후 맞히기 상태를 쿼리 파라미터로 전환할 수 있게 한다.

- [ ] **Step 7: GREEN 및 타입 검사**

Run:

```powershell
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/quantum-event-room-contract.test.js
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: 작업 단위 커밋**

```powershell
git add -- components/matching/QuantumSecretRoleCard.tsx components/matching/QuantumRoleGuessing.tsx components/matching/QuantumEventRoomLobby.tsx lib/matching/quantum-event-rooms.ts app/dev/event-room-lobby-preview/page.tsx tests/matching/quantum-event-room-contract.test.ts
git commit -m "feat(matching): add anonymous cards and sealed roles"
```

---

### Task 7: 통합·보안·반응형 검증과 완료 문서화

**Files:**
- Modify: `tests/matching/quantum-event-room-backend.test.ts`
- Modify: `docs/coordination/2026-08-14-quantum-release-verification-matrix.md` 또는 현재 검증 매트릭스 파일

- [ ] **Step 1: 전체 자동 검증 실행**

Run:

```powershell
npm run test:matching
npm run test:profile
npm run typecheck
```

Expected: 0 failures, 0 type errors.

- [ ] **Step 2: 마이그레이션 보안 감사**

정적 테스트와 코드리뷰로 다음을 확인한다.

```text
직접 테이블 쓰기 권한 0
타인 역할 조회 경로 0
공개 카드의 사용자 ID·사진·실명·학과·연락처·외모점수·역할 0
모든 SECURITY DEFINER 함수의 auth.uid 검증과 빈 search_path
취소·방 이동의 역할·스냅샷·예약 원자 정리
```

- [ ] **Step 3: 로컬 2계정 API E2E**

개발용 계정 또는 격리 fixture로 다음 순서를 실행하고 응답 키를 기록한다.

```text
계정 A 평소 취향 저장 -> 재조회 동일
계정 A/B 같은 방 참여 -> 서로 안전 카드 조회
다른 방 계정의 카드 조회 -> 거절 또는 빈 결과
계정 A 취향 수정 -> 기존 방 스냅샷 불변
```

실제 계정을 만들 수 없거나 원격 마이그레이션이 미적용이면 `미검증`으로 남기고 로컬 mock을 실제 E2E로 표현하지 않는다.

- [ ] **Step 4: 로컬 5계정 역할 E2E**

```text
5명 역할 키 unique=5
각 계정 자기 역할만 조회
타인 역할 공격 요청 거절
한 계정 1회 역할 교환 성공, 2회 거절
취소 계정 역할 무효화
종료 전 추측 차단, 종료 후 같은 방만 제출
```

- [ ] **Step 5: 브라우저 모바일 QA**

390x844에서 실제 클릭으로 확인한다.

```text
취소 -> 성공 알림 -> 전체 매칭 선택
취향 저장 -> 재진입 값 유지
재참여 -> 오늘 카드만 요청
익명 좌석 -> 카드 바텀시트
봉인 역할 -> 열기 -> 한 번 변경
가로 넘침, 버튼 겹침, 잘린 긴 단어 0
```

문제가 있으면 수정하고 동일 경로를 다시 확인한다.

- [ ] **Step 6: 브라우저 데스크톱 QA**

1440x900에서 카드 위계, 주요 행동, 대화상자 포커스, 닫기, 취소 복귀를 확인한다. 변경 화면의 스크린샷을 남긴다.

- [ ] **Step 7: 검증 매트릭스 기록**

설계의 `CANCEL-01`부터 `E2E-02`까지 상태를 `PASS`, `FAIL`, `BLOCKED`, `NOT RUN` 중 하나로 기록하고, 실행 명령·화면·응답 근거와 로컬/원격 구분을 함께 적는다.

- [ ] **Step 8: 최종 리뷰와 통합 커밋 후보 확인**

```powershell
git status --short
git diff --check
git diff --stat
```

기존 676개 변경과 이번 파일을 구분한 목록을 작성한다. 사용자 승인 전에는 원격 Supabase 적용, Vercel 배포, main push를 하지 않는다.

---

## 구현 순서와 리뷰 소유권

1. Task 1~2: 기능 구현 담당이 RED/GREEN 수행
2. Task 3: DB·RLS 담당이 마이그레이션 작성, 별도 보안 리뷰 필수
3. Task 4: API 담당이 인증·유효성 구현, DB 담당이 RPC 이름·응답 계약 재확인
4. Task 5~6: 프론트 담당이 구현, 독립 검증 담당이 실제 클릭·반응형 확인
5. Task 7: 구현하지 않은 검증 담당이 회귀·보안·E2E 최종 판정

같은 파일을 두 작업자가 동시에 수정하지 않는다. DB/API/공개 카드 계약은 한 작업이 GREEN이 된 뒤 다음 작업으로 넘긴다.

## 완료 판단

로컬 자동 테스트와 화면만 통과하면 `로컬 구현 완료`다. 원격 Supabase 마이그레이션, 실제 2계정·5계정, Vercel, Android가 검증되지 않은 상태는 `운영 완료`로 말하지 않는다.

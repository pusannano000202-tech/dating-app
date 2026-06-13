# Phase 1 Group Create Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/group/create/page.tsx`의 화면과 동작은 유지하면서, 1,137줄짜리 대형 파일을 역할별 컴포넌트와 유틸로 분리한다.

**Architecture:** Page file remains the route/container. It owns data loading, API calls, and mutation handlers. New files under `components/matching/group-create/` own presentational UI and small pure status helpers. No Supabase schema, API contract, auth, or matching engine behavior changes are allowed in this phase.

**Tech Stack:** Next.js 14 App Router, React 18 client components, TypeScript, Tailwind CSS, lucide-react.

---

## Manager Decision

2026-06-13 팀장방 결정:

- `group/create` 정리는 기능 변경이 아니라 코드 구조 정리다.
- 사용자 화면은 현재와 최대한 동일하게 유지한다.
- `QueueRadarCard` 디자인은 이번 Phase에서 재디자인하지 않는다.
- DB/migration 작업은 이 Phase에 섞지 않는다.
- 이메일 OTP, 4개 가중치, 무료 베타, 사용자 직접 카드 뽑기 정책은 되돌리지 않는다.

## Non-Goals

- `supabase/migrations/` 수정 금지.
- `lib/types.ts` 수정 금지.
- `docs/engineering/INTERFACE_CONTRACT.md` 수정 금지.
- `app/api/groups/route.ts`, `app/api/match-pool/enter/route.ts` 동작 변경 금지.
- `QueueRadarCard`의 시각 디자인 변경 금지.
- 로그인/인증 방식 변경 금지.

## Current Problem

`app/group/create/page.tsx` 한 파일에 아래 책임이 섞여 있다.

- 그룹/멤버/초대 타입
- dev preview mock 데이터
- 큐 통계 로딩
- 그룹 로딩
- 초대 생성
- 큐 진입/취소
- 무료 베타 참여 확인
- 친구 목록 UI
- 그룹 멤버 UI
- 위험 액션 UI
- 큐 레이더 UI 트리거

이 상태에서는 작은 디자인 수정도 API, dev mock, 무료 베타, 큐 상태와 같이 얽힌다.

## Target File Structure

Create:

- `components/matching/group-create/types.ts`
  - Owns local UI/API types currently declared inside `app/group/create/page.tsx`.
  - Exports `GroupStatus`, `GroupRole`, `FriendGroupStatus`, `MatchStepState`, `GroupRecord`, `GroupMemberRecord`, `GroupInviteRecord`, `FriendSummary`, `GroupState`, `QueueVisualState`, `MyDeposit`, `DepositSummaryRow`, `DepositSummary`.

- `components/matching/group-create/dev-state.ts`
  - Owns `EMPTY_STATE`, `DEV_GROUP_STATE`, `DEV_QUEUE_VISUAL`, `QUEUE_VISUAL_DEFAULT`, `DEV_DEPOSIT_SUMMARY`.
  - Imports types from `./types`.

- `components/matching/group-create/status.ts`
  - Owns pure labels and status helpers that do not call React hooks.
  - Exports `getQueueStatusText`, `getMemberStatusLabel`, `getFriendMatchState`, `getFriendMatchLabel`.

- `components/matching/group-create/GroupHeader.tsx`
  - Owns the top `GROUP MATCH` header and notification bell area.

- `components/matching/group-create/GroupMemberStatusPanel.tsx`
  - Owns group member count, member cards, readiness status, and empty slot card.

- `components/matching/group-create/InviteFriendPanel.tsx`
  - Owns phone input, invite send button, invite link copy button, and pending invite list.

- `components/matching/group-create/FriendListPanel.tsx`
  - Owns friend list cards and invite buttons.

- `components/matching/group-create/FreeBetaQueuePanel.tsx`
  - Owns free beta participation status, queue entry button, disabled reason text, and basic queue action copy.

- `components/matching/group-create/GroupDangerZone.tsx`
  - Owns leader transfer, leave group, and disband group actions currently rendered at the bottom of the page.

Modify:

- `app/group/create/page.tsx`
  - Keep route-level data loading and mutation handlers here.
  - Import types/dev constants/helpers/components from `components/matching/group-create/*`.
  - Target: reduce the page file to roughly 450-650 lines.

## Component Interfaces

Use these prop shapes unless the existing JSX requires a small adjustment.

```ts
// components/matching/group-create/GroupMemberStatusPanel.tsx
type GroupMemberStatusPanelProps = {
  members: GroupMemberRecord[]
  currentUserId: string | null
  capacity: number
  groupStats: Array<{ label: string; value: string }>
  memberMatchReadyByUserId: Map<string, boolean>
}
```

```ts
// components/matching/group-create/InviteFriendPanel.tsx
type InviteFriendPanelProps = {
  phone: string
  copied: boolean
  saving: boolean
  pendingInvites: GroupInviteRecord[]
  onPhoneChange: (value: string) => void
  onInviteByPhone: () => void
  onCopyInviteLink: () => void
}
```

```ts
// components/matching/group-create/FriendListPanel.tsx
type FriendListPanelProps = {
  friends: FriendSummary[]
  saving: boolean
  openSlots: number
  memberMatchReadyByUserId: Map<string, boolean>
  onInviteFriend: (friend: FriendSummary) => void
}
```

```ts
// components/matching/group-create/FreeBetaQueuePanel.tsx
type FreeBetaQueuePanelProps = {
  saving: boolean
  canEnterQueue: boolean
  membersLength: number
  needsSetupCount: number
  myDepositPaid: boolean
  depositSummary: DepositSummary | null
  onEnterQueue: () => void
}
```

```ts
// components/matching/group-create/GroupDangerZone.tsx
type GroupDangerZoneProps = {
  isLeader: boolean
  saving: boolean
  showTransferPanel: boolean
  members: GroupMemberRecord[]
  currentUserId: string | null
  onToggleTransferPanel: () => void
  onTransferLeadership: (userId: string) => void
  onLeaveGroup: () => void
  onDisbandGroup: () => void
}
```

## Task 1: Move Types and Dev State

**Files:**

- Create: `components/matching/group-create/types.ts`
- Create: `components/matching/group-create/dev-state.ts`
- Modify: `app/group/create/page.tsx`

- [ ] **Step 1: Create `types.ts`**

Move only type/interface declarations from `app/group/create/page.tsx`. Do not move runtime logic.

- [ ] **Step 2: Create `dev-state.ts`**

Move `EMPTY_STATE`, `DEV_GROUP_STATE`, `DEV_QUEUE_VISUAL`, `QUEUE_VISUAL_DEFAULT`, `DEV_DEPOSIT_SUMMARY`.

- [ ] **Step 3: Update page imports**

`app/group/create/page.tsx` should import types and constants from the new files.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
```

Expected: exit 0.

## Task 2: Extract Pure Status Helpers

**Files:**

- Create: `components/matching/group-create/status.ts`
- Modify: `app/group/create/page.tsx`

- [ ] **Step 1: Move helper logic**

Move these pure helpers out of the page:

- `memberStatusLabel`
- `getQueueStatusText`
- `getFriendMatchState`
- `getFriendMatchLabel`

The exported functions should receive all required values as arguments. They must not read React state directly.

- [ ] **Step 2: Keep page-owned derived values**

Keep `memberMatchReadyByUserId`, `readyMemberCount`, `needsSetupCount`, `canEnterQueue`, `canCancelQueue`, and `groupStats` in the page for now.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both exit 0.

## Task 3: Extract Header and Member Panel

**Files:**

- Create: `components/matching/group-create/GroupHeader.tsx`
- Create: `components/matching/group-create/GroupMemberStatusPanel.tsx`
- Modify: `app/group/create/page.tsx`

- [ ] **Step 1: Extract header JSX**

Move only the top title/header area into `GroupHeader`.

- [ ] **Step 2: Extract member status JSX**

Move the member count, member cards, and empty slot card into `GroupMemberStatusPanel`.

- [ ] **Step 3: Keep behavior unchanged**

No API calls, `useEffect`, or mutation handlers should move in this task.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both exit 0.

## Task 4: Extract Invite and Friend List Panels

**Files:**

- Create: `components/matching/group-create/InviteFriendPanel.tsx`
- Create: `components/matching/group-create/FriendListPanel.tsx`
- Modify: `app/group/create/page.tsx`

- [ ] **Step 1: Extract invite panel**

Move phone input, send button, invite link copy button, and pending invite list into `InviteFriendPanel`.

- [ ] **Step 2: Extract friend list**

Move friend list rendering into `FriendListPanel`.

- [ ] **Step 3: Keep handlers in page**

Do not move `inviteByPhone`, `inviteFriend`, `copyInviteLink`, or `createInvite` yet. Pass them down as props.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both exit 0.

## Task 5: Extract Free Beta Queue and Danger Zone Panels

**Files:**

- Create: `components/matching/group-create/FreeBetaQueuePanel.tsx`
- Create: `components/matching/group-create/GroupDangerZone.tsx`
- Modify: `app/group/create/page.tsx`

- [ ] **Step 1: Extract free beta queue panel**

Move free beta participation status, queue entry button, disabled reason text, and confirmation copy into `FreeBetaQueuePanel`.

- [ ] **Step 2: Keep `QueueRadarCard` usage in page**

When `inQueue` is true, keep rendering `QueueRadarCard` from the page. This keeps the completed queue state obvious while the forming-state panels are extracted.

- [ ] **Step 3: Extract danger zone**

Move leader transfer, leave group, and disband group action UI into `GroupDangerZone`.

- [ ] **Step 4: Keep mutation handlers in page**

Do not move `enterQueue`, `cancelQueue`, transfer, leave, or disband handlers in this phase. Pass them down as props.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both exit 0.

## Task 6: Final Cleanup and Visual Verification

**Files:**

- Modify: `app/group/create/page.tsx`
- Modify: new files under `components/matching/group-create/`
- Update if needed: `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Remove unused imports**

Remove unused lucide icons and unused helper imports from `app/group/create/page.tsx`.

- [ ] **Step 2: Confirm page responsibility**

After cleanup, `app/group/create/page.tsx` should mainly contain:

- state hooks
- derived state
- `useEffect` data loading
- API/mutation handlers
- high-level JSX composition

- [ ] **Step 3: Run command verification**

Run:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
```

Expected: all exit 0.

- [ ] **Step 4: Browser verify**

Use local server `http://localhost:3003`.

Check:

- `/group/create`
  - no login bounce
  - no runtime error
  - no broken Korean text
  - group preparing/forming UI appears

- `/group/create?from=home-queue`
  - group/friend cards appear
  - `이번 주 매칭 큐에 들어가기` is clickable when enabled
  - after clicking, `매칭 큐 진입 완료` appears
  - `홈으로 나가기`, `매칭 결과 확인하기`, `큐에서 빠지기` appear

- `/match/start`
  - `그룹 만들고 매칭 찾기` still links into `/group/create`

- [ ] **Step 5: Report**

Worker report must include:

- files created
- files modified
- current line count of `app/group/create/page.tsx`
- command verification results
- browser verification results
- any behavior intentionally left unchanged

## Acceptance Criteria

- `app/group/create/page.tsx` is meaningfully smaller and easier to scan.
- No user-facing flow is intentionally changed.
- No DB/API/auth contract is changed.
- `QueueRadarCard` still renders after queue entry.
- `npm run typecheck`, `npm run lint`, `npm run test:config`, and `npm run test:matching` pass.
- Browser verification proves `/group/create`, `/group/create?from=home-queue`, and `/match/start` still work.

## Manager Gate After Phase 1

After the worker completes this phase, team manager should decide:

1. Whether `QueueRadarCard` needs its own subcomponent split.
2. Whether `group/create` should get a separate hook for API/mutation logic.
3. Whether `PreferenceSliders.tsx` and the root stray markdown file can be cleaned up next.
4. Whether to run fresh `npm run build` before creating a PR.

## Manager Verification Snapshot (2026-06-13)

Team manager polling/check after worker completion:

- Created `components/matching/group-create/` files:
  - `types.ts`
  - `dev-state.ts`
  - `status.ts`
  - `GroupHeader.tsx`
  - `GroupMemberStatusPanel.tsx`
  - `InviteFriendPanel.tsx`
  - `FriendListPanel.tsx`
  - `FreeBetaQueuePanel.tsx`
  - `GroupDangerZone.tsx`
- Modified `app/group/create/page.tsx`; current line count is 639.
- Added `tests/matching/group-create-status.test.ts`.
- Updated `tsconfig.matching-tests.json` so matching tests compile the new pure group-create status helpers.
- Command verification:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:config`: PASS, 22/22
  - `npm run test:matching`: PASS, 25/25
- Browser verification on `http://localhost:3003`:
  - `/group/create`: PASS, no login bounce, runtime error, or broken Korean text.
  - `/group/create?from=home-queue`: PASS, group/friend cards and queue entry button visible.
  - Queue entry click: PASS, `매칭 큐 진입 완료`, `홈으로 나가기`, `매칭 결과 확인하기`, `큐에서 빠지기` visible.
  - `/match/start`: PASS, `그룹 만들고 매칭 찾기` still visible.

Manager judgment: Phase 1 acceptance criteria are met, except fresh `npm run build` remains a manager gate before PR/merge.

# Phase 2 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 0/1 이후 남은 삭제 후보와 루트 산발 파일을 안전하게 정리해서, PR에 불필요한 코드/문서가 섞이지 않게 만든다.

**Architecture:** This is a cleanup-only phase. The worker must prove a file is unused before deleting it, preserve product/reference material by moving it to the right docs folder, and keep all user-facing app behavior unchanged. Cleanup decisions must be recorded in a small result report.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, PowerShell, Git, project docs under `docs/plans`, `docs/product`, `docs/archive`, and `docs/delete-candidates`.

---

## Manager Decision

2026-06-13 팀장방 결정:

- Phase 1 passed, including `npm run build`.
- Phase 2 is cleanup only.
- Do not touch Supabase migrations, auth behavior, matching engine scoring, or group-create UI behavior.
- Delete only files with code-search evidence that active app/test code does not import them.
- Move product reference documents out of the repo root instead of deleting them.

## Non-Goals

- No UI redesign.
- No DB/migration work.
- No auth/login changes.
- No matching algorithm changes.
- No `QueueRadarCard` split.
- No broad docs rewrite.
- No cleanup of old historical docs unless this plan explicitly names them.

## Current Evidence From Team Manager

Current search evidence:

- `components/profile/PreferenceSliders.tsx` has no active `app/`, `components/`, `lib/`, or `tests/` import. It is referenced only by docs/history and itself.
- `components/DestinyLogo.tsx` has no active app import. Current branding tests assert DestinyLogo should not be used.
- `app/debug/sanji/page.tsx` is a debug preview route. Active docs mark it as a launch-before-delete candidate.
- `components/SanjiCharacter.tsx` must not be deleted because `app/match/[id]/refund/page.tsx` imports it.
- Root file `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md` is referenced by `docs/plans/2026-06-02-pre-meeting-excitement-info-plan.md` as an internet debate question pool. It should be moved into product docs, not discarded.

## Target Cleanup Result

Expected after this phase:

- `components/profile/PreferenceSliders.tsx` removed if import search remains clean.
- `components/DestinyLogo.tsx` removed if import search remains clean.
- `app/debug/sanji/page.tsx` removed if active route/link search remains clean.
- `components/SanjiCharacter.tsx` preserved.
- Root internet debate markdown moved to `docs/product/matching/internet-debate-question-pool-2026-06-10.md`.
- `docs/plans/2026-06-02-pre-meeting-excitement-info-plan.md` updated to point to the moved debate question pool.
- Cleanup result recorded in `docs/plans/2026-06-13-phase-2-cleanup-result.md`.

## Safety Rules

- Use `rg` first, scoped to `app components lib tests docs`.
- On Windows, move/delete paths using PowerShell `-LiteralPath`.
- Do not delete Korean-named root files with wildcard patterns.
- Do not touch `components/SanjiCharacter.tsx`.
- Do not touch `supabase/migrations/`.
- Do not touch `lib/types.ts` or `docs/engineering/INTERFACE_CONTRACT.md`.
- If a candidate is still imported by active code, do not delete it. Add it to the result report as `보류`.

## Task 1: Pre-Cleanup Evidence Snapshot

**Files:**

- Read: `components/profile/PreferenceSliders.tsx`
- Read: `components/DestinyLogo.tsx`
- Read: `app/debug/sanji/page.tsx`
- Read: `components/SanjiCharacter.tsx`
- Read: `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md`
- Create later: `docs/plans/2026-06-13-phase-2-cleanup-result.md`

- [ ] **Step 1: Confirm current candidate references**

Run:

```powershell
rg "PreferenceSliders|DestinyLogo|SanjiCharacter|debug/sanji|/debug/sanji|대한민국을|뜨겁게|인터넷 논쟁" app components lib tests docs -n
```

Expected:

- `PreferenceSliders` appears only in docs/history and `components/profile/PreferenceSliders.tsx`.
- `DestinyLogo` appears only in docs/history, tests asserting it is absent, and `components/DestinyLogo.tsx`.
- `SanjiCharacter` appears in `components/SanjiCharacter.tsx`, `app/debug/sanji/page.tsx`, and `app/match/[id]/refund/page.tsx`.
- `debug/sanji` appears only in docs/history and `app/debug/sanji/page.tsx`.
- The root internet debate file is referenced by the pre-meeting excitement plan.

- [ ] **Step 2: If expected evidence differs, stop cleanup for that candidate**

If any active app import exists for `PreferenceSliders` or `DestinyLogo`, do not delete that file. Add a `보류` row to the cleanup result report.

If any active app link points to `/debug/sanji`, do not delete `app/debug/sanji/page.tsx`. Add a `보류` row.

## Task 2: Remove Unused Profile/Destiny Components

**Files:**

- Delete if clean: `components/profile/PreferenceSliders.tsx`
- Delete if clean: `components/DestinyLogo.tsx`

- [ ] **Step 1: Delete `PreferenceSliders.tsx` if search evidence is clean**

Run:

```powershell
Remove-Item -LiteralPath "components/profile/PreferenceSliders.tsx"
```

Expected: file no longer exists.

- [ ] **Step 2: Delete `DestinyLogo.tsx` if search evidence is clean**

Run:

```powershell
Remove-Item -LiteralPath "components/DestinyLogo.tsx"
```

Expected: file no longer exists.

- [ ] **Step 3: Re-run focused search**

Run:

```powershell
rg "PreferenceSliders|DestinyLogo" app components lib tests -n
```

Expected: no active app/component/lib/test references. It is okay if docs mention historical names in later doc-scoped searches.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npm run lint
npm run test:config
```

Expected: all exit 0.

## Task 3: Remove Debug Sanji Route Only

**Files:**

- Delete if clean: `app/debug/sanji/page.tsx`
- Preserve: `components/SanjiCharacter.tsx`

- [ ] **Step 1: Confirm no active links to debug route**

Run:

```powershell
rg "debug/sanji|/debug/sanji" app components lib tests -n
```

Expected: only `app/debug/sanji/page.tsx` appears. Docs may mention it, but active app code should not.

- [ ] **Step 2: Delete debug page**

Run:

```powershell
Remove-Item -LiteralPath "app/debug/sanji/page.tsx"
```

Expected: route page no longer exists.

- [ ] **Step 3: Leave `SanjiCharacter` in place**

Run:

```powershell
rg "SanjiCharacter" app components lib tests -n
```

Expected:

- `components/SanjiCharacter.tsx`
- `app/match/[id]/refund/page.tsx`

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both exit 0.

## Task 4: Move Internet Debate Question Pool Out of Root

**Files:**

- Move: `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md`
- Create by move: `docs/product/matching/internet-debate-question-pool-2026-06-10.md`
- Modify: `docs/plans/2026-06-02-pre-meeting-excitement-info-plan.md`

- [ ] **Step 1: Move the root markdown file with an ASCII filename**

Run:

```powershell
Move-Item -LiteralPath "대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md" -Destination "docs/product/matching/internet-debate-question-pool-2026-06-10.md"
```

Expected:

- Root file is gone.
- `docs/product/matching/internet-debate-question-pool-2026-06-10.md` exists.

- [ ] **Step 2: Update the pre-meeting plan reference**

In `docs/plans/2026-06-02-pre-meeting-excitement-info-plan.md`, replace the root filename reference with:

```markdown
`docs/product/matching/internet-debate-question-pool-2026-06-10.md`
```

Expected: the plan points to the new product-doc location.

- [ ] **Step 3: Verify root clutter is removed**

Run:

```powershell
Get-ChildItem -Force -File | Where-Object { $_.Name -like "*인터넷 논쟁*" -or $_.Name -like "*대한민국*" }
```

Expected: no output.

- [ ] **Step 4: Verify docs reference**

Run:

```powershell
rg "internet-debate-question-pool-2026-06-10|대한민국을 뜨겁게" docs -n
```

Expected:

- New ASCII path appears in the pre-meeting plan.
- Old Korean root filename does not remain as the active source path. Historical archive references are acceptable only if clearly historical.

## Task 5: Write Cleanup Result Report

**Files:**

- Create: `docs/plans/2026-06-13-phase-2-cleanup-result.md`
- Modify: `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Create the cleanup result report**

Create `docs/plans/2026-06-13-phase-2-cleanup-result.md` with this structure:

```markdown
# 2026-06-13 Phase 2 Cleanup Result

## Summary

- Removed unused components after import search.
- Removed debug-only route after active route/link search.
- Moved root internet debate question pool into product matching docs.

## Removed

| File | Reason | Evidence |
|---|---|---|
| `components/profile/PreferenceSliders.tsx` | Replaced by `PreferenceWeightInputs`; no active imports | `rg "PreferenceSliders" app components lib tests -n` |
| `components/DestinyLogo.tsx` | Old Destiny branding component; no active imports | `rg "DestinyLogo" app components lib tests -n` |
| `app/debug/sanji/page.tsx` | Debug-only preview route; no active links | `rg "debug/sanji|/debug/sanji" app components lib tests -n` |

## Moved

| From | To | Reason |
|---|---|---|
| `대한민국을 뜨겁게 달군 인터넷 논쟁 모음 (1).md` | `docs/product/matching/internet-debate-question-pool-2026-06-10.md` | Product question pool should not live at repo root |

## Preserved

| File | Reason |
|---|---|
| `components/SanjiCharacter.tsx` | Still used by `app/match/[id]/refund/page.tsx` |

## Verification

- `npm run typecheck`: PASS/FAIL
- `npm run lint`: PASS/FAIL
- `npm run test:config`: PASS/FAIL
- `npm run test:matching`: PASS/FAIL
- `npm run build`: PASS/FAIL or not run with reason

## Browser Check

- `/dev/preview`: PASS/FAIL
- `/group/create`: PASS/FAIL
- `/match/[id]/refund`: PASS/FAIL or not checked with reason
```

- [ ] **Step 2: Update current status**

In `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`, replace the cleanup candidate line under `Active Next Phase` with a Phase 2 cleanup snapshot after verification.

Use this wording if the cleanup passes:

```markdown
## Phase 2 Cleanup Snapshot (2026-06-13)

Reference: `docs/plans/2026-06-13-phase-2-cleanup-result.md`.

- Removed unused `PreferenceSliders` and `DestinyLogo` components after active import search.
- Removed debug-only `app/debug/sanji/page.tsx`; preserved `components/SanjiCharacter.tsx` because the refund page still uses it.
- Moved the internet debate question pool from the repo root into `docs/product/matching/`.
- Fresh verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`.
```

## Task 6: Final Verification and Browser Smoke

**Files:**

- Read/verify only: app and docs after cleanup

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Restart dev server if build breaks active dev chunks**

If `localhost:3003` returns 500 after build, restart the dev server:

```powershell
$old = Get-NetTCPConnection -LocalPort 3003 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($old) { Stop-Process -Id $old.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath "npm.cmd" -ArgumentList @("run","dev","--","-p","3003") -WorkingDirectory "C:\Users\82108\OneDrive\바탕 화면\데이팅앱만들기" -WindowStyle Hidden
```

- [ ] **Step 3: Browser smoke check**

Check:

- `http://localhost:3003/dev/preview`
  - expected: `디자인 확인 모드`
  - no runtime error
  - no broken Korean text

- `http://localhost:3003/group/create`
  - expected: `친구와 같이 매칭받기`
  - no login bounce
  - no runtime error

- `http://localhost:3003/match/start`
  - expected: `매칭찾기 준비 완료`
  - no login bounce
  - no runtime error

Optional if a valid match id is easy to access:

- `http://localhost:3003/match/[id]/refund`
  - expected: refund/free-beta page still renders Sanji character

- [ ] **Step 4: Worker final report**

Worker final report must include:

- removed files
- moved files
- preserved files
- command verification results
- browser smoke results
- any candidate that was not cleaned and why

## Acceptance Criteria

- Cleanup removes unused code without changing user-facing behavior.
- `components/SanjiCharacter.tsx` is preserved.
- Product reference content is moved out of repo root, not deleted.
- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md` reflects Phase 2 result.
- Full verification passes.
- `localhost:3003` is usable after build/restart.

## Manager Gate After Phase 2

After the worker completes Phase 2, team manager should decide:

1. Whether to commit the Phase 0-2 baseline.
2. Whether to open the DB worker for `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`.
3. Whether to create a smaller UI worker for `QueueRadarCard` subcomponent split.
4. Whether to ask 성준 for review of shared matching contracts.

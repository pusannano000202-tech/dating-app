# Phase 6 Sungjun GitHub Alignment Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task-by-task. This phase is an audit and planning phase only. Do not merge code.

**Goal:** Compare Sungjun's GitHub work against the current Phase 0-5 root app baseline and classify each useful item as adopt, adapt, hold, or reject.

**Architecture:** Treat the current root app as the source of truth. Inspect Sungjun's work in read-only worktrees, then produce a compatibility matrix that maps product ideas, DB schema, UI patterns, and risks into future phases.

**Tech Stack:** Git worktrees, Next.js 14 App Router, Supabase migrations/RLS, existing `docs/plans` phase workflow.

---

## Baseline

Current root app branch:

- Branch: `profile/post-worldcup-decisions-2026-05-21`
- Current HEAD before Phase 5 commit: `2f56be8 docs: add phase 5 category b meeting schema brief`
- Phase 5 staged files:
  - `docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-result.md`
  - `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`
  - `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`

Read-only comparison worktrees created for this audit:

- `C:\Users\82108\.codex\worktrees\dating-app\phase6-origin-main-20260614`
  - Source: `origin/main`
  - Commit: `c90813a Merge pull request #2 from sj4505/feat/supabase-chat`
- `C:\Users\82108\.codex\worktrees\dating-app\phase6-matching-group-engine-20260614`
  - Source: `origin/matching/group-engine`
  - Commit: `e9c6637 [matching] venues + match_meetings 테이블 마이그레이션 추가`

## Current Product Decisions That Must Win

- `/dev/preview` remains the local design-review entry and must not bounce users to login.
- MVP auth follows the current email verification/email OTP direction.
- Preference weights stay as 4 keys only:
  - `appearance`
  - `personality`
  - `height`
  - `body_type`
- Daily cards use a user-driven KST 16:00-20:00 draw window.
- Initial launch is free beta; user-facing deposit/refund/app-fee UX stays deferred.
- Current DB source of truth is the root `supabase/migrations/` chain, not `gwating-app/supabase/migrations/`.
- Phase 5 has already imported the useful `venues` / `match_meetings` schema through a current-branch migration. Do not copy Sungjun's original `20260516` filename.

## Source Findings

### `origin/matching/group-engine`

Useful source files:

- `docs/VENUE_DB_DESIGN.md`
- `supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql`

Assessment:

- Direction: aligned.
- Current status: already absorbed in Phase 5 through `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`.
- Remaining work: implement the meeting assignment path that creates `match_meetings` rows after a match is confirmed.

### `origin/main` / `gwating-app`

Useful source files:

- `gwating-app/docs/superpowers/specs/2026-06-07-booting-design.md`
- `gwating-app/app/page.tsx`
- `gwating-app/app/team/create/page.tsx`
- `gwating-app/app/match/result/page.tsx`
- `gwating-app/app/match/schedule/page.tsx`
- `gwating-app/app/match/qa/page.tsx`
- `gwating-app/app/match/chat/page.tsx`
- `gwating-app/app/admin/page.tsx`
- `gwating-app/lib/matching.ts`
- `gwating-app/lib/schedule.ts`
- `gwating-app/lib/qa.ts`
- `gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql`
- `gwating-app/supabase/migrations/20260608120100_seed_teams.sql`

Assessment:

- Direction: useful as product/design reference.
- Direct merge readiness: not safe.
- Reason: `gwating-app` is a separate nested Next app with its own package, routes, local mock fallback, DB schema, and RLS assumptions.

## Classification

| Area | Source | Decision | Reason |
|---|---|---|---|
| Venue and meeting schema | `origin/matching/group-engine` | Adopted | Already imported in Phase 5 with current timestamp, guards, indexes, RLS, and revoked direct anon/auth access. |
| Meeting assignment logic | `docs/VENUE_DB_DESIGN.md` | Adapt next | Product needs this next, but Phase 5 only created tables. Implement against root `matches`, `groups`, `profiles`, and `available_timeslots`. |
| Booting visual tone | `gwating-app/docs/superpowers/specs/2026-06-07-booting-design.md` | Adapt | Warm Booting tone matches current direction, but copy must be rewritten due nested-app context and mojibake text. |
| Gender balance rule | `gwating-app/lib/matching.ts` | Adapt after decision | `totalMale === totalFemale` is a clear rule, but it must map to root `groups` / `group_members`, not `teams`. |
| Schedule intersection | `gwating-app/lib/schedule.ts` | Adapt | Simple earliest-intersection idea is useful for meeting assignment, but root uses `available_timeslots` JSONB and KST semantics. |
| Q&A reveal flow | `gwating-app/app/match/qa/page.tsx`, `gwating-app/lib/qa.ts` | Adapt | Product idea fits daily reveal, but root already uses D-6..D-1 daily cards and KST 16:00-20:00 user draw. |
| Chat skeleton | `gwating-app/app/match/chat/page.tsx`, `chat_messages` migration | Hold | Useful later after confirmed match and access model. Do not copy current anon read/insert policies. |
| Admin dashboard ideas | `gwating-app/app/admin/page.tsx` | Adapt selectively | Current root already has `/admin`; use only UX ideas for score explanation and operator review. |
| `teams` / `team_members` schema | `gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql` | Reject direct import | Conflicts with root `groups` / `group_members` / `match_pool` / `matches`. |
| `chat_messages` schema | `gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql` | Hold and redesign | `match_id` is `text`, anon insert is too permissive, and membership-scoped RLS is missing. |
| Seed mock teams | `gwating-app/supabase/migrations/20260608120100_seed_teams.sql` | Reject | Seed data is prototype/mock and text is mojibake. |
| Nested app as new baseline | `gwating-app/` | Reject | Switching baseline would discard Phase 0-5 root app work and duplicate app structure. |
| Vercel/Supabase account state | README/env assumptions | Reject as source of truth | Deployment accounts can be reconnected, but DB schema/auth/storage must follow the root app migration baseline. |

## Hard Rules For Phase 6 Worker

Do not:

- commit or merge Sungjun branches
- copy `gwating-app/` into the root app
- modify production Supabase
- run `supabase link`, `db push`, or any `--linked` command
- modify z54, Phase 4 migration, or Phase 5 migration
- alter auth flow, matching engine, or DB schema during this audit
- stage Phase 6 docs into the Phase 5 commit

Allowed:

- inspect the two read-only worktrees
- inspect current root app files
- create one Phase 6 audit result document
- update `docs/plans/README.md` with the Phase 6 link if useful

## Task 1: Confirm Read-Only Sources

- [ ] Run:

```powershell
git worktree list
git log -1 --date=short --format="%h %ad %an %s" origin/main
git log -1 --date=short --format="%h %ad %an %s" origin/matching/group-engine
```

Expected:

- `origin/main` is `c90813a` or newer.
- `origin/matching/group-engine` is `e9c6637` or newer.
- Worktrees exist outside the repo under `C:\Users\82108\.codex\worktrees\dating-app\`.

## Task 2: Build Compatibility Matrix

- [ ] Create:

```text
docs/plans/2026-06-14-phase-6-sungjun-github-alignment-audit-result.md
```

- [ ] Include this table shape:

```markdown
| Candidate | Source file | Current root equivalent | Decision | Reason | Future phase |
|---|---|---|---|---|---|
```

- [ ] Fill at least these candidates:
  - venue schema
  - meeting assignment
  - gender balance
  - schedule intersection
  - Q&A/daily reveal
  - chat
  - admin dashboard
  - Booting visual tone
  - teams/team_members schema
  - chat_messages schema
  - mock seed teams
  - nested app baseline

## Task 3: DB Schema Conflict Review

- [ ] Compare:

```text
gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql
supabase/migrations/20260521_matching_create_core_tables.sql
supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql
```

- [ ] Result must explicitly state:
  - `teams` maps conceptually to root `groups`, not directly.
  - `team_members` maps conceptually to root `group_members`, not directly.
  - `chat_messages.match_id text` is not compatible with root `matches.id uuid` without redesign.
  - anon read/insert chat policies are not acceptable for production.
  - `venues` / `match_meetings` are already handled by Phase 5.

## Task 4: Product Flow Review

- [ ] Compare these flows:
  - onboarding/profile setup
  - group creation/invite readiness
  - matching queue entry
  - match result
  - daily reveal/Q&A
  - schedule and venue assignment
  - chat
  - admin/operator review

- [ ] Result must classify each as:
  - already covered by root app
  - adapt into future phase
  - reject as prototype-only

## Task 5: Next Phase Recommendations

- [ ] Propose the next 3 implementation phases only. Recommended:
  1. Phase 7: meeting assignment path using `venues` / `match_meetings`
  2. Phase 8: daily card/Q&A structured reveal UI
  3. Phase 9: post-confirmation chat design and secure schema plan

- [ ] Do not propose more than 3 active phases, to avoid returning to scattered work.

## Verification

Because Phase 6 is docs/audit-only:

```powershell
git diff --stat
git diff --cached --stat
```

Expected:

- Cached diff remains Phase 5 only unless the manager explicitly asks to stage Phase 6.
- Unstaged diff contains only Phase 6 docs.

No app build or Supabase reset is required unless the worker changes code or migrations, which this phase forbids.

## Rollback

Before commit:

```powershell
Remove-Item -LiteralPath "docs\plans\2026-06-14-phase-6-sungjun-github-alignment-audit-plan.md"
Remove-Item -LiteralPath "docs\plans\2026-06-14-phase-6-sungjun-github-alignment-audit-result.md" -ErrorAction SilentlyContinue
git restore -- "docs/plans/README.md"
```

Comparison worktrees can be removed after the audit if they are no longer needed:

```powershell
git worktree remove "C:\Users\82108\.codex\worktrees\dating-app\phase6-origin-main-20260614"
git worktree remove "C:\Users\82108\.codex\worktrees\dating-app\phase6-matching-group-engine-20260614"
```

## Suggested Worker Prompt

```text
팀장방, Phase 6 Sungjun GitHub alignment audit 시작.
docs/plans/2026-06-14-phase-6-sungjun-github-alignment-audit-plan.md 그대로 진행해.
성준 origin/main의 gwating-app와 origin/matching/group-engine을 현재 루트 앱 Phase 0~5 기준과 비교해서 채택/수정채택/보류/폐기 항목으로 정리해.
직접 코드 병합, DB 변경, production Supabase 작업은 절대 하지 마.
완료되면 docs/plans/2026-06-14-phase-6-sungjun-github-alignment-audit-result.md에 결과를 남기고 보고해.
```

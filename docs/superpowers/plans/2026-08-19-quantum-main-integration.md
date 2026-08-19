# Quantum Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current product work while rebuilding it as a clean, reviewable descendant of `origin/main` without modifying the dirty intake workspace or pushing directly to `main`.

**Architecture:** Treat `origin/main` as the history base and `codex/quantum-active-clean` as the current product source. Skip patch-equivalent commits already present in `main`, replay only genuinely unique product commits, and resolve each conflict by preserving the newer security and product contracts rather than taking an entire side blindly. Remote branches remain untouched until the integrated branch passes local verification and is available on GitHub.

**Tech Stack:** Git worktrees, Next.js 14, TypeScript, Supabase migrations, Expo React Native, Python appearance service, Node/Python test suites.

---

### Task 1: Freeze and record source-of-truth inputs

**Files:**
- Create: `docs/coordination/QUANTUM_GITHUB_BRANCH_AUDIT_2026-08-19.md`
- Reference: `docs/coordination/QUANTUM_COMMIT_PLAN.md`

- [ ] Record exact SHA values for `origin/main`, `codex/quantum-active-clean`, their merge base, and the dirty intake branch.
- [ ] Record patch-equivalent commit counts and the unique commit counts on each side.
- [ ] Classify every remote branch as `INTEGRATE`, `PRESERVE_REMOTE`, or `DELETE_CANDIDATE_AFTER_MERGE`.
- [ ] Confirm the dirty intake workspace and external archive are outside the integration path.
- [ ] Commit only the audit and this plan as a documentation change.

### Task 2: Rebuild the product branch on top of `origin/main`

**Files:**
- Modify: Git history for `codex/main-integration-20260819`
- Preserve: all tracked product files represented by unique active commits

- [ ] Rebase the integration branch onto `origin/main` so patch-equivalent commits are skipped automatically.
- [ ] Keep `main`'s removal of the retired school-email gate unless a later product contract explicitly replaces it.
- [ ] Preserve distinct Supabase migrations; never drop or rename an already published timestamp merely to silence a conflict.
- [ ] Preserve `main` security, authentication redirect, query preservation, dependency upgrade, and metadata fixes.
- [ ] Replay mobile, appearance, payments, matching, social, Campus Eats, community, design-system, release, and QA commits in their original order.
- [ ] Regenerate dependency lockfiles from the resolved manifests instead of hand-merging lockfile conflict markers.

### Task 3: Resolve contract conflicts by current behavior

**Files:**
- Review: `app/api/**`, `lib/**`, `middleware.ts`, `supabase/migrations/**`
- Review: `app/**`, `components/**`, `apps/quantum-mobile/**`
- Test: `tests/**`, `python/appearance/tests/**`

- [ ] For every conflict, identify the intent of the `main` commit and the replayed product commit before editing.
- [ ] Keep server-only authorization for privileged Supabase and photo operations.
- [ ] Keep private appearance scores and pre-meeting participant identity hidden from browser responses.
- [ ] Keep the latest event-room, friend, meetup, community, and Campus Eats contracts with their matching tests.
- [ ] Scan the resolved tree for conflict markers and stale references to removed routes.

### Task 4: Verify the integrated baseline

**Files:**
- Update: `docs/coordination/QUANTUM_GITHUB_BRANCH_AUDIT_2026-08-19.md`

- [ ] Install dependencies from the resolved lockfile.
- [ ] Run TypeScript checks, lint, all Node tests, and the production build.
- [ ] Run Expo Doctor and mobile tests.
- [ ] Run Python appearance tests with documented exclusions.
- [ ] Run secret scanning and database/security contract checks.
- [ ] Record exact pass, fail, skipped, and unverified counts in the audit document.

### Task 5: Prepare GitHub integration without touching `main`

**Files:**
- Update: `docs/coordination/QUANTUM_GITHUB_BRANCH_AUDIT_2026-08-19.md`

- [x] Confirm the integration worktree has only intentional commits and no untracked files.
- [x] Confirm `origin/main` is an ancestor of the integration branch.
- [x] Produce the exact commit range and file summary for review.
- [x] Push only `codex/main-integration-20260819` after local verification.
- [x] Do not delete remote branches or push `main` until the integrated branch and PR state are reviewed.

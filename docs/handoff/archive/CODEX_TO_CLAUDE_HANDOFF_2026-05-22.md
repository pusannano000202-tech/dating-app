# Codex to Claude Code Handoff - 2026-05-22

## 0. Claude Code에게 먼저

이 문서는 `profile/post-worldcup-decisions-2026-05-21` 브랜치에서 Codex가 진행한 작업을 Claude Code가 이어받기 위한 인수인계서다.

넓게 재해석하지 말고 아래 순서로 이어가면 된다.

1. `git status --short --branch`로 현재 미커밋 파일을 확인한다.
2. 이 문서의 "8. 현재 미커밋 작업"과 실제 diff를 대조한다.
3. 먼저 그룹 API/UI 변경분을 리뷰한다.
4. `npm run typecheck`, `npm run lint`, `npm run test:profile`, `npm run test:matching`을 다시 돌린다.
5. 가능하면 로컬 `/group/create` 페이지를 실제 브라우저로 확인한다.
6. 문제가 있으면 고치고, 통과하면 `feat(groups): connect group creation and invites to Supabase`로 커밋한다.

절대 바로 새로운 대형 기능으로 넘어가지 말 것. 현재는 Task D가 반쯤 구현된 상태다.

## 1. Repo / Branch State

- Repo path: `C:\Users\82108\OneDrive\바탕 화면\데이팅앱만들기`
- Branch: `profile/post-worldcup-decisions-2026-05-21`
- Latest pushed commit at handoff: `e1a4aef feat(profile): persist self appearance score`
- Working tree: dirty. Group flow files are modified/untracked and not committed.
- Dev server: Codex started `npm run dev -- -p 3000`; `localhost:3000` port was open, but first page request timed out before the user interrupted. Check/stop/restart the server yourself before visual verification.

## 2. App Understanding

Project name in docs is Destiny. It is a Next.js App Router dating/group matching app backed by Supabase.

Main product flow:

1. User signs in through Supabase Auth.
2. `public.users` mirrors `auth.users` and is used as the application FK target.
3. Profile onboarding flow is now:
   - `/profile/basic`
   - `/profile/worldcup`
   - `/profile/photos`
   - `/profile/survey`
   - `/profile/schedule`
   - `/profile/preferences`
   - `/profile/complete`
4. Self-worldcup route/component is removed from the active product flow.
5. Ideal worldcup results persist to `profiles.preferred_*` vectors and `worldcup_choice_logs`.
6. Photo scoring must produce `profiles.self_appearance_score`; matching depends on this value.
7. Users create 2-3 person same-gender groups.
8. Groups enter weekly matching queue.
9. Matching pairs opposite-gender groups of same size using deterministic matching scores.
10. Home matching pool UI should eventually read real DB queue counts, but currently that is still not done.

Tech stack:

- Next.js 14 App Router
- React 18
- TypeScript
- Supabase Auth/Postgres/RLS/Storage
- Python appearance service under `python/appearance`
- Planned Python Hungarian matching runner later

Important source-of-truth docs:

- `docs/MASTER_PLAN_V1_6_2026-05-21.md`
- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md`
- `docs/CODE_REVIEW_2026-05-21.md`
- `docs/CODEX_REPORT_2026-05-21_PM.md`
- `docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md`

## 3. Critical Product Decisions Already Settled

- D-01: onboarding order is `basic -> worldcup -> photos -> survey -> schedule -> preferences`.
- D-02: self-worldcup UI is removed. Do not revive it unless explicitly asked.
- D-03: `self_appearance_score` should come from photo analysis by default. Admin override support exists at DB level, not UI level yet.
- D-04: home visualization is weekly matching queue, not Soul Orbs.
- D-05: female ideal worldcup pool is treated as current final 64.
- D-06: male ideal worldcup pool is still incomplete and blocks real 64-card worldcup for female users.
- D-07: invite-link flow is required because users can have zero friends.
- D-08: current `friend_requests` and `friendships` schema remains baseline.
- D-09: worldcup vector persistence is required before matching.
- D-10: app-side FKs use `public.users(id)`.
- D-11: personality preference system is owned by Sungjun and must be integrated later.
- D-12: venue integration can be excluded from v1 unless Sungjun gives a ready contract.

## 4. Completed Commits In This Codex Run

### `d8d1412 fix(db): tighten matching RLS and active group membership`

Handled original review issues:

- Removed self-worldcup item from profile complete checklist.
- Added `profiles_public` `security_invoker`.
- Relaxed `group_members(user_id)` uniqueness to active membership via `left_at`.
- Added stricter RLS write policies for:
  - `friend_requests`
  - `friendships`
  - `group_members`
  - `group_invites`
  - `match_pool`

Files include:

- `app/profile/complete/page.tsx`
- `supabase/migrations/20260521_z10_profiles_public_view_security_invoker.sql`
- `supabase/migrations/20260521_z11_relax_group_members_unique_to_active.sql`
- `supabase/migrations/20260521_z12_rls_strict_write_policies.sql`
- `docs/CODEX_REPORT_2026-05-21_PM.md`

### `94956d5 docs: add matching v1.6 master plan`

Created:

- `docs/MASTER_PLAN_V1_6_2026-05-21.md`

This is the execution order source of truth.

### `7f0b96a feat(matching): add deterministic matching core`

Implemented TypeScript matching core:

- `lib/matching/types.ts`
- `lib/matching/time.ts`
- `lib/matching/filter.ts`
- `lib/matching/score.ts`
- `lib/matching/group-summary.ts`
- `lib/matching/simulate.ts`
- `tests/matching/core.test.ts`
- `tsconfig.matching-tests.json`
- `package.json` script `test:matching`

Verified:

- `npm run test:matching` passed 8 tests
- `npm run typecheck` passed
- `npm run lint` passed

### `e1a4aef feat(profile): persist self appearance score`

Implemented `self_appearance_score` production path:

- `lib/profile/appearance-score.ts`
- `tests/profile/appearance-score.test.ts`
- `tsconfig.profile-tests.json`
- `package.json` script `test:profile`
- `supabase/migrations/20260521_z13_profile_self_appearance_score_sources.sql`
- Updated `app/api/score/route.ts`
- Updated `app/profile/photos/page.tsx`

Behavior:

- `/api/score` calls existing AI server `/api/score-photos`.
- It extracts score from AI response if present.
- If AI server returns only `status: "ok"` and writes `profiles.appearance_score_normalized`, Next route falls back to reading that profile column.
- Effective rule: `override ?? auto ?? legacy`.
- Writes:
  - `profiles.self_appearance_score_auto`
  - `profiles.self_appearance_score`
  - `profiles.self_appearance_score_source`
  - `profiles.self_appearance_score_updated_at`
- `/profile/photos` now blocks progression if scoring/persistence fails.

Verified:

- `npm run test:profile` passed 9 tests
- `npm run test:matching` passed 8 tests
- `npm run typecheck` passed
- `npm run lint` passed

## 5. Known Completed But Not Fully Runtime-Verified

Supabase CLI is not available in this environment, so fresh DB migration apply has not been verified with:

```powershell
supabase db reset
```

Claude should not claim migrations are production-ready until a real Supabase migration reset/apply is run somewhere with the CLI.

## 6. Current Master Plan Position

From `docs/MASTER_PLAN_V1_6_2026-05-21.md`:

- Task A DB/RLS stabilization: completed and pushed.
- Task B matching core library: completed and pushed.
- Task C `self_appearance_score` production: completed and pushed.
- Task D group APIs and invite link flow: in progress, uncommitted.
- Task E MatchingPool real stats: not started.
- Task F Hungarian batch runner: not started.
- Male MI01-MI64 pool: external/parallel track, still incomplete.

## 7. Current Uncommitted Files

At handoff, `git status --short --branch` showed:

```text
## profile/post-worldcup-decisions-2026-05-21...origin/profile/post-worldcup-decisions-2026-05-21
 M app/group/create/page.tsx
?? app/api/group-invites/
?? app/api/groups/
?? app/group/invite/
?? lib/supabase-server.ts
?? supabase/migrations/20260521_z14_group_invite_token_acceptance.sql
```

These belong to Task D only.

## 8. Current Uncommitted Task D Work

### Added `lib/supabase-server.ts`

Purpose:

- Shared App Router server-side Supabase client using `@supabase/ssr`.
- Avoid repeating cookie client setup in every route.

### Added `app/api/groups/route.ts`

Current behavior:

- `GET /api/groups`
  - Requires authenticated user.
  - Loads active group membership where `left_at IS NULL`.
  - Loads group, active members, invites, and active friendships.
- `POST /api/groups`
  - Requires authenticated user.
  - If active group already exists, returns it.
  - Reads `profiles.gender`.
  - Creates `groups` row with `leader_user_id = auth.uid()`, `size = 2 or 3`, default 3.
  - Inserts leader into `group_members`.
  - Returns group state.

Important limitation:

- Friend display names are placeholders: `친구 ${friendId.slice(0, 8)}`.
- There is no public profile/display name table currently available to this route.

Review carefully:

- `.or(\`user_id.eq.${userId},friend_user_id.eq.${userId}\`)` should be checked against Supabase query syntax.
- Group creation depends on existing `profiles.gender`; users without basic profile get `profile_gender_required`.

### Added `app/api/group-invites/route.ts`

Current behavior:

- `GET /api/group-invites?token=...`
  - Requires authenticated user.
  - Calls RPC `get_group_invite_by_token`.
- `POST /api/group-invites`
  - Requires authenticated user.
  - Creates invite row with:
    - `group_id`
    - `invited_by_user_id = auth.uid()`
    - `invited_user_id` OR `invited_phone` OR link pseudo-target
    - random token
    - 7-day expiration

Important limitation / hack:

- `group_invites` has CHECK requiring `invited_phone IS NOT NULL OR invited_user_id IS NOT NULL`.
- For link-only invites, current code stores `invited_phone = link:<token-prefix>` to satisfy that check.
- Better follow-up may be a migration allowing true link-only invites or adding `invite_kind`.

### Added `app/api/group-invites/accept/route.ts`

Current behavior:

- `POST /api/group-invites/accept`
  - Requires authenticated user.
  - Body: `{ token }`.
  - Calls RPC `accept_group_invite_by_token`.

### Added `supabase/migrations/20260521_z14_group_invite_token_acceptance.sql`

Purpose:

- Adds `SECURITY DEFINER` RPCs:
  - `get_group_invite_by_token(p_token TEXT)`
  - `accept_group_invite_by_token(p_token TEXT)`
- Replaces `guard_group_invites_update()` with a version that allows bypass inside the RPC using:
  - `current_setting('app.bypass_group_invites_guard', TRUE) = 'on'`

Why this exists:

- Existing z12 RLS/trigger allows only `invited_user_id = auth.uid()` to accept.
- Link invites may have no `invited_user_id` until acceptance.
- Direct client update would fail, so token acceptance must happen through a narrow RPC.

Review carefully:

- Confirm `SECURITY DEFINER` + `auth.uid()` works as expected in Supabase for these functions.
- Confirm this does not overexpose invite lookup.
- Confirm expired invite update with bypass works.
- Confirm accepting the same invite twice fails safely.
- Confirm group capacity is locked by `FOR UPDATE` group row plus count.

### Added `app/group/invite/[token]/page.tsx`

Current behavior:

- Client page.
- Loads invite info by token.
- If unauthenticated, shows login link.
- Accept button posts to `/api/group-invites/accept`.
- On success redirects to `/group/create`.

Needs visual/browser verification.

### Replaced `app/group/create/page.tsx`

Old state:

- Hardcoded `INITIAL_FRIENDS`.
- Local-only group members.
- Local-only requests.
- Invite link was demo.
- Queue button had no handler.

New current behavior:

- On mount, calls `POST /api/groups` to create or load active group.
- Renders DB-backed group, members, pending invites, friends.
- Phone invite calls `POST /api/group-invites`.
- Friend invite calls `POST /api/group-invites`.
- Link invite creates a real invite and copies `/group/invite/<token>`.
- Existing queue button still does not enter queue; it shows a local message.

Important limitation:

- Queue entry is still not implemented.
- `match_pool` policy requires group status `ready`, but current UI/API never sets group to `ready`.
- Task D does not yet implement `app/api/groups/[groupId]/members/route.ts`; current token acceptance handles member insertion through RPC, not that route.

## 9. Verification Already Run After Task D Code Was Written

Before interruption, Codex ran:

```powershell
npm run typecheck
npm run lint
npm run test:profile
npm run test:matching
```

They passed at that time.

Also:

```powershell
Test-NetConnection -ComputerName localhost -Port 3000
```

returned `TcpTestSucceeded = True`.

But:

- `Invoke-WebRequest http://localhost:3000/group/create` timed out before successful page response.
- The user interrupted before browser verification.

Claude should rerun all verification because the current files are uncommitted.

## 10. Immediate Next Steps For Claude

Do exactly this:

1. Run:

```powershell
git status --short --branch
git diff --stat
git diff -- app/group/create/page.tsx
```

2. Inspect untracked files:

```powershell
Get-Content app\api\groups\route.ts
Get-Content app\api\group-invites\route.ts
Get-Content app\api\group-invites\accept\route.ts
Get-Content app\group\invite\[token]\page.tsx
Get-Content lib\supabase-server.ts
Get-Content supabase\migrations\20260521_z14_group_invite_token_acceptance.sql
```

3. Rerun:

```powershell
npm run typecheck
npm run lint
npm run test:profile
npm run test:matching
```

4. Start/restart dev server and visually check:

```powershell
npm run dev -- -p 3000
```

Pages to check:

- `http://localhost:3000/group/create`
- `http://localhost:3000/group/invite/test-token`

Expected without login:

- API routes should return 401.
- Invite page should show login state.

Expected with login and profile:

- `/group/create` should create or load active group.
- It should not show hardcoded Korean mojibake names anymore.
- Phone/link invite buttons should create pending invites.

5. Review and fix likely issues:

- Page request timeout / dev server compile issue.
- Any Supabase route that fails due RLS.
- Any route using `auth.uid()` inside `SECURITY DEFINER` incorrectly.
- Link invite hack using `invited_phone = link:...`.
- Whether `GET /api/group-invites?token=` should require login or allow unauthenticated preview.
- Whether group create should set status `ready` when members >= 2, or defer to queue route.

6. If satisfied, commit:

```powershell
git add app/group/create/page.tsx app/api/groups app/api/group-invites app/group/invite lib/supabase-server.ts supabase/migrations/20260521_z14_group_invite_token_acceptance.sql
git commit -m "feat(groups): connect group creation and invites to Supabase"
git push
```

## 11. Important Remaining Work After Current Task D

Do not lose these:

### Task E: MatchingPool real stats

Still not started.

Files likely:

- `components/MatchingPool.tsx`
- `app/page.tsx`
- new `app/api/match-pool/stats/route.ts`

Goal:

- Replace hardcoded `{ female: 12, male: 9 }` and `QUEUE_ROWS`.
- Read `match_pool.status IN ('waiting', 'rolled_over')` joined to `groups.gender`.

### Queue entry / deposit flow

Still not implemented.

Current group page button does not insert `match_pool`.

Need a server route/RPC that:

- Checks group active members >= 2.
- Sets group status `ready`.
- Inserts `match_pool` row with `status='waiting'`.
- Later integrates deposit/payment.

### Task F: Hungarian batch runner

Still not started.

Plan says:

- Python receives cost matrix and returns selected pairs.
- Persist matches from controlled server/admin path.

### Male ideal worldcup pool

Still incomplete:

- Current male active/measured pool was previously observed as 4, not 64.
- Female users cannot have a real 64-card ideal worldcup until male MI01-MI64 is complete.

## 12. Known Risks / Review Notes

### Fresh migration apply not verified

No Supabase CLI in Codex environment. Run migration reset in a real Supabase dev environment.

### z14 RPC needs real DB validation

The TypeScript compiler cannot validate:

- PL/pgSQL syntax against actual DB state.
- RLS behavior.
- `auth.uid()` behavior inside `SECURITY DEFINER` functions.
- trigger bypass config behavior.

### Server routes use anon client with user cookies

This is intentional for RLS-respecting writes. Do not switch to service role broadly unless there is a narrow reason.

### Group creation route currently has no transaction

It creates `groups`, then inserts leader membership. If membership insert fails, it attempts to delete the group. This is acceptable as a first pass but an RPC transaction would be cleaner.

### Friend names are placeholders

No reliable display-name source is currently exposed. Do not invent one without checking schema.

### Link invite schema is awkward

The current schema requires either `invited_phone` or `invited_user_id`, so link invite stores a pseudo phone value. Better schema would be:

- `invite_kind TEXT CHECK (invite_kind IN ('user', 'phone', 'link'))`
- relax CHECK to allow link-only token invites.

### Group status and queue readiness are not solved

`match_pool_member_insert` policy requires `groups.status = 'ready'`.
Current UI only computes `canEnterQueue = members.length >= 2`.
No API currently sets `ready` or inserts into `match_pool`.

## 13. Commands That Passed Recently

After Task C commit:

```powershell
npm run test:profile
npm run test:matching
npm run typecheck
npm run lint
```

After Task D draft code:

```powershell
npm run typecheck
npm run lint
npm run test:profile
npm run test:matching
```

All exited 0 during Codex run, but rerun before commit.

## 14. What Not To Do

- Do not revive `/profile/self-worldcup`.
- Do not change onboarding order without updating D-01 docs.
- Do not expose raw appearance vectors or raw appearance scores in user-facing UI.
- Do not make group writes direct client-table writes if multi-table transitions are involved.
- Do not implement MatchingPool stats before current group API/UI draft is reviewed and committed.
- Do not claim Supabase migrations apply until `supabase db reset` or equivalent has actually run.

## 15. Short Summary For Claude

You are taking over on Task D.

The app now has:

- DB/RLS foundation committed.
- Matching core committed and tested.
- `self_appearance_score` production committed and tested.

Current uncommitted work:

- Group creation route.
- Group invite route.
- Token acceptance RPC.
- Invite acceptance page.
- DB-backed `/group/create` page.

Your job:

1. Review the uncommitted Task D diff.
2. Fix any route/RLS/runtime issues.
3. Verify with tests and local page load.
4. Commit and push `feat(groups): connect group creation and invites to Supabase`.
5. Then proceed to Task E real MatchingPool stats.

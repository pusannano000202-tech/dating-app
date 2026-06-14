# Phase 4 DB Lint Cleanup Worker Brief

## Summary

**Goal:** Clean up the Supabase `db lint` failures that remain after Phase 3 z54 validation, without touching z54 and without touching production.

**Scope:** Legacy/cross-branch Postgres function lint issues reported by local Supabase validation.

**Hard rule:** Do not edit `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`.

**Hard rule:** Do not apply anything to production Supabase.

## Current Baseline

- Phase 3 z54 is committed and locally validated.
- Latest Phase 3 commit: `335e84c fix: validate z54 daily card draw policy`.
- Phase 3 validation DB was a disposable local Supabase project under `.tmp/phase3-local-supabase`.
- z54 functions were not part of the remaining lint failures.
- The remaining lint failures are existing legacy/cross-branch issues.

Reference:

- `docs/plans/2026-06-13-phase-3-db-worker-result.md`
- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

## Production Boundary

Worker must not:

- run `supabase db push --linked`
- run `supabase db reset --linked`
- run `supabase migration up --linked`
- run SQL in Supabase Dashboard SQL Editor
- use Supabase MCP against production
- modify production environment variables
- modify `.env.local` to point at production or staging without manager approval

Allowed targets:

- `.tmp/phase4-local-supabase`
- disposable local Docker Supabase
- disposable staging/branch only if the manager explicitly provides it later

## Current Supabase Notes

- Supabase CLI local workflow supports `supabase start`, `supabase db reset --local`, `supabase db lint --local`, and `supabase db advisors --local`.
- Supabase's 2026-04-28 changelog says new public tables may require explicit grants before Data API/GraphQL access. Phase 4 should avoid creating new public tables; if a real table is needed later, grant and RLS decisions must be explicit.

## Do Not Touch

Do not modify:

- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`
- Phase 3 `.tmp` validation files unless rebuilding a separate Phase 4 `.tmp`
- auth/login frontend
- matching engine TypeScript
- API route behavior
- `lib/types.ts`
- `docs/engineering/INTERFACE_CONTRACT.md`

## Source Of Truth

Use these inputs:

1. Current repo source migrations.
2. Phase 3 result document.
3. Fresh Phase 4 local `supabase db lint --local --fail-on error` output.

Do not rely only on the previous Phase 3 lint output. Reproduce it first.

## Known Phase 3 Lint Failures

Phase 3 local lint reported these failures:

### Category A: Fixable ambiguous references

These are likely real function bugs and can be fixed by qualifying table columns or renaming PL/pgSQL variables/output columns.

| Function | Source migration candidate | Lint issue |
|---|---|---|
| `public.leave_group` | `supabase/migrations/20260521_z27_group_leave_disband_rpc.sql` | ambiguous `group_id` |
| `public.accept_friend_request` | `supabase/migrations/20260521_z23_friend_request_flow.sql` | ambiguous `user_id` in `ON CONFLICT` |
| `public.mock_pay_deposit` | `supabase/migrations/20260521_z24_deposit_check_in_enter_match_pool.sql` | ambiguous `status` |
| `public.disband_group` | `supabase/migrations/20260521_z27_group_leave_disband_rpc.sql` | ambiguous `status` |
| `public.get_friend_request_summaries` | `supabase/migrations/20260522_z31_friend_request_lazy_expire.sql` | ambiguous `status` |
| `public.transfer_group_leadership` | `supabase/migrations/20260522_z32_transfer_group_leadership.sql` | ambiguous `group_id` |

Expected fix style:

- Prefer table aliases:
  - `gm.group_id`
  - `fr.status`
  - `mp.status`
  - `d.status`
- For `RETURNS TABLE` conflicts, remember output column names are PL/pgSQL variables.
- Do not change function return shapes unless unavoidable.
- Preserve all grants and comments.

### Category B: Cross-branch schema dependency

These failures are not necessarily local bugs. They come from functions referencing tables that are expected from the Sungjun/cross-branch meeting/venue schema.

| Function | Source migration candidate | Lint issue |
|---|---|---|
| `public.checkin_attendance` | `supabase/migrations/20260522_z45_gps_checkin_and_finalize_no_show.sql` | relation `public.venues` does not exist |
| `public.get_match_meeting_info` | `supabase/migrations/20260522_z37_match_meeting_info_and_lazy_complete.sql` | relation `public.venues` does not exist |

Expected handling:

- Do not create a fake production `public.venues` table just to silence lint.
- Do not add a local-only fixture as a source migration.
- First determine whether the real Sungjun migration for `venues` and `match_meetings` exists elsewhere or is missing from this branch.
- If the real migration is missing, report it as a cross-branch dependency gap and keep it out of automatic cleanup.
- If a source-safe guard can avoid lint execution without changing behavior, propose it first and wait for manager approval before implementing.

## Plan Of Work

### Step 0: Confirm clean baseline

Run:

```powershell
git status --short
git log -1 --oneline
```

Expected:

- working tree clean
- latest commit is Phase 3 or later

If not clean, stop and report.

### Step 1: Rebuild a Phase 4 local Supabase project

Use a separate project from Phase 3:

- `.tmp/phase4-local-supabase`

Reason:

- Keep Phase 3 evidence untouched.
- Avoid mixing worker experiments with the already validated z54 result.

Because the source migrations have duplicate numeric prefixes, copy migrations into `.tmp/phase4-local-supabase/supabase/migrations` with unique local-only prefixes, preserving order.

Expected duplicate prefixes from Phase 3:

- `20260514`: 2 files
- `20260515`: 2 files
- `20260521`: 23 files
- `20260522`: 18 files
- `20260602`: 8 files

Apply only the minimum local-only compatibility patches needed to replay historical migrations:

- z30 `confirm_match(UUID)` return-shape compatibility
- z49 `profiles_public` view shape compatibility

Do not patch z54 in `.tmp`; z54 is already fixed in source.

### Step 2: Reproduce lint failures

Run:

```powershell
npx supabase@latest start --workdir ".tmp\phase4-local-supabase" --ignore-health-check
npx supabase@latest db reset --local --workdir ".tmp\phase4-local-supabase"
npx supabase@latest db lint --local --fail-on error --workdir ".tmp\phase4-local-supabase"
npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir ".tmp\phase4-local-supabase"
```

Record:

- exact lint JSON output
- exact advisor warnings
- whether any z54 functions appear in output
- whether the failure list matches Phase 3

### Step 3: Decide correction strategy

Preferred strategy:

- Create a new corrective migration that redefines the affected legacy functions.
- Do not edit old already-applied migration files unless the manager explicitly approves history surgery.

Important:

- If a new migration file is needed, use Supabase CLI migration creation, not hand-invented filenames.
- If CLI migration creation cannot be used cleanly because this repo has non-standard migration history, stop and ask manager before inventing a filename.

Candidate migration purpose:

- `phase_4_db_lint_cleanup`

The corrective migration should only redefine functions needed for Category A.

Do not include z54.

Do not include fake `venues`/`match_meetings` schemas.

### Step 4: Fix Category A only

Fix ambiguous references by redefining affected functions with equivalent behavior.

For each function:

- Read its current full definition.
- Identify the exact ambiguous symbol from lint output.
- Qualify table columns or aliases.
- Preserve return type.
- Preserve security mode and `SET search_path`.
- Preserve grants.
- Preserve comments if present.

Minimum acceptance:

- Each Category A function no longer appears in `db lint`.
- Behavior is unchanged for ordinary paths.

Recommended smoke checks:

- `leave_group`: non-member blocked, member can leave when allowed.
- `disband_group`: leader-only behavior remains; match_pool cancellation update uses qualified status.
- `transfer_group_leadership`: new leader must be active member and not caller.
- `accept_friend_request`: accepted request creates friendship rows or preserves existing conflict behavior.
- `get_friend_request_summaries`: lazy expiry still updates only relevant pending rows.
- `mock_pay_deposit`: existing paid/held/pending deposit lookup still works in local test fixture.

Keep fixtures local-only under `.tmp`.

### Step 5: Classify Category B

For `public.venues` missing:

1. Search the repo for real `venues` creation migration.
2. Search docs for Sungjun meeting/venue ownership references.
3. Decide one of:
   - real migration exists but is not in source order: propose order/import fix
   - real migration missing from branch: report dependency gap
   - function can be rewritten to avoid parse-time relation validation while preserving runtime behavior: propose a small guard/refactor

Do not silently create tables.

Do not silently remove GPS/check-in behavior.

### Step 6: Re-run verification

After Category A fix:

```powershell
npx supabase@latest db reset --local --workdir ".tmp\phase4-local-supabase"
npx supabase@latest db lint --local --fail-on error --workdir ".tmp\phase4-local-supabase"
npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir ".tmp\phase4-local-supabase"
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

Expected:

- Category A lint failures removed.
- Category B is either removed by a source-safe guard or explicitly remains as a documented cross-branch dependency gap.
- z54 remains clean and unchanged.
- App checks still pass.

### Step 7: Write result report

Create:

- `docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-result.md`

Include:

- changed files
- exact lint failures before
- exact lint/advisor results after
- Category A fixes
- Category B classification
- commands run
- tests run
- remaining risks
- rollback plan
- whether production was touched

## Rollback Criteria

Stop and report if:

- z54 would need to change
- a function return shape must change
- fixing Category A requires changing API routes or frontend behavior
- worker cannot create a clean corrective migration without inventing a filename
- local DB reset fails after 2 attempts with different fixes
- any production command would be needed
- real `venues`/`match_meetings` schema ownership is unclear

Rollback path:

- Do not touch production, so rollback should be local/source only.
- If a corrective migration is created and proves wrong, remove that new migration before commit.
- If historical migrations were changed by mistake, revert only the worker's changes with `git restore --source=HEAD -- <file>` after confirming the file was not modified by the user.

## Completion Criteria

Phase 4 is ready for manager review when:

- A local Phase 4 Supabase project can replay migrations.
- Category A lint failures are fixed or explicitly proven obsolete.
- Category B is documented as dependency gap or fixed by a safe guard.
- z54 is unchanged from Phase 3.
- production was not touched.
- app verification passes.
- result doc exists.

## Suggested Worker Prompt

```text
Start Phase 4. Follow docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-brief.md exactly.
Do not touch production Supabase.
Do not modify the z54 migration.
Reproduce lint failures in .tmp/phase4-local-supabase, then safely fix only Category A ambiguous reference issues.
Do not hide venues/match_meetings cross-branch issues with fake source tables. Classify the cause and report it.
When complete, write docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-result.md and report back.
```

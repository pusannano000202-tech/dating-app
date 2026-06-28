# Phase 4 DB Lint Cleanup Worker Result

## Summary

- Status: DONE_FOR_CATEGORY_A_WITH_CATEGORY_B_DEPENDENCY_REMAINING
- Production touched: no
- z54 touched: no
- Corrective migration created: yes
- Corrective migration: `supabase/migrations/20260614121354_phase_4_db_lint_cleanup.sql`

Docker Desktop was restarted and Phase 4 resumed against the disposable local Supabase project at `.tmp/phase4-local-supabase`.

The fix removes the legacy ambiguous-reference lint errors from Category A. The remaining `db lint --fail-on error` failures are Category B cross-branch schema dependency errors for `public.match_meetings` / `public.venues`, which are not created in this branch.

## Source Files Changed

- `supabase/migrations/20260614121354_phase_4_db_lint_cleanup.sql`
- `docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-result.md`
- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

Existing Phase 4 planning links remain in:

- `docs/plans/README.md`
- `docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-brief.md`

## Local Validation Project

- Workdir: `.tmp/phase4-local-supabase`
- Source migrations were copied into `.tmp/phase4-local-supabase/supabase/migrations` with unique local-only prefixes.
- The Phase 4 source corrective migration was copied into `.tmp` as local-only migration `202606140156_phase_4_db_lint_cleanup.sql`.
- Production Supabase was not touched.
- No linked or remote Supabase commands were run.
- No `.env.local` edits were made.

## Category A Fixes

The corrective migration redefines these RPCs with the same public signatures and grants:

| Function | Fix |
|---|---|
| `public.accept_friend_request(UUID)` | Replaced ambiguous `ON CONFLICT (user_id, friend_user_id)` with `ON CONFLICT ON CONSTRAINT friendships_pkey`. |
| `public.mock_pay_deposit(UUID, INT)` | Qualified `deposits` references as `d.group_id`, `d.user_id`, `d.status`. |
| `public.leave_group(UUID)` | Qualified `group_members`, `match_pool`, and `groups` references with table aliases. |
| `public.disband_group(UUID)` | Qualified `match_pool.status` and `match_pool.group_id` references. |
| `public.get_friend_request_summaries()` | Qualified `friend_requests` lazy-expiry references as `fr.status`, `fr.sender_user_id`, etc. |
| `public.transfer_group_leadership(UUID, UUID)` | Qualified `group_members.group_id` lookup and `groups` update references. |

## DB Verification

### Passed

```powershell
npx supabase@latest db reset --local --workdir ".tmp\phase4-local-supabase"
```

Result: passed. All migrations replayed through local-only `202606140156_phase_4_db_lint_cleanup.sql`.

### Lint Result

```powershell
npx supabase@latest db lint --local --fail-on error --workdir ".tmp\phase4-local-supabase"
```

Result: failed only because Category B errors remain.

Category A ambiguous-reference errors no longer appear in lint output.

Remaining errors:

| Function | Remaining issue |
|---|---|
| `public.enqueue_meeting_reminders` | `relation "public.match_meetings" does not exist` |
| `public.get_match_scheduled_reveal_at` | `relation "public.match_meetings" does not exist` |
| `public.lazy_complete_match` | `relation "public.match_meetings" does not exist` |
| `public.get_match_meeting_info` | `relation "public.match_meetings" does not exist` |
| `public.checkin_attendance` | `relation "public.match_meetings" does not exist` |
| `public.finalize_no_show` | `relation "public.match_meetings" does not exist` |
| `public.finalize_no_show_admin` | `relation "public.match_meetings" does not exist` |
| `public.batch_finalize_no_shows` | `relation "public.match_meetings" does not exist` |
| `public.get_match_attendance_state` | `relation "public.match_meetings" does not exist` |

Non-failing lint warnings:

- `public.leave_group`: `never read variable "v_member"`
- `public.mock_pay_deposit`: `never read variable "v_active"`

These warnings existed because those functions use `SELECT ... INTO` plus `FOUND` as a membership/existence check. They can be cleaned in a later low-risk polish migration, but they are not `fail-on error` blockers.

### Security Advisor

```powershell
npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir ".tmp\phase4-local-supabase"
```

Result: completed with existing `function_search_path_mutable` warnings.

Warnings:

- `guard_friendships_update`
- `guard_group_members_update`
- `guard_match_pool_update`
- `guard_group_invites_update`
- `touch_updated_at`
- `guard_friend_requests_update`
- `haversine_distance_m`
- `touch_match_card_submission_updated_at`

These are outside the Category A ambiguous-reference scope.

## Category B Classification

Repo search found no source migration in this branch that creates `public.venues` or `public.match_meetings`.

Docs identify those tables as Sungjun / `origin/matching/group-engine` owned schema:

- `docs/CODEX_MASTER_2026-05-23.md`
- `docs/engineering/CODE_REVIEW_2026-05-21.md`
- `docs/product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md`

Decision: do not create fake source tables in Phase 4. The remaining lint errors are a cross-branch dependency gap until Sungjun's real `venues` / `match_meetings` migration is imported or the affected functions are rewritten with an approved dynamic guard strategy.

## z54 Guard

`supabase/migrations/20260602_z54_daily_card_draw_policy.sql` was not modified.

SHA-256 after Phase 4:

```text
7FFA30BAC15DDE0CDD265873CEA65D622BE23E2C23A797E3D4C5BB5B51E20A4B
```

This matches the Phase 3 recorded hash.

## App Verification

Passed:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

Observed:

- `test:config`: 22 passed
- `test:matching`: 25 passed
- `next build`: passed, generated 47 static pages

## Rollback Plan

If the corrective migration is rejected before commit:

```powershell
Remove-Item -LiteralPath "supabase\migrations\20260614121354_phase_4_db_lint_cleanup.sql"
```

If already committed later, revert that commit normally. Production rollback is not needed because production was not touched.

## Recommended Next Manager Decision

Choose one:

1. Commit Phase 4 Category A cleanup now, with Category B documented as a known cross-branch dependency.
2. Import Sungjun's real `venues` / `match_meetings` migration first, then rerun Phase 4 lint.
3. Write a Phase 5 worker brief to safely remove Category B lint failures with approved dynamic guard rewrites, without fake tables.

Recommended: option 1 first, then handle Category B as a separate Sungjun/schema integration phase.

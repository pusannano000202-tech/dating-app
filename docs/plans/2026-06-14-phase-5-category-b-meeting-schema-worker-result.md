# Phase 5 Category B Meeting Schema Worker Result

## Summary

- Status: DONE_WITH_CONCERNS
- Chosen strategy: Option A
- Production touched: no
- z54 touched: no
- Phase 4 migration touched: no
- New source migration: `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`

Option A was used because Sungjun's real `origin/matching/group-engine` schema candidate exists and includes all fields required by the current branch RPCs. Option B dynamic guard rewrites were not used because Option A was not blocked.

## Source Evidence

Remote inspection succeeded without merging:

```powershell
git fetch origin matching/group-engine
git ls-tree -r --name-only origin/matching/group-engine | Select-String -Pattern "venues|match_meetings|20260516|VENUE"
git show --name-only --oneline -1 origin/matching/group-engine
```

Evidence:

- Latest remote branch commit inspected: `e9c6637 [matching] venues + match_meetings table migration added`
- Candidate files found:
  - `docs/VENUE_DB_DESIGN.md`
  - `supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql`
- Inspection copies exported only under `.tmp/phase5-inspection`.

Sungjun's schema includes the required fields:

- `venues.id`, `name`, `address`, `latitude`, `longitude`, `map_url`, `checkin_radius_m`
- `match_meetings.match_id`, `venue_id`, `scheduled_start`, `scheduled_end`, `status`, `checkin_radius_m`

Current branch RPC search confirmed the existing functions reference only fields supplied by this schema.

## Files Changed

- `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`
- `docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-result.md`
- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

Temporary local-only validation files were created under:

- `.tmp/phase5-inspection`
- `.tmp/phase5-local-supabase`

## Migration Contents

The Phase 5 migration:

- Adds the required guard that stops if `public.venues` or `public.match_meetings` already exists.
- Creates `public.venues`.
- Creates `public.match_meetings`.
- Preserves Sungjun's core columns and constraints.
- Adds required indexes:
  - `idx_venues_status_meeting`
  - `idx_venues_area_school`
  - `idx_match_meetings_match_id`
  - `idx_match_meetings_venue_id`
  - `idx_match_meetings_status_start`
- Enables RLS on both tables.
- Revokes direct table access from `anon` and `authenticated`.
- Adds no seed data.

RLS/grant verification in the local project:

```text
match_meetings | rls_enabled=true | postgres/service_role only
venues         | rls_enabled=true | postgres/service_role only
```

## Local Validation Project

- Workdir: `.tmp/phase5-local-supabase`
- Built from the Phase 4 disposable replay baseline to preserve the already-required historical local-only compatibility patches.
- Phase 5 source migration copied as local-only migration:
  - `202606140157_phase_5_meeting_schema_integration.sql`
- Production Supabase was not touched.
- No `--linked` command was run.
- No `.env.local` edit was made.

## DB Verification

Initial exact reset command before starting the local stack failed with the expected local precondition:

```powershell
npx supabase@latest db reset --local --workdir ".tmp\phase5-local-supabase"
```

Result: failed because `supabase start is not running`.

Local-only stack start then passed:

```powershell
npx supabase@latest start --workdir ".tmp\phase5-local-supabase"
```

Exact reset command rerun:

```powershell
npx supabase@latest db reset --local --workdir ".tmp\phase5-local-supabase"
```

Result: passed. Migrations replayed through local-only `202606140157_phase_5_meeting_schema_integration.sql`.

Relation existence check:

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select to_regclass('public.venues') as venues, to_regclass('public.match_meetings') as match_meetings;"
```

Result: failed due Supabase CLI table-output scanning raw `regclass` OID 2205.

Adapted same check with text casts:

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select to_regclass('public.venues')::text as venues, to_regclass('public.match_meetings')::text as match_meetings;"
```

Result:

```text
venues | match_meetings
venues | match_meetings
```

DB lint:

```powershell
npx supabase@latest db lint --local --fail-on error --workdir ".tmp\phase5-local-supabase"
```

Result: passed. No remaining Category B missing-relation errors for `public.match_meetings` or `public.venues`.

Remaining non-failing warnings:

- `public.mock_pay_deposit`: never read variable `v_active`
- `public.leave_group`: never read variable `v_member`

Security advisors:

```powershell
npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir ".tmp\phase5-local-supabase"
```

Result: completed. Existing `function_search_path_mutable` warnings remain for older functions:

- `guard_friendships_update`
- `guard_group_members_update`
- `guard_group_invites_update`
- `guard_match_pool_update`
- `touch_updated_at`
- `guard_friend_requests_update`
- `haversine_distance_m`
- `touch_match_card_submission_updated_at`

No new `venues` / `match_meetings` security advisor warning appeared.

## Runtime Smoke Queries

All smoke queries ran only against `.tmp\phase5-local-supabase`.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select public.get_match_scheduled_reveal_at(gen_random_uuid()) as reveal_at;"
```

Result: one row, `NULL`.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select * from public.get_match_meeting_info(gen_random_uuid());"
```

Result: zero rows, no missing relation error.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select * from public.enqueue_meeting_reminders();"
```

Result: `0`, no missing relation error.

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

- `typecheck`: passed.
- `lint`: passed with no ESLint warnings or errors.
- `test:config`: 22 passed.
- `test:matching`: 25 passed.
- `build`: passed, generated 47 static pages.

Build caveat:

- First `npm run build` failed before compilation while Next.js cleaned stale generated `.next` output: `EINVAL: invalid argument, readlink ...\.next\static\EegOuhgtfl1_5h7LTYToH`.
- Evidence showed that generated path was a reparse-point directory with no target.
- Only `.next` was removed after verifying the resolved path stayed inside the workspace.
- The rerun passed.

## Protected File Checks

No git diff for:

- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`
- `supabase/migrations/20260614121354_phase_4_db_lint_cleanup.sql`

Hashes after Phase 5:

```text
z54:     7FFA30BAC15DDE0CDD265873CEA65D622BE23E2C23A797E3D4C5BB5B51E20A4B
Phase 4: 8ED86FF0284BE988F0DBF7D556A4D5DDE68E533C1C57464F6AF9B13433303493
Phase 5: E0E114A4A35BEB11D41AB93828B5751E6A3439E5A660B87747B75D6D05B6EFD6
```

## Rollback Plan

Before commit:

```powershell
Remove-Item -LiteralPath "supabase\migrations\20260614125057_phase_5_meeting_schema_integration.sql"
Remove-Item -LiteralPath "docs\plans\2026-06-14-phase-5-category-b-meeting-schema-worker-result.md" -ErrorAction SilentlyContinue
git restore -- "docs/plans/CURRENT_IMPLEMENTATION_STATUS.md"
```

After commit:

```powershell
git revert <phase5_commit_sha>
```

No production rollback is needed because production was not touched.

## Remaining Risks

- This imports the real meeting schema only. It does not implement the future meeting assignment algorithm that inserts `match_meetings` rows.
- Direct Data API access remains intentionally revoked from `anon` and `authenticated`; any future UI path needing direct table reads must design explicit grants and RLS policies.
- Existing unrelated advisor warnings and non-failing lint warnings remain outside Phase 5 scope.
- The exact raw `to_regclass(...)` query in table output hits a Supabase CLI scan issue; the text-cast form verified the same relation state.

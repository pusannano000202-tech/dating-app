# Phase 5 Category B Meeting Schema Worker Brief

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this brief task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the remaining Supabase `db lint` Category B failures caused by missing `public.match_meetings` / `public.venues`, without touching production and without fake source fixtures.

**Architecture:** First inspect Sungjun's real `origin/matching/group-engine` schema migration and prefer importing the real meeting schema through a new current-branch migration. Use dynamic guard rewrites only if the real schema cannot be safely imported in this phase.

**Tech Stack:** Supabase CLI, Supabase Postgres migrations, PL/pgSQL, Next.js verification commands.

---

## Summary

Phase 4 fixed Category A ambiguous-reference lint errors.

Phase 5 is about the remaining Category B errors:

- `public.match_meetings` is missing in the current branch.
- `public.venues` is missing in the current branch.
- Existing RPCs reference those tables for meeting time, venue, reminders, GPS check-in, and no-show settlement.

This is not a random DB bug. It is a cross-branch schema dependency:

- Current branch has RPCs that expect `match_meetings` / `venues`.
- Sungjun branch `origin/matching/group-engine` contains the schema candidate.
- Current branch does not contain that migration yet.

## Current Evidence

Confirmed local branch state:

- `origin/matching/group-engine` exists.
- `origin/matching/group-engine` contains:
  - `supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql`
  - `docs/VENUE_DB_DESIGN.md`
- Latest commit on that remote branch:
  - `e9c6637 [matching] venues + match_meetings 테이블 마이그레이션 추가`

Important ordering issue:

- Sungjun's source file is dated `20260516`.
- Current branch creates `public.matches` in `20260521_matching_create_core_tables.sql`.
- Sungjun's `match_meetings.match_id` references `matches(id)`.
- Therefore, do not blindly copy Sungjun's original `20260516...sql` filename into this branch, because fresh migration replay can apply it before `matches` exists.

## Hard Rules

Do not:

- touch production Supabase
- run any `--linked` Supabase command
- run SQL in Supabase Dashboard
- edit `.env.local`
- modify z54: `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`
- modify Phase 4 migration unless the manager explicitly asks
- create fake source tables only to silence lint
- copy Sungjun's original migration into this branch with its original `20260516` filename
- merge the entire `origin/matching/group-engine` branch
- change frontend/API behavior unless the worker stops and gets manager approval

Allowed:

- inspect `origin/matching/group-engine`
- create `.tmp/phase5-local-supabase`
- create one new source migration with Supabase CLI
- add one Phase 5 result document
- update `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

## Relevant Source Files

Existing current-branch functions that produce Category B lint errors:

| Function | Current source migration |
|---|---|
| `public.get_match_scheduled_reveal_at` | `supabase/migrations/20260522_z36_connection_auto_reveal_on_meeting.sql` |
| `public.lazy_complete_match` | `supabase/migrations/20260522_z37_match_meeting_info_and_lazy_complete.sql` |
| `public.get_match_meeting_info` | `supabase/migrations/20260522_z37_match_meeting_info_and_lazy_complete.sql` |
| `public.enqueue_meeting_reminders` | `supabase/migrations/20260522_z40_friend_request_and_reminder_notifications.sql` |
| `public.checkin_attendance` | `supabase/migrations/20260522_z45_gps_checkin_and_finalize_no_show.sql` |
| `public.finalize_no_show` | latest active definition in `supabase/migrations/20260522_z46_review_fixes_status_admin_view_guards.sql` |
| `public.finalize_no_show_admin` | latest active definition in `supabase/migrations/20260522_z46_review_fixes_status_admin_view_guards.sql` |
| `public.batch_finalize_no_shows` | latest active definition in `supabase/migrations/20260522_z46_review_fixes_status_admin_view_guards.sql` |
| `public.get_match_attendance_state` | latest active definition in `supabase/migrations/20260522_z46_review_fixes_status_admin_view_guards.sql` |

Sungjun candidate schema files:

| File | Purpose |
|---|---|
| `origin/matching/group-engine:supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql` | Creates `venues` and `match_meetings`. |
| `origin/matching/group-engine:docs/VENUE_DB_DESIGN.md` | Explains venue fields, meeting fields, and MVP venue selection rules. |

## Strategy Comparison

### Option A: Import Sungjun's Real Schema

What it does:

- Adds real `public.venues` and `public.match_meetings` tables to the current branch.
- Keeps existing meeting/reminder/check-in/no-show functions meaningful.
- Makes the lint failures disappear because the referenced relations exist.

Pros:

- Product-correct long-term path.
- Aligns with documented ownership and branch history.
- Allows meeting time/place, GPS check-in, reminders, no-show finalization, and daily-card reveal timing to use a real table.

Cons:

- Needs schema review because the original Sungjun migration has no RLS/index/grant hardening.
- Needs careful migration ordering because the original `20260516` filename is too early for this branch.
- Does not create the actual match-confirm-time meeting assignment algorithm by itself.

Default recommendation:

- Prefer Option A first, but import it through a new current-branch migration, not by copying the old filename.

### Option B: Dynamic Guard Rewrite

What it does:

- Does not add `venues` or `match_meetings`.
- Redefines the affected functions so missing tables return null/no-op without lint errors.
- Uses `to_regclass(...)` plus `regclass` variables and `format(...)` dynamic SQL so the linter does not validate a constant query against missing relations.

Pros:

- Lowest schema blast radius.
- Can make current branch lint-clean without importing an unfinished schema.
- Useful if Sungjun schema is stale, incomplete, or intentionally deferred.

Cons:

- Meeting/venue functionality remains absent.
- It can make the DB appear cleaner while the product capability is still missing.
- The worker must be careful not to weaken no-show/check-in behavior when real tables later exist.

Fallback recommendation:

- Use Option B only if Option A has a concrete blocker.

## Phase 5 Decision Gate

The worker must inspect Option A first, then choose:

1. If Sungjun schema can be safely imported as current-branch migration: implement Option A.
2. If schema import has unresolved ownership/security/order blockers: stop and report, or implement Option B only after manager approval.

The worker should not silently choose Option B just because it is smaller.

## Task 0: Baseline And Tool Check

- [ ] Check working tree.

```powershell
git status --short
git log -1 --oneline
```

Expected:

- Clean working tree.
- Latest commit is `96495b1 fix: clean up phase 4 category a db lint` or later.

- [ ] Check Supabase CLI commands from local help.

```powershell
npx supabase@latest --version
npx supabase@latest migration new --help
npx supabase@latest db reset --help
npx supabase@latest db lint --help
npx supabase@latest db advisors --help
```

Expected:

- Supabase CLI is available.
- `migration new`, `db reset`, `db lint`, and `db advisors` are available.

- [ ] Check Docker.

```powershell
docker version
docker ps
```

Expected:

- Docker Engine responds.

Stop and report if Docker is not responsive.

## Task 1: Inspect Sungjun Schema Candidate

- [ ] Refresh remote branch metadata without merging.

```powershell
git fetch origin matching/group-engine
```

Expected:

- Fetch succeeds.
- Current branch does not change.

- [ ] Confirm Sungjun files exist.

```powershell
git ls-tree -r --name-only origin/matching/group-engine | Select-String -Pattern "venues|match_meetings|20260516|VENUE"
```

Expected output includes:

```text
docs/VENUE_DB_DESIGN.md
supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql
```

- [ ] Export inspection copies to `.tmp` only.

```powershell
New-Item -ItemType Directory -Force ".tmp\phase5-inspection" | Out-Null
git show origin/matching/group-engine:supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql > ".tmp\phase5-inspection\sungjun_venues_match_meetings.sql"
git show origin/matching/group-engine:docs/VENUE_DB_DESIGN.md > ".tmp\phase5-inspection\VENUE_DB_DESIGN.md"
```

Expected:

- Files exist under `.tmp\phase5-inspection`.
- No source files changed.

- [ ] Review schema fields against current function usage.

Use:

```powershell
Select-String -Path ".tmp\phase5-inspection\sungjun_venues_match_meetings.sql" -Pattern "CREATE TABLE|match_id|venue_id|scheduled_start|scheduled_end|checkin_radius_m|latitude|longitude|status"
```

Required fields:

- `venues.id`
- `venues.name`
- `venues.address`
- `venues.latitude`
- `venues.longitude`
- `venues.map_url`
- `venues.checkin_radius_m`
- `match_meetings.match_id`
- `match_meetings.venue_id`
- `match_meetings.scheduled_start`
- `match_meetings.scheduled_end`
- `match_meetings.status`
- `match_meetings.checkin_radius_m`

Stop and report if any required field is missing.

## Task 2A: Option A Implementation - Import Real Schema

Use this task if Task 1 passes.

- [ ] Create a new current-branch migration with Supabase CLI.

```powershell
npx supabase@latest migration new phase_5_meeting_schema_integration --workdir .
```

Expected:

- A new file appears under `supabase/migrations/`.
- Filename uses the current timestamp, not `20260516`.

- [ ] Fill the new migration with a reviewed import of Sungjun schema.

Required migration contents:

1. Create `public.venues`.
2. Create `public.match_meetings`.
3. Preserve Sungjun's core columns and constraints.
4. Add practical indexes.
5. Enable RLS.
6. Do not grant direct table access to `anon` or `authenticated` unless a concrete UI path requires it.
7. Add comments that these tables are Sungjun-origin meeting schema imported into current branch.

Required table guard at the top:

```sql
DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL THEN
    RAISE EXCEPTION 'public.venues already exists; stop and reconcile Sungjun schema instead of overwriting';
  END IF;

  IF to_regclass('public.match_meetings') IS NOT NULL THEN
    RAISE EXCEPTION 'public.match_meetings already exists; stop and reconcile Sungjun schema instead of overwriting';
  END IF;
END;
$$;
```

Required indexes:

```sql
CREATE INDEX idx_venues_status_meeting
  ON public.venues(status, suitable_for_group_meeting);

CREATE INDEX idx_venues_area_school
  ON public.venues(area, nearest_school);

CREATE INDEX idx_match_meetings_match_id
  ON public.match_meetings(match_id);

CREATE INDEX idx_match_meetings_venue_id
  ON public.match_meetings(venue_id);

CREATE INDEX idx_match_meetings_status_start
  ON public.match_meetings(status, scheduled_start);
```

Required RLS baseline:

```sql
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_meetings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.venues FROM anon, authenticated;
REVOKE ALL ON public.match_meetings FROM anon, authenticated;
```

Reason:

- Existing `SECURITY DEFINER` RPCs can expose the specific meeting/venue fields already intended for users.
- Direct Data API table access can be designed later with explicit RLS policies.

- [ ] Do not add venue seed data in Phase 5.

Reason:

- Seed quality and real venue list require a separate product/content pass.
- Phase 5 only resolves schema dependency and lint.

## Task 2B: Option B Implementation - Dynamic Guard Rewrite

Use this only after manager approval if Option A is blocked.

- [ ] Create a new current-branch migration with Supabase CLI.

```powershell
npx supabase@latest migration new phase_5_meeting_dynamic_guards --workdir .
```

- [ ] Redefine the affected functions with `regclass` variables.

Pattern for one-table functions:

```sql
DECLARE
  v_match_meetings REGCLASS;
BEGIN
  v_match_meetings := to_regclass('public.match_meetings');
  IF v_match_meetings IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'SELECT scheduled_start FROM %s WHERE match_id = $1 AND status IN (''scheduled'', ''completed'') ORDER BY scheduled_start ASC LIMIT 1',
    v_match_meetings
  )
  INTO v_scheduled_start
  USING p_match_id;
END;
```

Pattern for two-table functions:

```sql
DECLARE
  v_match_meetings REGCLASS;
  v_venues REGCLASS;
BEGIN
  v_match_meetings := to_regclass('public.match_meetings');
  v_venues := to_regclass('public.venues');

  IF v_match_meetings IS NULL OR v_venues IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT mm.scheduled_start, mm.scheduled_end, v.name, v.address, v.map_url
       FROM %s mm
       JOIN %s v ON v.id = mm.venue_id
      WHERE mm.match_id = $1
        AND mm.status IN (''scheduled'', ''completed'')
      ORDER BY mm.scheduled_start ASC
      LIMIT 1',
    v_match_meetings,
    v_venues
  )
  USING p_match_id;
END;
```

Critical requirement:

- Preserve every function's exact return type, security mode, grants, and comments.
- Use `pg_get_functiondef` or the latest source migration to avoid redefining an older version.

Functions to redefine if using Option B:

- `public.enqueue_meeting_reminders()`
- `public.get_match_scheduled_reveal_at(UUID)`
- `public.lazy_complete_match(UUID)`
- `public.get_match_meeting_info(UUID)`
- `public.checkin_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION)`
- `public.finalize_no_show(UUID)`
- `public.finalize_no_show_admin(UUID)`
- `public.batch_finalize_no_shows()`
- `public.get_match_attendance_state(UUID)`

Stop and report if more than two attempts still leave `db lint` relation errors.

## Task 3: Build Disposable Phase 5 Local Supabase Project

Use a new disposable project:

- `.tmp/phase5-local-supabase`

Reason:

- Keep Phase 3 and Phase 4 evidence untouched.
- Avoid production and linked DB entirely.

- [ ] Copy source migrations into `.tmp\phase5-local-supabase\supabase\migrations` with unique local-only prefixes.

Follow the Phase 4 local replay pattern:

- preserve source ordering
- make duplicate date prefixes unique
- do not patch z54
- apply only the same local-only compatibility patches already required for historical replay

- [ ] Copy the new Phase 5 source migration into `.tmp` as the last local-only migration.

Example local name:

```text
202606140157_phase_5_meeting_schema_integration.sql
```

Use the next free local prefix after the Phase 4 sequence. Do not add `.tmp` files to git.

## Task 4: DB Verification

- [ ] Reset local DB.

```powershell
npx supabase@latest db reset --local --workdir ".tmp\phase5-local-supabase"
```

Expected:

- Reset passes.
- New Phase 5 local migration applies after Phase 4 local migration.

- [ ] Verify relations.

For Option A:

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select to_regclass('public.venues') as venues, to_regclass('public.match_meetings') as match_meetings;"
```

Expected:

- `venues` = `venues`
- `match_meetings` = `match_meetings`

For Option B:

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select to_regclass('public.venues') as venues, to_regclass('public.match_meetings') as match_meetings;"
```

Expected:

- both are blank/null
- missing relations do not break the rewritten RPCs

- [ ] Run DB lint.

```powershell
npx supabase@latest db lint --local --fail-on error --workdir ".tmp\phase5-local-supabase"
```

Expected:

- No Category B relation errors for `public.match_meetings` or `public.venues`.
- If new errors appear, classify them separately instead of hiding them.

- [ ] Run security advisors.

```powershell
npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir ".tmp\phase5-local-supabase"
```

Expected:

- Existing unrelated search_path warnings may remain.
- New `venues` / `match_meetings` warnings must be explained and either fixed or explicitly accepted.

## Task 5: Runtime Smoke Checks

Run these only against `.tmp\phase5-local-supabase`.

- [ ] Confirm helper RPCs do not throw missing-relation errors.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select public.get_match_scheduled_reveal_at(gen_random_uuid()) as reveal_at;"
```

Expected:

- Returns one row with `NULL`.
- Does not throw `relation "public.match_meetings" does not exist`.

- [ ] Confirm meeting info helper is callable.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select * from public.get_match_meeting_info(gen_random_uuid());"
```

Expected:

- Returns zero rows.
- Does not throw `relation "public.match_meetings" does not exist`.
- Does not throw `relation "public.venues" does not exist`.

- [ ] Confirm reminder batch is callable.

```powershell
npx supabase@latest db query --local --workdir ".tmp\phase5-local-supabase" -o table "select * from public.enqueue_meeting_reminders();"
```

Expected:

- Returns the function's normal count/result shape.
- Does not throw missing-relation errors.

## Task 6: App Verification

Run:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

Expected:

- All pass.

Browser smoke is not required for a DB-only schema integration unless app build or tests fail. If the worker starts or restarts the dev server, use `http://localhost:3003/dev/preview`, `/group/create`, and `/match/start` as smoke targets.

## Task 7: Result Document

Create:

- `docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-result.md`

Include:

- chosen strategy: Option A or Option B
- exact files changed
- why the other option was not used
- source evidence from `origin/matching/group-engine`
- DB reset result
- DB lint result
- advisor result
- runtime smoke query results
- app verification results
- production touched: yes/no
- z54 touched: yes/no
- rollback plan
- remaining risks

Update:

- `docs/plans/CURRENT_IMPLEMENTATION_STATUS.md`

Do not update production status unless production was explicitly approved and actually touched.

## Rollback Criteria

Stop and report if:

- Docker is unavailable.
- `origin/matching/group-engine` no longer contains the expected Sungjun files.
- Sungjun schema lacks required columns.
- Importing the schema requires changing `matches`, `groups`, `profiles`, z54, auth, frontend, or API behavior.
- A direct copy of the original `20260516` migration is the only way forward.
- The new migration would need direct `anon` / `authenticated` table access without RLS.
- `db reset` fails twice for different migration reasons.
- `db lint` still reports `match_meetings` / `venues` relation errors after the chosen strategy.
- Any production command would be needed.

Rollback before commit:

```powershell
Remove-Item -LiteralPath "supabase\migrations\<phase5-new-migration>.sql"
Remove-Item -LiteralPath "docs\plans\2026-06-14-phase-5-category-b-meeting-schema-worker-result.md" -ErrorAction SilentlyContinue
git restore -- "docs/plans/CURRENT_IMPLEMENTATION_STATUS.md"
```

Rollback after commit:

```powershell
git revert <phase5_commit_sha>
```

No production rollback is required if the hard rule was followed.

## Recommended Manager Path

Recommended path:

1. Execute Option A inspection.
2. If the schema is safe, import Sungjun's real schema through a new current-branch migration.
3. If schema import is not safe, stop and ask the manager whether to use Option B dynamic guards.

Reason:

- The product actually needs meeting time/place data.
- Passing lint by hiding the dependency is useful only as a temporary bridge.

## Suggested Worker Prompt

```text
Start Phase 5. Follow docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-brief.md exactly.
Production Supabase must not be touched.
Do not modify z54 or Phase 4 migration.
Inspect origin/matching/group-engine first.
Prefer importing Sungjun's real venues/match_meetings schema through a new current-branch migration, not by copying the old 20260516 filename.
If schema import is blocked, stop and report before using dynamic guard rewrites.
Validate only in .tmp/phase5-local-supabase.
When complete, write docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-result.md and report back.
```

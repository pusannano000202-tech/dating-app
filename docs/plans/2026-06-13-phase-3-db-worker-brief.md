# Phase 3 Daily Card DB Worker Brief

> **For agentic workers:** REQUIRED SUB-SKILLS: use `supabase:supabase` for Supabase/SQL work and `superpowers:executing-plans` to execute this brief task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`를 안전하게 검토하고, 데일리카드가 `16:00-20:00` 사이 사용자 직접 뽑기 방식으로 DB에서 동작하는지 local/staging에서 검증한다.

**Architecture:** z54는 z53의 09:00 자동 공개형 `match_daily_card_schedule`을 사용자 draw-window 정책으로 확장한다. 기존 Next.js API는 이미 `get_match_daily_cards`와 `pick_match_daily_card` RPC를 호출하므로, Phase 3의 핵심은 DB 스키마/RPC/권한/시간창/중복방지/미선택 forfeited 처리가 실제 DB에서 안전하게 통과하는지 증명하는 것이다.

**Tech Stack:** Supabase Postgres, SQL migrations, RLS, Next.js API route `app/api/matches/[id]/daily-cards/route.ts`, Windows PowerShell.

---

## Manager Decision

2026-06-13 팀장방 기준:

- Phase 0~2 기준선은 `8046dc1 chore: establish phase 0-2 booting baseline`으로 커밋 완료됐다.
- 현재 남은 변경은 `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` 하나다.
- 데일리카드 정책은 `09:00 자동 공개`가 아니라 `16:00-20:00 사이 사용자가 직접 하루 카드 한 장을 뽑는 방식`이 최신 결정이다.
- 이 phase는 DB worker가 맡는다. 팀장방에서는 실제 DB 적용을 하지 않는다.
- production Supabase 적용은 금지다. 먼저 local 또는 disposable staging/branch DB에서 검증 보고서를 만든 뒤, 팀장방 승인 후에만 실제 적용 여부를 결정한다.

## Non-Goals

- Production DB에 migration 적용 금지.
- Supabase schema/RPC를 임의로 새로 설계하지 말 것.
- `lib/types.ts` 수정 금지.
- `docs/engineering/INTERFACE_CONTRACT.md` 수정 금지.
- 로그인/auth 정책 변경 금지.
- Daily card UI redesign 금지.
- 결제/환불/free-beta 정책 변경 금지.
- `z55`, `z56`, `z57` 등 다른 migration 수정 금지.

## Target Migration

검토 대상:

- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`

z54가 기대하는 DB 변경:

- `match_daily_card_schedule.day_offset` 범위를 `-7..-1`로 확장
- `match_daily_card_schedule`에 draw 상태 컬럼 추가
  - `reveal_window_start`
  - `reveal_window_end`
  - `selected_at`
  - `selected_by_user_id`
  - `selected_slot`
  - `forfeited_at`
- draw-window 조회 인덱스 추가
- `expire_missed_match_daily_cards(p_match_id)` 추가
- `assign_match_daily_card_schedule(p_match_id)` 재정의
- `pick_match_daily_card(p_match_id, p_selection_slot)` 추가
- `get_match_daily_cards(p_match_id)` 재정의

## Known Dependencies

z54는 아래 migration/객체가 먼저 적용되어 있어야 한다.

- `20260522_z36_connection_auto_reveal_on_meeting.sql`
  - `get_match_scheduled_reveal_at(p_match_id)`
- `20260602_z52_auto_match_member_aliases.sql`
  - `populate_match_member_aliases(p_match_id)`
  - `match_member_aliases`
- `20260602_z53_daily_card_schedule.sql`
  - `match_daily_card_schedule`
  - 기존 `assign_match_daily_card_schedule`
  - 기존 `get_match_daily_cards`
- core matching tables
  - `matches`
  - `groups`
  - `group_members`
  - `users`
  - `match_card_submissions`
  - 가능하면 `match_meetings`

## Safety Rules

- 실제 production DB에는 적용하지 않는다.
- local Supabase 또는 staging branch/disposable DB를 우선 사용한다.
- migration 적용 전 `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` 전체를 정적 리뷰한다.
- destructive statement가 있는지 먼저 확인한다.
- `DROP CONSTRAINT IF EXISTS`는 허용 후보지만, 같은 이름의 constraint를 다시 생성하는지 확인한다.
- `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, broad `UPDATE`가 있으면 즉시 중단하고 팀장방에 보고한다.
- `SECURITY DEFINER` 함수는 `SET search_path = public`이 붙어 있는지 확인한다.
- RLS 우회 위험이 있는 함수는 caller가 match participant인지 검증하는지 확인한다.
- `selected_by_user_id`가 `public.users(id)`를 참조하는 것이 현재 users 계약과 맞는지 확인한다.
- SQL 문자열 안 한글이 깨진 부분이 있으면 사용자 화면에 노출되는지 보고한다. DB 정책 검증과 별개로 copy cleanup 후보로 분리한다.
- 적용 검증 전후에 `git status --short`를 기록한다.

## Current Tooling Note

팀장방에서 확인한 현재 PC PATH 상태:

- `supabase`: not found
- `psql`: not found
- `docker`: not found

worker는 시작 시 다시 확인해야 한다. 도구가 계속 없으면 Supabase MCP/connector 또는 원격 staging SQL console 사용 가능 여부를 확인하고, 어떤 환경에서 검증했는지 결과 문서에 명확히 적는다.

## Task 1: Preflight Snapshot

- [ ] **Step 1: Confirm git baseline**

Run:

```powershell
git rev-parse --short HEAD
git status --short
```

Expected:

- HEAD is `8046dc1` or a later manager-approved baseline.
- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` is present and not already committed unless manager says otherwise.

- [ ] **Step 2: Confirm DB tooling**

Run:

```powershell
Get-Command supabase -ErrorAction SilentlyContinue
Get-Command psql -ErrorAction SilentlyContinue
Get-Command docker -ErrorAction SilentlyContinue
```

If available, also run:

```powershell
supabase --version
supabase --help
supabase db --help
```

Expected:

- Worker records which DB path will be used: local Supabase, staging branch, Supabase SQL editor/MCP, or blocked due to missing access.

- [ ] **Step 3: Confirm no production target**

Before any SQL execution, identify the target DB/project/ref. If the target is production or ambiguous, stop and report.

## Task 2: Static SQL Review

- [ ] **Step 1: Read z53 and z54 together**

Files:

- `supabase/migrations/20260602_z53_daily_card_schedule.sql`
- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`

Check:

- z54 safely upgrades z53 instead of creating a conflicting second table.
- `day_offset` constraint becomes `BETWEEN -7 AND -1`.
- Added columns use `IF NOT EXISTS`.
- New index uses `IF NOT EXISTS`.
- `assign_match_daily_card_schedule` remains idempotent for repeated calls.
- `get_match_daily_cards` still enforces caller auth and match participation.
- `pick_match_daily_card` enforces caller auth and match participation.
- `pick_match_daily_card` prevents duplicate picks by filtering `selected_at IS NULL` and locking with `FOR UPDATE`.
- `expire_missed_match_daily_cards` only marks unpicked expired cards for the given `match_id`.

- [ ] **Step 2: Check function grants**

Confirm these RPCs are executable by authenticated users after z54:

- `assign_match_daily_card_schedule(UUID)`
- `get_match_daily_cards(UUID)`
- `expire_missed_match_daily_cards(UUID)`
- `pick_match_daily_card(UUID, SMALLINT)`

Note: z54 explicitly grants `expire_missed_match_daily_cards` and `pick_match_daily_card`. z53 previously granted `assign_match_daily_card_schedule` and `get_match_daily_cards`; worker must verify these grants survive `CREATE OR REPLACE FUNCTION`.

- [ ] **Step 3: Check UI/API contract**

Relevant API file:

- `app/api/matches/[id]/daily-cards/route.ts`

The DB result must support:

- GET returns `{ cards: [...] }` from `get_match_daily_cards`
- POST accepts `{ selected_slot?: number }`
- POST calls `pick_match_daily_card`
- selected slot is clamped by API to `1..5`

Expected z54 result fields:

- `id`
- `day_offset`
- `reveal_at`
- `reveal_window_start`
- `reveal_window_end`
- `revealed`
- `can_pick`
- `selected_at`
- `forfeited_at`
- `alias`
- `card_kind`
- `title`
- `content_text`

If DB returns a different shape, report before changing code.

## Task 3: Apply Only To Local/Staging

Do this only after Task 1 and Task 2 pass.

- [ ] **Step 1: Choose validation environment**

Preferred order:

1. Local Supabase DB reset/apply.
2. Disposable Supabase branch/staging DB.
3. Supabase SQL editor/MCP against a non-production project.

Do not use production.

- [ ] **Step 2: Apply migration in the chosen validation DB**

Use the available official path for the environment. Examples:

```powershell
# If local Supabase CLI is available and configured:
supabase migration list
supabase db reset
```

or:

```powershell
# If psql is available against a disposable/staging DB:
psql "$env:SUPABASE_DB_URL" -f "supabase/migrations/20260602_z54_daily_card_draw_policy.sql"
```

If using Supabase SQL editor/MCP, execute only against non-production and paste the executed SQL source/path into the result report.

- [ ] **Step 3: Record migration status**

Run the environment equivalent of:

```powershell
supabase migration list
```

Expected:

- z54 appears applied only in the validation environment.
- No production migration history changed.

## Task 4: Schema Verification Queries

Run these or equivalent queries in the validation DB.

- [ ] **Step 1: Verify columns**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'match_daily_card_schedule'
  and column_name in (
    'reveal_window_start',
    'reveal_window_end',
    'selected_at',
    'selected_by_user_id',
    'selected_slot',
    'forfeited_at'
  )
order by column_name;
```

Expected: all 6 columns exist.

- [ ] **Step 2: Verify day offset constraint**

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.match_daily_card_schedule'::regclass
  and conname = 'match_daily_card_schedule_day_offset_check';
```

Expected: `day_offset >= -7` and `day_offset <= -1` semantics.

- [ ] **Step 3: Verify functions**

```sql
select proname, pg_get_function_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'assign_match_daily_card_schedule',
    'get_match_daily_cards',
    'pick_match_daily_card',
    'expire_missed_match_daily_cards'
  )
order by proname;
```

Expected: all four functions exist with expected arguments.

- [ ] **Step 4: Verify grants**

```sql
select routine_name, privilege_type, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'assign_match_daily_card_schedule',
    'get_match_daily_cards',
    'pick_match_daily_card',
    'expire_missed_match_daily_cards'
  )
  and grantee in ('authenticated', 'anon')
order by routine_name, grantee, privilege_type;
```

Expected:

- `authenticated` has execute access for all required RPCs.
- `anon` should not need execute access.

## Task 5: Behavioral DB Tests

Use existing fixture data if the validation DB already has a test match with:

- two groups
- active group members
- a scheduled meeting time from `get_match_scheduled_reveal_at`
- member aliases
- optional `match_card_submissions`

If fixture data is missing, create a synthetic test fixture inside a transaction or disposable DB only. Do not write fixture rows to production.

- [ ] **Step 1: Schedule assignment creates draw windows**

Call:

```sql
select public.assign_match_daily_card_schedule('<TEST_MATCH_ID>'::uuid);
```

Then inspect:

```sql
select
  day_offset,
  extract(hour from reveal_window_start at time zone 'Asia/Seoul') as start_hour_kst,
  extract(hour from reveal_window_end at time zone 'Asia/Seoul') as end_hour_kst,
  reveal_at,
  reveal_window_start,
  reveal_window_end
from public.match_daily_card_schedule
where match_id = '<TEST_MATCH_ID>'::uuid
order by viewer_group_id, day_offset;
```

Expected:

- rows exist for both viewer groups.
- day offsets are in `-7..-1`.
- window start is 16:00 KST.
- window end is 20:00 KST.
- repeated `assign_match_daily_card_schedule` does not create duplicate rows.

- [ ] **Step 2: GET hides content before selection**

As a match participant, call `get_match_daily_cards`.

Expected:

- cards return for caller's viewer group only.
- `content_text` is `null` until `selected_at` is set.
- `can_pick` is true only inside the current 16:00-20:00 window for an unselected/unforfeited card.

- [ ] **Step 3: POST pick records one card**

As a match participant inside a test draw window, call:

```sql
select *
from public.pick_match_daily_card('<TEST_MATCH_ID>'::uuid, 3::smallint);
```

Expected:

- one card is returned.
- returned row has `selected_at` not null.
- `selected_slot = 3` in table state.
- `selected_by_user_id = auth.uid()`.
- `can_pick = false` after selection.
- `content_text` is visible only after selection.

- [ ] **Step 4: Duplicate pick is blocked**

Call `pick_match_daily_card` again for the same participant/group and same available day.

Expected:

- no second card is selected for the same available window.
- function raises `no_draw_available` or returns no new card, depending on fixture state.
- DB table still has only one newly selected row for that viewer group/window.

- [ ] **Step 5: Missed cards are forfeited**

Use an expired test row where:

- `selected_at IS NULL`
- `forfeited_at IS NULL`
- `reveal_window_end < now()`

Call:

```sql
select public.expire_missed_match_daily_cards('<TEST_MATCH_ID>'::uuid);
```

Expected:

- expired unselected cards get `forfeited_at`.
- selected cards are not forfeited.
- future cards are not forfeited.

- [ ] **Step 6: Unauthorized access is blocked**

As a user who is not in either group for the match, call:

- `get_match_daily_cards`
- `pick_match_daily_card`

Expected:

- both fail with `not_match_participant`.

## Task 6: API/Frontend Smoke Test

Run this only against local/staging DB wired to the local app.

- [ ] **Step 1: Start or reuse local app**

```powershell
npm run dev -- -p 3003
```

- [ ] **Step 2: GET endpoint**

Call the app as an authenticated test participant:

```text
GET /api/matches/<TEST_MATCH_ID>/daily-cards
```

Expected:

- status 200
- response shape `{ "cards": [...] }`
- cards include `can_pick`, `selected_at`, `forfeited_at`, and `reveal_window_*`.

- [ ] **Step 3: POST endpoint**

Call:

```text
POST /api/matches/<TEST_MATCH_ID>/daily-cards
body: { "selected_slot": 3 }
```

Expected:

- status 200 inside draw window, or controlled 400 with `no_draw_available` outside draw window.
- no server error caused by missing RPC.

- [ ] **Step 4: `/match/[id]` UI**

Open:

```text
http://localhost:3003/match/<TEST_MATCH_ID>
```

Expected:

- no page crash.
- daily card area can represent locked, pickable, selected, and forfeited states.
- outside 16:00-20:00, UI/error copy indicates not pickable rather than failing silently.

## Task 7: App-Level Regression Commands

After DB validation, run:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:matching
npm run build
```

Expected:

- all pass.
- If build restarts/breaks the dev server, restart `localhost:3003` and smoke-check `/dev/preview`, `/group/create`, `/match/start`, and a match detail route if a test match exists.

## Rollback Criteria

Rollback or stop immediately if any of these happen:

- Migration is accidentally pointed at production.
- Any destructive statement targets live user data.
- z54 cannot be applied after z53 without SQL error.
- Required columns/functions/grants are missing after apply.
- `get_match_daily_cards` or `pick_match_daily_card` bypasses participant checks.
- 16:00-20:00 KST window is not represented correctly.
- Duplicate picking is possible for the same viewer group/window.
- Missed unselected cards are not forfeited after window end.
- Existing `GET /api/matches/[id]/daily-cards` crashes after z54.
- `npm run build` fails due to the DB/API contract change.

## Rollback Plan

Use the smallest rollback that matches where the migration was applied.

### If not applied anywhere

- Do not stage/commit z54.
- Report static review blockers.

### If applied only to local disposable DB

- Reset local DB.
- Do not commit z54 until the blocker is fixed.

Example:

```powershell
supabase db reset
```

### If applied to staging/disposable branch

- Reset or delete the staging branch/environment.
- If reset is not possible, apply a staging-only rollback SQL after manager approval.

### If accidentally applied to persistent non-production DB

Do not drop data blindly. First export/backup affected rows:

```sql
select *
from public.match_daily_card_schedule
where reveal_window_start is not null
   or selected_at is not null
   or forfeited_at is not null;
```

Then decide with team manager:

- restore previous function definitions from z53, or
- keep added columns but disable new pick behavior by reverting RPC definitions, or
- drop added columns only if there is confirmed no data to preserve.

### If accidentally applied to production

- Stop.
- Report immediately to team manager.
- Capture migration history, affected functions, affected rows, and exact timestamp.
- Do not run ad hoc rollback SQL until backup/export is confirmed.

## Required Result Report

Create:

- `docs/plans/2026-06-13-phase-3-db-worker-result.md`

Report format:

```md
# Phase 3 Daily Card DB Worker Result

## Summary
- Status: PASS / BLOCKED / DONE_WITH_CONCERNS
- Validation DB: local / staging branch / Supabase SQL editor / blocked
- Production touched: no

## Static Review
- z54 destructive statements:
- z53 compatibility:
- grants:
- security definer / RLS notes:
- copy/encoding notes:

## DB Verification
- columns:
- constraint:
- functions:
- grants:
- assign schedule:
- get cards:
- pick card:
- duplicate prevention:
- missed forfeiture:
- unauthorized access:

## App Verification
- typecheck:
- lint:
- test:config:
- test:matching:
- build:
- API smoke:
- browser smoke:

## Rollback Readiness
- backup needed:
- rollback path:

## Blockers / Follow-Up
- ...
```

## Acceptance Criteria

Phase 3 can be marked ready for manager review only when:

- z54 is statically reviewed against z53.
- Validation environment is explicitly non-production.
- DB schema checks pass.
- RPC existence and grants checks pass.
- 16:00-20:00 draw window is verified.
- one-pick-per-window behavior is verified.
- missed-card forfeiture is verified.
- unauthorized user access is blocked.
- Next.js API route is smoke-tested against a DB where z54 exists.
- standard app verification commands pass or failures are documented with exact cause.
- result report exists.

## Suggested Worker Start Command

```text
Phase 3 시작. docs/plans/2026-06-13-phase-3-db-worker-brief.md 지시서 그대로 진행해.
production Supabase에는 절대 적용하지 말고, local 또는 disposable staging에서만 z54를 검토/검증해.
Supabase/psql/docker 도구 여부부터 확인하고, 없으면 어떤 검증이 막히는지 보고해.
완료되면 docs/plans/2026-06-13-phase-3-db-worker-result.md에 결과를 남기고, 변경사항/검증결과/문제점을 취합해서 보고해.
```

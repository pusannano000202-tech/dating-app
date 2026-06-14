# Phase 3 Daily Card DB Worker Result

## Summary

- Status: DONE_FOR_Z54_WITH_LEGACY_LINT_REMAINING
- Validation DB: local Supabase in `.tmp/phase3-local-supabase`
- Production touched: no
- Source migration changed: `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`
- Target policy: user-driven daily card draw window, KST 16:00-20:00

Phase 3 z54 has been patched in source and revalidated in a disposable local Supabase project. The z54-specific blockers found in the previous validation pass are fixed.

Production Supabase was not touched.

## Source z54 Fixes Applied

File:

- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`

Changes:

- Added `DROP FUNCTION IF EXISTS public.get_match_daily_cards(UUID);` before recreating `get_match_daily_cards`.
- Re-added `GRANT EXECUTE ON FUNCTION public.get_match_daily_cards(UUID) TO authenticated;`.
- Qualified three ambiguous match lookups:
  - `matches.id = p_match_id` in `assign_match_daily_card_schedule`.
  - `matches.id = p_match_id` in `pick_match_daily_card`.
  - `matches.id = p_match_id` in `get_match_daily_cards`.
- Changed daily-card assignment window calculation from UTC day truncation to explicit Korea-local date calculation:
  - Convert `v_scheduled_at` to `Asia/Seoul`.
  - Build each D-7..D-1 local date at 16:00 and 20:00.
  - Convert those local timestamps back to `TIMESTAMPTZ` for storage.

## Local Validation Setup

- Rebuilt `.tmp/phase3-local-supabase` from the current source migrations.
- Copied all 55 source migrations into `.tmp/phase3-local-supabase/supabase/migrations`.
- Rewrote copied migration prefixes to unique local-only versions `202606140001` through `202606140055`.
- Wrote the local mapping to `.tmp/phase3-local-supabase/migration-map.txt`.

Reason for the `.tmp` project:

- The source migration directory still has duplicate numeric migration versions.
- Supabase CLI uses the numeric prefix as the migration version.
- Duplicate versions prevent clean local reset/start from the source directory.
- The `.tmp` project preserves order while avoiding local CLI version collisions.

Duplicate source prefixes observed:

- `20260514`: 2 files
- `20260515`: 2 files
- `20260521`: 23 files
- `20260522`: 18 files
- `20260602`: 8 files

## Temporary-Only Compatibility Patches

These were applied only inside `.tmp/phase3-local-supabase` to let the full historical migration stack replay. They are not part of the z54 source fix.

### z30

File:

- `.tmp/phase3-local-supabase/supabase/migrations/202606140028_z30_match_two_sided_confirm.sql`

Temporary patch:

- Added `DROP FUNCTION IF EXISTS public.confirm_match(UUID);`

Reason:

- z29 defines `confirm_match(UUID)` with a different return shape.
- Postgres cannot `CREATE OR REPLACE` a function when OUT parameters change.

### z49

File:

- `.tmp/phase3-local-supabase/supabase/migrations/202606140047_z49_preferred_personality_vector.sql`

Temporary patch:

- Replaced `CREATE OR REPLACE VIEW public.profiles_public AS` with drop and recreate.

Reason:

- Postgres cannot `CREATE OR REPLACE VIEW` when the view column shape/name changes.

## DB Verification

Commands/tools:

- `npx supabase@latest --version`: `2.106.0`
- `npx supabase@latest start --workdir .tmp\phase3-local-supabase --ignore-health-check`: pass
- `npx supabase@latest db reset --local --workdir .tmp\phase3-local-supabase`: pass
- `npx supabase@latest migration list --local --workdir .tmp\phase3-local-supabase`: all local versions `202606140001` through `202606140055` applied

Verified schema:

- `match_daily_card_schedule` contains z54 columns:
  - `reveal_window_start`
  - `reveal_window_end`
  - `selected_at`
  - `selected_by_user_id`
  - `selected_slot`
  - `forfeited_at`
- `match_daily_card_schedule_day_offset_check` is `day_offset >= -7 AND day_offset <= -1`.
- Functions exist:
  - `assign_match_daily_card_schedule(UUID)`
  - `get_match_daily_cards(UUID)`
  - `pick_match_daily_card(UUID, SMALLINT)`
  - `expire_missed_match_daily_cards(UUID)`
- `authenticated` has EXECUTE grants for all four functions above.

## Behavior Verification

Fixture:

- Created a local-only `public.match_meetings` fixture table because the current source migration stack does not create that table.
- Inserted local-only users, groups, one confirmed match, one meeting, and card submissions.
- `assign_match_daily_card_schedule(...)` created 14 schedule rows: 2 viewer groups x 7 day offsets.

Verified behavior:

- Before picking, `get_match_daily_cards(...)` returns 7 rows for the participant viewer group.
- Card content stays hidden before selection.
- A currently open card returns `can_pick = true`.
- `pick_match_daily_card(..., 3)` selects one card and returns the counterpart card content.
- Selected row records:
  - `selected_at`
  - `selected_by_user_id`
  - `selected_slot = 3`
- Duplicate pick is blocked with `no_draw_available`.
- Missed card expiry marks an unpicked expired card as forfeited.
- Non-participant access is blocked:
  - `get_match_daily_cards(...)` -> `not_match_participant`
  - `pick_match_daily_card(...)` -> `not_match_participant`

## KST Window Verification

The previous bug was UTC 16:00-20:00 being interpreted by users as KST 01:00-05:00.

After the source z54 fix:

- Unmodified assigned rows now store as UTC 07:00-11:00.
- The same rows render as KST 16:00-20:00.

Evidence from local schedule rows after fixture and behavior test:

- day offsets `-5` through `-1`
  - UTC: `07:00`-`11:00`
  - KST: `16:00`-`20:00`

Note:

- day offsets `-7` and `-6` were intentionally modified by the behavior test to simulate an open draw window and an expired draw window, so they are not used for assignment-window judgment.

## App Verification

Passed after DB validation:

- `npm run typecheck`
- `npm run lint`
- `npm run test:config` - 22/22 passed
- `npm run test:matching` - 25/25 passed
- `npm run build`

Not completed:

- API smoke against the local `.tmp` Supabase DB.

Reason:

- `.env.local` still points at the existing remote Supabase project.
- This phase did not silently rewrite app environment variables.

## DB Lint / Advisors

`npx supabase@latest db lint --local --fail-on error --workdir .tmp\phase3-local-supabase` failed, but the reported errors are existing legacy/cross-branch issues outside z54:

- ambiguous references in legacy functions such as `leave_group`, `accept_friend_request`, `mock_pay_deposit`, `disband_group`, `get_friend_request_summaries`, and `transfer_group_leadership`
- missing cross-branch tables such as `public.venues` for meeting/check-in helpers

The z54 functions were not reported in the lint failures.

`npx supabase@latest db advisors --local --type security --level warn --fail-on none --workdir .tmp\phase3-local-supabase` completed with existing warnings for functions without fixed `search_path`, again outside z54.

## Rollback Readiness

No rollback was required because production and persistent staging were not touched.

If z54 is later applied to a persistent non-production DB:

- Take a backup/snapshot first.
- Back up `match_daily_card_schedule` rows including:
  - `match_id`
  - `viewer_group_id`
  - `day_offset`
  - `reveal_window_start`
  - `reveal_window_end`
  - `selected_at`
  - `selected_by_user_id`
  - `selected_slot`
  - `forfeited_at`

## Recommended Next Step

z54 is locally validated for the Phase 3 daily-card policy.

Recommended next action:

1. Review the source z54 diff.
2. Decide whether to commit the Phase 3 z54 source fix plus updated docs.
3. Do not apply to production yet.
4. Before production, run the same migration validation against a disposable staging branch or a reviewed Supabase preview/staging project.

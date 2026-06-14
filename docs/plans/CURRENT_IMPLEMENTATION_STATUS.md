# Current Implementation Status

Last updated: 2026-06-14

## Current Product Decisions (2026-06-12)

- Local design review uses `/dev/preview`; protected onboarding screens must not bounce back to login during preview.
- MVP auth follows the current email verification/email OTP direction. Phone OTP remains a later review item from the older AGENTS stack note.
- Preference weights are now 4 keys only: appearance, personality, height, body_type.
- Daily cards use a user-driven 16:00-20:00 draw window, not a 09:00 automatic reveal.
- Initial launch is a free beta. Deposit/refund/app-fee settlement UX is disabled in user-facing screens; existing deposit/refund DB objects remain as legacy compatibility until a cleanup migration replaces them.
- New daily-card DB changes are separated into a DB worker/phase instead of being mixed into frontend/UI cleanup.

## Phase 0 Audit Snapshot (2026-06-13)

Reference: `docs/plans/2026-06-13-phase-0-current-state-audit.md`.

- Current dirty working tree is a mixed bundle, not one feature: Booting UI, dev preview, auth changes, 4-key preference weights, matching gate, free beta UX, daily card draw policy, group/queue UI, and planning docs.
- Fresh verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`.
- Browser check passed on `http://localhost:3003` for `/`, `/dev/preview`, `/match/start`, `/profile/preferences`, and `/group/create`.
- Queue radar appears after `/group/create?from=home-queue` -> `이번 주 매칭 큐에 들어가기`.
- Fresh `npm run build` was not rerun during Phase 0 to avoid interrupting the active dev server; run it before a PR/merge decision.

## Phase 1 Verification Snapshot (2026-06-13)

Reference: `docs/plans/2026-06-13-phase-1-group-create-refactor-worker-brief.md`.

- Phase 1 worker refactored `app/group/create/page.tsx` without an intentional user-facing behavior change.
- `app/group/create/page.tsx` is now 639 lines; before Phase 1 it was 1,137 lines.
- New group-create UI/support files live under `components/matching/group-create/`.
- Fresh verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`.
- Fresh `npm run build` passed after Phase 1 verification.
- Browser check passed on `http://localhost:3003` for `/group/create`, `/group/create?from=home-queue`, and `/match/start`.
- Queue radar still appears after `/group/create?from=home-queue` -> `이번 주 매칭 큐에 들어가기`.
- The build temporarily broke the already-running dev server; `localhost:3003` was restarted and `/dev/preview`, `/group/create` render correctly again.

## Phase 2 Cleanup Snapshot (2026-06-13)

Reference: `docs/plans/2026-06-13-phase-2-cleanup-result.md`.

- Removed unused `PreferenceSliders` and `DestinyLogo` components after active import search.
- Removed debug-only `app/debug/sanji/page.tsx`; preserved `components/SanjiCharacter.tsx` because the refund page still uses it.
- Moved the internet debate question pool from the repo root into `docs/product/matching/`.
- Fresh verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`, `npm run build`.
- `localhost:3003` was restarted after build. Team-manager browser smoke checks passed for `/dev/preview`, `/group/create`, and `/match/start`; `/match/start` renders the exact `매칭찾기 준비 완료` copy.

## Phase 3 DB Worker Snapshot (2026-06-13)

Reference: `docs/plans/2026-06-13-phase-3-db-worker-result.md`.

- Phase 3 local DB validation was resumed and re-run in a disposable `.tmp/phase3-local-supabase` project.
- Status: DONE_FOR_Z54_WITH_LEGACY_LINT_REMAINING.
- Production Supabase was not touched.
- Source z54 was patched directly: `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`.
- The `.tmp` project rewrote copied migration prefixes to unique local-only versions to bypass duplicate source migration version conflicts.
- Local Supabase migration reset/list succeeded with versions `202606140001` through `202606140055`.
- Runtime schema checks passed for z54 columns, day-offset constraint, functions, and authenticated EXECUTE grants.
- Runtime behavior checks passed for assignment, hidden content before draw, user pick, duplicate-pick blocking, missed-card forfeiture, and outsider blocking.
- KST draw-window verification passed: unmodified assigned rows store as UTC 07:00-11:00 and render as KST 16:00-20:00.
- App verification passed after DB validation: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`, `npm run build`.
- Supabase `db lint --local --fail-on error` still fails on existing legacy/cross-branch functions outside z54; z54 functions were not part of the lint failures.

## Phase 4 DB Lint Cleanup Snapshot (2026-06-14)

Reference: `docs/plans/2026-06-14-phase-4-db-lint-cleanup-worker-result.md`.

- Status: DONE_FOR_CATEGORY_A_WITH_CATEGORY_B_DEPENDENCY_REMAINING.
- Production Supabase was not touched.
- z54 was not modified; SHA-256 stayed `7FFA30BAC15DDE0CDD265873CEA65D622BE23E2C23A797E3D4C5BB5B51E20A4B`.
- New corrective migration: `supabase/migrations/20260614121354_phase_4_db_lint_cleanup.sql`.
- Fixed Category A legacy ambiguous-reference lint errors in `accept_friend_request`, `mock_pay_deposit`, `leave_group`, `disband_group`, `get_friend_request_summaries`, and `transfer_group_leadership`.
- `.tmp/phase4-local-supabase` replayed migrations successfully through the local-only Phase 4 copy.
- `db lint --local --fail-on error` now fails only on Category B `match_meetings` / `venues` cross-branch schema dependency errors.
- App verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`, `npm run build`.

## Phase 5 Meeting Schema Integration Snapshot (2026-06-14)

Reference: `docs/plans/2026-06-14-phase-5-category-b-meeting-schema-worker-result.md`.

- Status: DONE_WITH_CONCERNS.
- Production Supabase was not touched.
- z54 was not modified; SHA-256 stayed `7FFA30BAC15DDE0CDD265873CEA65D622BE23E2C23A797E3D4C5BB5B51E20A4B`.
- Phase 4 migration was not modified; SHA-256 stayed `8ED86FF0284BE988F0DBF7D556A4D5DDE68E533C1C57464F6AF9B13433303493`.
- New source migration: `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql`.
- Chosen strategy: Option A, importing Sungjun's real `venues` / `match_meetings` schema from `origin/matching/group-engine` through a current-branch timestamped migration.
- Option B dynamic guard rewrites were not used because the real schema import was not blocked.
- `.tmp/phase5-local-supabase` replayed migrations successfully through local-only Phase 5 copy `202606140157_phase_5_meeting_schema_integration.sql`.
- `db lint --local --fail-on error` passed. Remaining lint output is non-failing existing warning-extra variables in `mock_pay_deposit` and `leave_group`.
- Security advisors completed with existing unrelated `function_search_path_mutable` warnings and no new `venues` / `match_meetings` warning.
- Runtime smoke checks passed for `get_match_scheduled_reveal_at`, `get_match_meeting_info`, and `enqueue_meeting_reminders`.
- App verification passed: `npm run typecheck`, `npm run lint`, `npm run test:config`, `npm run test:matching`, `npm run build`.
- Verification caveats: first local reset needed a local-only `supabase start`; raw `to_regclass(...)` table output hit a Supabase CLI regclass scan issue, so the relation check was verified with `::text` casts.

## Phase 6 Sungjun Alignment Snapshot (2026-06-14)

Reference: `docs/plans/2026-06-14-phase-6-sungjun-github-alignment-audit-result.md`.

- Status: DONE_FOR_LOCAL_FRONTEND_REVIEW_WITH_CHAT_HELD.
- Production Supabase was not touched.
- Sungjun's `origin/main` and `origin/matching/group-engine` were reviewed in read-only worktrees.
- Direct `gwating-app/` replacement was rejected because it would create a second app/data model.
- Adopted from Sungjun: `venues` / `match_meetings` through Phase 5, plus the minimal Booting home direction.
- Adapted in root app: `/`, `/dev/preview`, `/group/create`, `/match/start`, `/match`, and matching/home supporting components.
- Held: chat UI/schema, Q&A reveal details, schedule/venue assignment logic, admin score explanation UX.
- Rejected direct import: `teams`, `team_members`, open anon `chat_messages`, and prototype seed teams.
- Local dev server is running at `http://localhost:3003`.
- CDP browser verification passed on `/dev/preview`, `/`, `/group/create`, `/group/create?from=home-queue`, `/match/start`, and `/match`.
- `/group/create` click verification passed: `이번 주 매칭 큐에 들어가기` renders the queue radar completion screen.
- Mobile overflow check passed on the verified routes.

## Active Next Phase

- Phase 6 local frontend review baseline is complete.
- Production DB apply is still not approved.
- Before any production or staging apply, review the Phase 5 schema ownership/security tradeoff and rerun validation in the approved target environment.
- Next product/backend work: implement the meeting assignment path that creates `match_meetings` rows after match confirmation, plus explicit Data API grants/RLS only if a concrete UI path requires direct table access.

## Completed

- Queue entry is now presented as a free beta participation flow.
- Legacy deposit/refund DB objects still exist, but user-facing screens should not ask for payment during the free beta.
- Match detail now supports: card submission -> free beta participation confirmation -> leader confirmation.
- Server confirmation still has legacy deposit compatibility in places and needs a cleanup migration before production.
- Group anonymous alias schema/helper exists for the future daily reveal layer.
- New matches automatically populate counterpart member aliases for both viewer groups.
- Scheduled matches create D-6..D-1 daily anonymous card reveal rows and expose them through the match detail UI.

## Implemented Files

- `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`
- `supabase/migrations/20260602_z51_match_card_confirmation_gate.sql`
- `supabase/migrations/20260602_z52_auto_match_member_aliases.sql`
- `supabase/migrations/20260602_z53_daily_card_schedule.sql`
- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` (patched and locally validated in `.tmp`; production apply still not approved)
- `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql` (locally validated in `.tmp`; production apply still not approved)
- `app/group/create/page.tsx`
- `app/match/[id]/page.tsx`
- `app/api/matches/[id]/card/route.ts`
- `app/api/matches/[id]/daily-cards/route.ts`
- `lib/matching/member-alias.ts`
- `tests/matching/member-alias.test.ts`

## Remaining Follow-Up

- Split user card submissions into structured per-topic cards instead of one freeform MVP card.
- Replace mock deposit payment with the real Toss Payments flow.

## Operator Console (2026-06-02)

Plan: `docs/plans/2026-06-02-operator-console-plan.md`. `/admin` 운영자 콘솔로 매칭 승인·근거 보고·외모 점수 보정 통합.

Done:

- `/admin` shell + `is_admin()` guard (`app/admin/layout.tsx`, middleware `/admin` protection; local dev bypass).
- Match approval gate: `matches.approval_status`(pending_review/approved/rejected) + RLS + `get_my_matches`/`get_match_detail` filter (z55).
- `app_config` runtime toggle `match_requires_approval` + get/set RPC (z55).
- Admin match review: `admin_list_pending_matches` / `admin_get_match_review` / `admin_review_match` (z57) + UI (`/admin/matches/review`, `/admin/matches/[id]`, `/admin` dashboard).
- Appearance override: `appearance_score_audits` + `admin_set/clear_appearance_override` + `admin_get_user_profile` (z56) + UI (`/admin/users/[id]`).
- Greedy assignment helper `lib/matching/assign.ts` + tests.
- Migrations: `z55_match_approval_gate`, `z56_admin_appearance_override`, `z57_admin_match_review`.

Implemented Files (operator console):

- `supabase/migrations/20260602_z55_match_approval_gate.sql`
- `supabase/migrations/20260602_z56_admin_appearance_override.sql`
- `supabase/migrations/20260602_z57_admin_match_review.sql`
- `app/admin/{layout,page}.tsx`, `app/admin/matches/review/page.tsx`, `app/admin/matches/[id]/page.tsx`, `app/admin/users/[id]/page.tsx`
- `app/api/admin/**` (matches/pending, matches/[id], matches/[id]/review, matches/create, users/[id], users/[id]/appearance-override, config)
- `lib/matching/assign.ts`, `tests/matching/assign.test.ts`

Remaining (external deps):

- GPT scoring pipeline to fill `self_appearance_score_auto` (needs OpenAI key).
- Batch runner pool loader (`match_pool` → `GroupSummary`) + `/api/admin/run-batch` (needs live DB schema verification). `admin_create_pending_match` RPC + `assign.ts` already in place.

Verification: `npm run typecheck` PASS, `npm run build` PASS, `npm run test:matching` 22/22, `verify-migrations.py` (operator-console migrations: 0 issues).

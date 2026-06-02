# Current Implementation Status

Last updated: 2026-06-02

## Completed

- Queue entry no longer requires a paid deposit.
- Deposit amount is 10,000 KRW per person, so a 3-person group pays 30,000 KRW total.
- Match detail now supports: card submission -> deposit payment -> leader confirmation.
- Server confirmation is gated by all active members in the caller group having submitted cards and paid/held deposits.
- Group anonymous alias schema/helper exists for the future daily reveal layer.
- New matches automatically populate counterpart member aliases for both viewer groups.
- Scheduled matches create D-6..D-1 daily anonymous card reveal rows and expose them through the match detail UI.

## Implemented Files

- `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`
- `supabase/migrations/20260602_z51_match_card_confirmation_gate.sql`
- `supabase/migrations/20260602_z52_auto_match_member_aliases.sql`
- `supabase/migrations/20260602_z53_daily_card_schedule.sql`
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

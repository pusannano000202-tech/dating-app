# Current Implementation Status

Last updated: 2026-06-02

## Completed

- Queue entry no longer requires a paid deposit.
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

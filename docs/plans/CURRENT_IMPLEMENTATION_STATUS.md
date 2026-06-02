# Current Implementation Status

Last updated: 2026-06-02

## Completed

- Queue entry no longer requires a paid deposit.
- Match detail now supports: card submission -> deposit payment -> leader confirmation.
- Server confirmation is gated by all active members in the caller group having submitted cards and paid/held deposits.
- Group anonymous alias schema/helper exists for the future daily reveal layer.

## Implemented Files

- `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`
- `supabase/migrations/20260602_z51_match_card_confirmation_gate.sql`
- `app/group/create/page.tsx`
- `app/match/[id]/page.tsx`
- `app/api/matches/[id]/card/route.ts`
- `lib/matching/member-alias.ts`
- `tests/matching/member-alias.test.ts`

## Remaining Follow-Up

- Automatically populate `match_member_aliases` when a match is created.
- Build the daily reveal schedule and card calendar UI.
- Replace mock deposit payment with the real Toss Payments flow.

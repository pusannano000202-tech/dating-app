# Card-Then-Deposit Match Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the match flow so groups can enter the queue before paying deposits, then complete cards and deposits after a provisional match is created.

**Architecture:** Keep current group and match APIs, but move deposit enforcement out of `enter_match_pool` and into the post-match confirmation phase. Add a central planning hub under `docs/plans/` and introduce DB helpers for per-member anonymous aliases used by daily cards.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres/RPC migrations, Node test runner.

---

## File Structure

- `docs/plans/README.md`: central plan folder entry point.
- `docs/plans/ACTIVE_PLAN_INDEX.md`: current planning index.
- `docs/plans/2026-06-02-proposed-match-card-deposit-flow.md`: approved product design.
- `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`: database transition for queue entry, aliases, and provisional match metadata.
- `supabase/migrations/20260602_z51_match_card_confirmation_gate.sql`: card submission table and confirmation gate.
- `app/group/create/page.tsx`: remove up-front deposit CTA from queue entry and explain deposit happens after match.
- `app/api/match-pool/enter/route.ts`: same endpoint, relies on updated RPC.
- `app/api/matches/[id]/card/route.ts`: save/read my post-match card.
- `app/match/[id]/page.tsx`: post-match card, deposit, and confirmation readiness UI.
- `lib/matching/member-alias.ts`: deterministic alias pool helper for future tests/UI.
- `tests/matching/member-alias.test.ts`: alias generation regression tests.

## Task 1: Organize Plans

**Files:**
- Create: `docs/plans/README.md`
- Create: `docs/plans/ACTIVE_PLAN_INDEX.md`
- Create: `docs/plans/2026-06-02-proposed-match-card-deposit-flow.md`
- Create: `docs/plans/2026-06-02-card-deposit-flow-implementation-plan.md`

- [x] **Step 1: Create central plan folder and index**

Use the files listed above. The index must state that `docs/plans/` is the canonical entry point for active plans.

- [x] **Step 2: Verify plan files are discoverable**

Run: `Get-ChildItem -LiteralPath 'docs\plans' -File`

Expected: the four plan files appear.

## Task 2: Move Deposit Gate Out Of Queue Entry

**Files:**
- Create: `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`
- Modify: `app/group/create/page.tsx`

- [x] **Step 1: Add migration redefining `enter_match_pool`**

The migration must keep these checks:

```sql
IF v_group.leader_user_id <> v_caller THEN
  RAISE EXCEPTION 'not_group_leader';
END IF;

IF v_active_count < 2 THEN
  RAISE EXCEPTION 'not_enough_members';
END IF;
```

The migration must remove the `v_unpaid_count` query and the `deposit_not_paid` exception from `enter_match_pool`.

- [x] **Step 2: Update group UI copy**

Replace the “pay deposit before entering queue” block with “deposit is paid after a provisional match” copy. The queue button should only depend on `canEnterQueue`, not `myDepositPaid`.

- [x] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

## Task 3: Add Anonymous Member Alias Foundation

**Files:**
- Create: `lib/matching/member-alias.ts`
- Create: `tests/matching/member-alias.test.ts`
- Reuse: `tsconfig.matching-tests.json`

- [x] **Step 1: Write alias tests**

Add tests for:

```ts
assignMemberAliases(['u3', 'u1', 'u2']).map((x) => x.alias)
```

Expected aliases:

```ts
['오소리', '꿀벌', '개구리']
```

Also verify stable ordering by sorting user IDs before assignment.

- [x] **Step 2: Implement alias helper**

Create:

```ts
export interface MemberAlias {
  userId: string
  alias: string
  aliasTheme: 'animals'
  sortOrder: number
}
```

Use the initial pool:

```ts
['오소리', '꿀벌', '개구리', '고래', '다람쥐', '여우']
```

- [x] **Step 3: Run matching tests**

Run: `npm run test:matching`

Expected: all matching tests pass.

## Task 4: Add Alias DB Schema

**Files:**
- Modify: `supabase/migrations/20260602_z50_card_then_deposit_flow.sql`

- [x] **Step 1: Create `match_member_aliases` table**

Add:

```sql
CREATE TABLE IF NOT EXISTS public.match_member_aliases (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  viewer_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_theme text NOT NULL DEFAULT 'animals',
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, viewer_group_id, target_user_id),
  UNIQUE (match_id, viewer_group_id, alias)
);
```

- [x] **Step 2: Add RLS**

Allow a user to select aliases only for matches where they are an active member of `viewer_group_id`.

## Task 5: Verification

**Files:**
- All touched files.

- [x] **Step 1: Run checks**

Run:

```bash
npm run typecheck
npm run test:matching
```

Expected: both commands exit 0.

- [x] **Step 2: Inspect diff**

Run: `git diff --stat`

Expected: only docs, matching helper/tests, group UI, and z50 migration are changed.

## Task 6: Implement Post-Match Card And Deposit Gate

**Files:**
- Create: `supabase/migrations/20260602_z51_match_card_confirmation_gate.sql`
- Create: `app/api/matches/[id]/card/route.ts`
- Modify: `app/match/[id]/page.tsx`

- [x] **Step 1: Add card submission table**

Create `match_card_submissions` with one card per `match_id + user_id`, RLS for match participants, and self insert/update.

- [x] **Step 2: Add card save/read API**

Add `/api/matches/[id]/card` so a signed-in match participant can save their anonymous card after a provisional match.

- [x] **Step 3: Gate `confirm_match`**

Redefine `confirm_match` so the caller group's active members must all have:

```text
card submitted
paid/held deposit
```

before that side can confirm.

- [x] **Step 4: Add match detail readiness fields**

Expose my/opp group card counts, deposit counts, active counts, and readiness flags through `get_match_detail`.

- [x] **Step 5: Add match detail UI**

Add card textarea, card save CTA, post-match deposit CTA, readiness counters, and a disabled leader confirm button until my group is ready.

## Task 7: Auto-Populate Anonymous Member Aliases

**Files:**
- Create: `supabase/migrations/20260602_z52_auto_match_member_aliases.sql`

- [x] **Step 1: Add alias population function**

Create `populate_match_member_aliases(match_id)` so each viewer group sees the opposite group's active members as stable animal aliases.

- [x] **Step 2: Add `matches` insert trigger**

Create an `AFTER INSERT` trigger on `matches` so any matching engine path automatically creates aliases.

- [x] **Step 3: Backfill existing matches**

Run the population function for existing rows in `matches` during the migration.

## Task 8: Add Daily Card Reveal Schedule

**Files:**
- Create: `supabase/migrations/20260602_z53_daily_card_schedule.sql`
- Create: `app/api/matches/[id]/daily-cards/route.ts`
- Modify: `app/match/[id]/page.tsx`

- [x] **Step 1: Add D-6..D-1 schedule table**

Create `match_daily_card_schedule` with one card per viewer group per day.

- [x] **Step 2: Add schedule assignment RPC**

Create `assign_match_daily_card_schedule(match_id)` using the scheduled meeting time and anonymous member aliases.

- [x] **Step 3: Add daily cards API**

Add `/api/matches/[id]/daily-cards` and hide card content until each `reveal_at`.

- [x] **Step 4: Add match detail card calendar**

Show opened/locked cards in the match detail page once a meeting time is scheduled.

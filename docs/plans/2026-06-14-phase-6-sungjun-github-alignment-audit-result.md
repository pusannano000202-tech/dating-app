# Phase 6 Sungjun GitHub Alignment Audit Result

## Summary

- Status: DONE_FOR_LOCAL_FRONTEND_REVIEW_WITH_CHAT_HELD
- Production Supabase touched: no
- Chat implementation touched: no
- Direct `gwating-app/` merge: no
- Current baseline kept: root app on `profile/post-worldcup-decisions-2026-05-21`

Sungjun's work is useful, but it is not one safe drop-in branch. The correct path is to keep the current root app as the baseline, absorb the useful product/design pieces, and reject duplicate schemas that would split the app into two systems.

## Source Branches Checked

| Source | Commit | Role |
|---|---:|---|
| `origin/main` | `c90813a` | Contains the nested `gwating-app/` prototype and chat/team demo. |
| `origin/matching/group-engine` | `e9c6637` | Contains the real `venues` and `match_meetings` schema draft. |

Read-only worktrees:

- `C:\Users\82108\.codex\worktrees\dating-app\phase6-origin-main-20260614`
- `C:\Users\82108\.codex\worktrees\dating-app\phase6-matching-group-engine-20260614`

## Decision Matrix

| Candidate | Source file | Current root equivalent | Decision | Reason | Future phase |
|---|---|---|---|---|---|
| Venue schema | `origin/matching/group-engine:supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql` | `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql` | Adopted | Phase 5 already imported it with safer ordering, guards, indexes, RLS, and revoked direct table access. | Done |
| Meeting assignment | `docs/VENUE_DB_DESIGN.md` | No complete assignment path yet | Adapt | The table exists, but the app still needs logic that writes `match_meetings` after match confirmation. | Phase 7 |
| Minimal Booting home design | `gwating-app/app/page.tsx`, screenshot `01-home.png` | `app/page.tsx` | Adapt now | The generous spacing, symbol, and strong CTA are good. It must be adapted around current login/preview/dashboard flow. | Phase 6 frontend |
| Progress/preview hub | Current manager workflow | `app/dev/preview/page.tsx` | Adapt now | The user needs to see what has merged and what is still pending without fighting login. | Phase 6 frontend |
| Group/team creation UI | `gwating-app/app/team/create/page.tsx` | `app/group/create/page.tsx`, `components/matching/group-create/*` | Adapt selectively | Root app already has real group/invite/queue flow. Only visual clarity and copy should be absorbed. | Phase 6/7 |
| Gender balance rule | `gwating-app/lib/matching.ts` | `lib/matching/*`, match pool DB | Hold for backend design | The idea is clear, but it must map to root `groups` / `group_members`, not `teams`. | Phase 7+ |
| Schedule intersection | `gwating-app/lib/schedule.ts` | `available_timeslots` JSONB, `match_meetings` | Adapt later | Useful for venue/time assignment, but root app needs KST-aware JSONB handling. | Phase 7 |
| Q&A reveal | `gwating-app/app/match/qa/page.tsx`, `gwating-app/lib/qa.ts` | `app/match/[id]/page.tsx`, daily cards API | Adapt later | The idea fits, but current product decision is KST 16:00-20:00 user-picked daily cards. | Phase 8 |
| Admin score explanation | `gwating-app/app/admin/page.tsx` | `app/admin/**` | Adapt selectively | Root admin already exists. Keep score explanation UX ideas only. | Phase 8/9 |
| Chat UI | `gwating-app/app/match/chat/page.tsx` | None production-ready | Hold | User explicitly said chat can be deferred. Current schema/RLS also needs redesign. | Phase 9 |
| `teams` / `team_members` schema | `gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql` | `groups`, `group_members` | Reject direct import | It duplicates root app group concepts and would split the data model. | Never direct |
| `chat_messages` schema | `gwating-app/supabase/migrations/20260608120000_teams_and_chat.sql` | Future match chat schema | Hold and redesign | `match_id text` and anon insert/read are not production-safe for root app. | Phase 9 |
| Mock seed teams | `gwating-app/supabase/migrations/20260608120100_seed_teams.sql` | Dev preview mock state | Reject | Prototype data, not a source of truth. | None |
| Nested app baseline | `gwating-app/` | Root app | Reject | A full switch would throw away Phase 0-5 cleanup and make two apps compete. | None |

## DB Conflict Review

- `teams` is conceptually similar to root `groups`, but it is not compatible as a table replacement.
- `team_members` is conceptually similar to root `group_members`, but root membership already has invite, role, status, and readiness dependencies.
- `chat_messages.match_id text` does not match root `matches.id uuid`.
- `gwating-app` anon chat read/insert policies are too open for a dating app.
- `venues` and `match_meetings` are already handled in Phase 5, so do not copy Sungjun's original `20260516` migration.

## Product Flow Review

| Flow | Root status | Sungjun source value | Decision |
|---|---|---|---|
| Onboarding/profile | Exists in root | Less relevant | Keep root |
| Home/entry design | Exists but copy was broken | Strong minimal Booting direction | Adapt now |
| Dev preview | Exists but copy was broken | No direct equivalent | Improve now |
| Group creation/invite | Exists in root | Team invite code idea | Keep root, polish copy/UI |
| Matching queue | Exists in root with radar | No direct equivalent | Keep root |
| Match result | Exists in root | Clean score presentation idea | Adapt later |
| Daily reveal/Q&A | Exists as daily cards | Strong Q&A reveal idea | Adapt later |
| Schedule/venue | Schema exists after Phase 5 | Venue assignment idea | Adapt later |
| Chat | Not root-ready | Good UI demo | Hold |
| Admin/operator | Exists in root | Score reason layout | Adapt later |

## Phase 6 Frontend Merge Result

This pass made the app usable locally for visual review by:

- cleaning broken Korean copy on the main entry routes
- adapting Sungjun's minimal Booting home feel into the root `app/page.tsx`
- making `/dev/preview` a clear progress hub for adopted/held/deferred work
- preserving the root group/invite/queue flow instead of importing `gwating-app` directly
- keeping chat deferred
- not changing DB, auth, Supabase production, or matching-engine logic

## Local Verification

- Dev server restarted and running at `http://localhost:3003`.
- CDP browser checks passed on:
  - `/dev/preview`
  - `/`
  - `/group/create`
  - `/group/create?from=home-queue`
  - `/match/start`
  - `/match`
- CDP viewport width was fixed at 430px for mobile review.
- `document.documentElement.scrollWidth <= clientWidth` passed on all checked routes.
- `/group/create` button click verification passed: `이번 주 매칭 큐에 들어가기` changes the screen to `매칭 큐 진입 완료`.
- Queue radar completion screen renders with male/female/my-group counts and the expected actions: `홈으로 나가기`, `매칭 결과 확인하기`, `큐에서 빠지기`.
- Screenshots saved under `.tmp/phase6-cdp-screenshots/` for local evidence.

## Files Updated In Phase 6 Frontend Pass

- `app/page.tsx`
- `app/dev/preview/page.tsx`
- `app/match/start/page.tsx`
- `app/match/page.tsx`
- `app/group/create/page.tsx`
- `app/globals.css`
- `components/BootingLogo.tsx`
- `components/MatchingPool.tsx`
- `components/matching/ActiveMatchingHomeCard.tsx`
- `components/matching/group-create/FreeBetaQueuePanel.tsx`
- `components/matching/group-create/FriendListPanel.tsx`
- `components/matching/group-create/GroupHeader.tsx`
- `components/matching/group-create/GroupMemberStatusPanel.tsx`
- `components/matching/group-create/InviteFriendPanel.tsx`

## Next Three Phases

1. **Phase 7: Meeting assignment**
   - Use `venues` and `match_meetings`.
   - Assign time/place after both sides confirm.
   - Validate with local Supabase only.

2. **Phase 8: Daily card/Q&A reveal polish**
   - Keep KST 16:00-20:00 user draw.
   - Convert the current freeform card UI into clearer structured cards.
   - Borrow Sungjun's Q&A reveal idea without replacing current DB blindly.

3. **Phase 9: Secure chat design**
   - Start from Sungjun's chat UI.
   - Redesign DB/RLS around root `matches.id uuid` and group membership.
   - Do not use anon open chat policies.

## Remaining Risks

- Some root files still contain old mojibake Korean and need gradual cleanup.
- Phase 6 frontend should stay focused on visual review flow; backend matching behavior should move to Phase 7.
- The nested `gwating-app/` directory should stay as reference until the useful ideas are fully extracted, then be archived or removed in a later cleanup phase.
- Chat remains intentionally held. Do not merge Sungjun's chat schema/UI directly until Phase 9 secure chat design is written.

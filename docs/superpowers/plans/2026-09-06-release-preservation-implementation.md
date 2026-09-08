# Release preservation implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. No stage, commit, push, remote migration, real payment or deploy is authorized.

**Goal:** Restore the confirmed original product capabilities in the integrated local app without losing newer approved flows or existing data.

**Architecture:** Keep the current G1-based app, authenticated APIs and quantum_continuation model. Selectively adapt the G4 original UI and safe contracts, using additive forward migrations and separate private access checks. Do not replace whole worktrees, old controllers, auth configuration or migration history.

**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL 17 / local Supabase, node:test.

## Approval and baseline

- Approval: user said “ㅇㅇ 필요한 부분들 출시하기 위해서 필요한부분들 챙겨서 구현해봐” after the original preservation audit and proposed restoration.
- Target: C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905.
- Branch: codex/integrated-campus-20260905; HEAD be9078565d8e59f73cbc017f3c7b1484996da1c3; initial short-status 464 entries, staged 0.
- Read-only original: sibling quantum-five-meeting-g4-shell, HEAD 9ed6e76dd456ed4d840425f16305e49075d41b64 plus its preserved uncommitted work.
- Existing integrated uncommitted changes are the approved implementation baseline, not disposable files. The root, G1, FIVE and old local DB remain untouched.
- Current implementation proceeds in this existing isolated worktree; do not create another empty baseline or change the current browser origin.

## Locked product contract

1. Actual recruiting meetups stay above ideas. Restore the male/female/mixed photo recommendation rail and 3 original cafe/shop/walk cards. Recommendation is NOT eligibility; current gender_mode is still authoritative for joining.
2. Weekly discovery keeps activity browsing, multiple possible dates, one application and one allocation. Restore accepted same-gender friends as an indivisible party; no silent acceptance, member splitting, duplicate application or capacity bypass.
3. Keep source meeting, physical meeting number and program Day separate. Board-game first meeting continues at Day2; other first meeting begins the program at Day1. No old three-pool, board_game_direct, hidden-role, forced photo, public private-choice, auto-friend or new payment policy.
4. Restore approved Day2 three 30-minute group rounds (5 people = pair plus three; 6 = three pairs), optional group-synchronized questions, and Day4 one shared phone / ten cards / free talk with safe reload and server authority. Keep Day1/3/5 approved content and the current inline occurrence chat.
5. Restore actual accepted-friend 1:1 chat, not a preview. No active friendship means no read or send. Stable retries must not duplicate messages; removed/blocked friends lose access.
6. Restore the series album as optional participant evidence. No hidden missions, forced submission, facial scoring or advertising use. A later joiner cannot see earlier meetings; only authorized per-occurrence participants can view.
7. Separate code preservation from data recovery. Existing DBs must not be reset, merged or copied blindly. Add bounded read-only compatibility evidence; preserve existing browser preference payloads on parse/compatibility failure.

## Execution and ownership

### Final execution index — supersedes the original planning checkboxes

The checkboxes below preserve the original planned checks, including field and multi-account checks that were not all executed. The current delivery verdict and exact evidence are in `docs/operations/release-preservation-20260906.md`; do not interpret an old interim failure or migration count below as current state.

- R1–R6: original recommendations, accepted-friend party API/RPC, Day2/4 runtime, friend chat, optional album, preserved storage and explicit current-scope raw backup/fallback implemented and locally verified to the limits in that report.
- R8: private Day1 vote, original Day3 tiebreak chain and Day5 attendance wording implemented; Day1 vote/reload/closed result and Day3 full tie chain/finish/reload checked in the synthetic browser cohort.
- R9: original-friend duplicate paid request guard implemented; final independent Critical/Important 0, PostgreSQL 30 assertions, real separate-session pair-lock contention, service/anonymous transport and browser filtered targets verified. Applied locally as migration 223, latest `20260906133228`; applied migrations are frozen.
- R7: final full runner `2026-09-06T14-10-03-220Z`: 1,763 automatic tests plus 2 tooling tests pass; type/lint/build/migration/secret checks all exit 0. No stage/commit/push/remote/payment/deploy.
- Not closed: operator selection/calling of weekly allocation, album physical-retention policy and worker, actual operating data/rights, unsupported historical-format automatic recovery, remote/real-account/payment/device/deployment gates. These are not silently included in the local completion verdict.

### R1 — Original meetup discovery

Files: lib/community/social-meetup-discovery.ts; lib/community/catalog.ts; components/meetups/MeetupHub.tsx; a focused social recommendation component if needed; tests/config/meetup-social-*.test.ts; exact five original files under public/images/meetups.

- [ ] Write regression tests first: expected cafe/shop/walk IDs, three recommendation modes, mixed means all, mode is not gender eligibility.
- [ ] Run tests and record the expected missing-capability failure.
- [ ] Merge only the three entries and the original photo rail under the actual recruiting list; preserve current filters and create/join/cancel behavior.
- [ ] Copy only original binary assets absent in target; record source hashes and publication-rights uncertainty.
- [ ] Verify 390x844 and 1440x900, each recommendation, card switching, create prefill, back and refresh.

### R2 — Weekly accepted-friend party

Files: components/matching/WeeklyActivityExplorer.tsx; lib/matching/weekly-availability.ts and focused weekly-party helpers; app/api/match/weekly-availability/**; related internal weekly allocation route; a new weekly-party migration; tests/matching/weekly-*.test.ts and supabase/tests/weekly-party*.sql.

- [ ] Inspect the original accepted-party schema and current allocator; return exact additive DTO/RPC/locking contract to parent for review before editing the shared boundary.
- [ ] Write failing tests for 2/3-person accepted party, owner/member authorization, common dates, all-member readiness, same team, capacity, duplicate request, member withdrawal and revision conflicts.
- [ ] Implement UI, API and additive DB projection/commands together. Do not modify the already applied base migration.
- [ ] Run targeted TypeScript and real local transactional DB tests after parent-controlled migration application.

### R3 — Five-day interaction preservation

Files: components/matching/OccurrenceContentExperience.tsx and focused Day2/Day4 child controls; lib/matching/continuation-content-*.ts; app/api/match/occurrences/[occurrenceId]/content/route.ts; a new content-runtime migration; tests/matching/continuation-content-*.test.ts; supabase/tests/continuation-content*.sql.

- [ ] Review source Day2/Day4/time recovery against latest G4 ledger section12 and current content RPC.
- [ ] Write failing tests for group privacy/rotation, optional shared prompts, 5/6 roster, all ten cards, shared-device expiry/takeover, stale revisions and idempotent retries.
- [ ] Implement additive runtime state and UI without copying old schema/controller or weakening current attendance and completion authorization.
- [ ] Verify reload, separate participants, wrong participant, stale revision and server time boundaries. Program guidance remains distinct from saved progress.

### R4 — Persistent friend chat

Files: app/friends/[id]/page.tsx; app/friends/[id]/chat/page.tsx; app/api/friends/[id]/chat/route.ts; components/friends/FriendChatRoom.tsx; lib/matching/friend-direct-chat.ts; new friend-chat migration; focused matching/auth/DB tests.

- [ ] Add failing input/permission/idempotency tests using the current friendship contract.
- [ ] Port the actual original API/component and restricted persistence, not FiveMeetingJourneyChatPreview.
- [ ] Preserve accepted-request friendship checks, blocked/excluded checks, bounded message length/history/rate and private no-store responses.
- [ ] Verify actual local persistence/reload, duplicate retries, both participants and outsider/revoked friendship.

### R5 — Optional series album

Files: components/matching/FiveMeetingCalendar.tsx; new continuation album page/component/API/helper; new album migration and related tests. Do not edit R3's content component.

- [ ] Review current evidence upload/storage access and define the smallest series aggregation using actual occurrence attendance.
- [ ] Test authorized participant, late joiner, outsider, hidden/deleted evidence and signed URL limits before implementation.
- [ ] Implement the original series viewing purpose over current participant-safe contracts. Do not resurrect mandatory mission-photo fan-out.
- [ ] Verify empty and populated album, individual hide behavior, refresh and access denial.

### R6 — Data preservation and release wiring

Files: scripts/qa/*preservation*.mjs; lib/campus-eats/*storage*.ts; components/campus-eats/CampusEatsPilot.tsx; relevant config tests; docs/operations/release-preservation-20260906.md; targeted feature-link visibility helper/component.

- [ ] Add a read-only compatibility audit for old/new local schemas and aggregate counts, never raw PII or credentials.
- [ ] Test malformed and older browser records: preserve original payload, do not silently remove or overwrite it, offer clear recovery/export rather than inventing success.
- [ ] Verify community/worldcup links respect corresponding production flags, without enabling unavailable features.
- [ ] Record which original assets/contracts are restored and which data cannot yet be mapped safely. No actual historical row import without verified mapping and authority.

### R7 — Integrated verification and independent review

- [ ] Run baseline and final npm test sequentially (test output directories are shared).
- [ ] Run npx tsc --noEmit, lint through the configured compatible runner, production build with separate output from running UI, migration checks and secret scan.
- [ ] Parent alone applies reviewed additive migrations to dedicated local DB56422; original DB56322 and all remote systems are untouched.
- [ ] Run real local DB transactional tests and browser actions. Fixture evidence never substitutes for actual accounts or deployed services.
- [ ] Independent spec review followed by code/security review, with revisions recorded below.
- [ ] Report each R1–R6 separately: implemented, tested, browser proof, real local DB proof, external or unverified gate. Never report the whole app ready for production while external gates remain.

## Acceptance examples

```ts
assert.equal(featuredMeetupIdeas.some(x => x.id === 'campus-small-shop'), true)
assert.equal(getSocialMeetupCategories('mixed-social'), null)
// Same idempotency key + identical content returns the same message; changed content rejects.
// A participant outside an occurrence must receive neither its album nor its Day2 group prompts.
// A party allocation occupies all members' seats in the same transaction or occupies none.
```

Focused TypeScript compilation uses npx tsc -p tsconfig.config-tests.json or tsconfig.matching-tests.json with a worker-owned outDir, followed by node --test on the selected compiled files. Parent owns aggregate npm test/build to avoid output races.

## External release gates (not implied approvals)

Remote migration/RLS, actual payment/refund, SMS/provider contracts, real-device notifications, image publication rights, verified delivery candidate collection, real-account full-cycle UAT, Git publication and deployment remain explicit independent gates. Code must fail safely when required external conditions are absent.

## Review ledger

### Reviewed implementation and actual local evidence

- R1: original 3 missing cards/5 image assets restored; independent review found stale recommendation filter, fixed. Actual mobile clicks found parent pointer capture and focus-scroll clipping, fixed; shopping card → prefilled create form verified. Focused tests 6/6.
- R2: independent source review closed SQL special-form misuse, lock ordering and legacy caller-first deadlock risks. Participant try-lock aborts atomically for retry. Actual PostgreSQL apply → every member consent → allocation/replay → capacity rejection passed 22 assertions in rollback.
- R3: preserved 3M2F, 2M3F and 3M3F original supported roster shapes. Actual PostgreSQL 12 pgTAP checks plus runtime scenario DO block passed, including Day2 group/CAS and Day4 lease/10 cards. Focused tests 18/18.
- R4: accepted-request friendship, private RPC ACL, revocation, Unicode length/trim, idempotency, rate/history bounds independently reviewed. Actual PostgreSQL 18 assertions passed in rollback.
- R5: independent review caught active lease stealing and unrecoverable pending upload/deletion. Corrected to active lease owner preservation, expired takeover, owner-only pending cleanup, terminal late-write cleanup without deleting a newer active owner. Actual PostgreSQL 42 assertions and focused 9/9 tests passed; independent re-review found no Critical/Important issue.
- R6: G4 v4 shared-session fields and incomplete nested records would have been discarded/crashed; now unknown formats and competing-tab changes are protected byte-for-byte. All supported bracket sizes 2..32 win/skip/resume tested. Production destination/link gates share one policy. Independent re-review found no Critical/Important issue.
- Parent applied exactly R4/R2/R3/R5 forward migrations to dedicated local DB56422. Local ledger now 220 migrations, latest 20260906120204. Old DB56322, remote DB, Git publication, real payment and deployment untouched.
- Parent seeded one explicitly synthetic browser cohort: 4 local identities, 4 accepted friendships, source + series + Day2/Day4 occurrences. Existing test02 identity/profile and previous meetup rows not overwritten. Synthetic schedule overlap/Day3 gap is not a real lifecycle proof.
- Interim aggregate: Auth152/Config640 pass; matching806/808 at an intentional R5 TDD edit boundary, requiring final rerun. Typecheck/lint later passed. First separate production build, migration ratchet and tracked/untracked secret scan passed; not final post-R8 evidence.

### R8 — Additional original-content completeness correction

Final original-source comparison confirmed two real omissions beyond the first R1–R7 inventory: Day1 private game ballot and Day3 bowling tie-break chain. The latest user request authorizes restoring the necessary original capabilities, so implement these in this same delivery, not a deferred new priority phase.

- [ ] Restore Day1 caller-private game ballot at the original 80–85 minute window; reveal only the aggregate winner after closing, with original Dalmuti tie rule. Keep initial Dalmuti play before the ballot. Block shared game overrides of private voting; no private preference exposure.
- [ ] Restore approved Day3 tie progression: raw total → last frame → joint ball, with exact original input and comparison semantics checked before coding. No private-choice rewards.
- [ ] Clarify Day5 shared gathering/route checkpoint is not individual authoritative attendance. Preserve the existing operator attendance service; do not create a conflicting self-attendance authority.
- [ ] Use a new forward migration after the four already applied ones. Parent applies only after independent review and rollback rehearsal.
- [ ] Repeat focused tests, aggregate tests/type/lint/build and actual browser checks. Any unverified field/remote/real-account behavior stays explicitly unverified.

### R8 reviewed resolution and local evidence

- Original code and decision ledger conflicted for 5-person bowling tie metrics. The latest explicit ledger is authoritative: only the initial gender-adjusted score uses a per-person average; the raw-score and last-frame tiebreaks use team sums. Comparisons retain full precision; rounding is display-only.
- The original zero-vote tie also defaults to Dalmuti after closing. The earlier internal no-vote/null proposal was not a user decision and was discarded. No vote count or other participant's choice is exposed.
- Independent review closed legacy `select_game` projection leaks, missing time bounds for direct tiebreak writes, and a concurrent Day3 finish gate. Raw vote access, public RPC signatures and exact replay remain protected.
- Parent PostgreSQL rollback: 8 pgTAP checks plus the complete Day1/Day3 scenario block passed. Forward migration `20260906130854` was then applied to DB56422 as migration 222; that file is frozen.
- The d810 browser cohort only adds a separate synthetic walk-source series, Day1/Day3 and membership rows using existing test identities. No existing row is updated. Its rollback rehearsal passed before persistent seeding.
- Actual Day1 browser: private Halli Galli vote saved, refresh retained the selected radio and own-vote message; start/finish of initial Dalmuti did not open early occurrence completion. Day3 browser verification is in progress.

### R9 — Prevent duplicate paid friend requests discovered in live verification

The Day4 completion screen offered another 1,000-won request for already accepted friends. Existing server preparation only checked attendance and deferred the active-friend collision to post-payment recovery. This is a release-critical omission, so fix it within this delivery without changing prices, provider policy or existing monetary evidence.

- [ ] Add forward-only guards for active/blocked friends, currently pending requests and unresolved entitlements. Do not create a permanent ban from historical declined/expired requests.
- [ ] Keep exact idempotency replay and existing prepared-order compatibility. Serialize the unordered pair with all friendship/request mutation paths; avoid row-lock/pair-lock deadlocks.
- [ ] Recheck before provider verification begins. When already externally verified, retain payment identifiers and route to the existing recovery jobs rather than pretending no charge happened.
- [ ] Filter ineligible paid targets in the after-flow projection and explain safe retry/not-eligible responses in UI.
- [ ] Parent reviews and runs transactional SQL; independent review, browser target filtering and final aggregate checks precede completion. No external provider call, real charge/refund, remote apply or deployment.

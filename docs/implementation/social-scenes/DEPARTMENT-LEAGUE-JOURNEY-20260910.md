# Department league journey — local implementation contract

## Approved scope

Replace the generic department challenge form with one focused journey shared by production and a clearly labelled development rehearsal: sport → league → image-based roster and self-assessment → compatible complete teams → bilateral schedule → bilateral result → opponent-position report.

LoL uses five distinct lanes, futsal uses six slots, and football uses eleven. Overwatch is visibly not ready; PUBG is deferred. Backgrounds are supplied image assets; HTML buttons provide interaction. Existing challenges, authentication, membership consent, roster locks, confirmed-result rules and 14/21-day operator moderation remain authoritative.

## Ownership and implementation units

1. League-only contracts and tests define sport/slot mappings, safe live parsing, and registry-based initial rows.
2. A forward-only Supabase CLI migration adds slot identity, validates occupancy in the database, and exposes scoped journey RPCs while retaining old RPC compatibility.
3. DepartmentLeagueJourney and its shared image/step components drive either live requests or an explicitly local demo adapter. demo does not issue network requests or server writes.
4. Production department page links the new journey and preserves an explicit legacy-record entry. No shared layout/provider/package edits.

## Ranking policy boundary

The user approved an initial score of 1000 for every registered department and requires at least one confirmed match for monthly ranking. Existing confirmed match records are the source. The candidate arithmetic `1000 + 30 × wins - 30 × losses` is a **proposal, requiring a product decision before deployment**. Named constants identify it; it must never overwrite an existing persisted rating. Team matchmaking skill uses its separate existing self-report scale (70% mean + 30% highest score) with exact 200/300 tolerance and is never labelled as league ranking or Riot LP/MMR.

An API error is a connection failure. An initial policy illustration is labelled separately and is not evidence that the database has zero matches. No writes are enabled from unavailable live state.

## Verification

Test slot/category validation, duplicate/occupied slots, role spoofing, retained leave permission, exact capacity and confirmed monthly/all-time records in isolated PGlite. Keep old league regressions. Test demo transitions and malformed live parsing; run scoped type/lint. Parent owns 390×844/1440×900 browser clicks, captures and integrated build. No remote SQL, real penalties, stage/commit/push/deploy.

## Local implementation evidence

- Migration created by Supabase CLI `migration new department_league_position_journey`: `20260910035348_department_league_position_journey.sql`. Applied only to isolated PGlite test databases.
- New SQL cases execute atomic slot creation/idempotency, pending requests with captain approval, accepted-slot uniqueness, bilateral confirmed monthly/all-time records, an entire 22-player football pairing and exact-slot snapshot/report projection, and 6-vs-11 rejection.
- Actual trigger ordering was checked in PostgreSQL metadata and by the scheduled transition: `challenge_capture_match` runs before `challenge_journey_capture`; all 22 football snapshots have slots, including two `lw` entries. Completed-match opponent reports retain those slots and create no automatic restriction.
- Offline rehearsal tests cover all three formats from request through both result confirmations, including grandmaster/advanced score inputs. Three sample department teams have distinct internal indices, ordered by score; their nearby example tiers stay within both selected tolerance and strongest-player caps. Selecting a candidate carries that exact team into the match. These are clearly fictional examples, not live teams.
- Existing league regressions retain consent, fair-score tolerances, roster locking, voluntary departure, nonempty result publication, campus/member permissions, independent fresh-AAL2 operator review, 14/21-day restrictions and owner-only appeals.
- Independent review identified and fixed two cross-path gaps: inferred legacy 6/11-player soccer teams now need exact slots before entering the new queue, and accepted match participants can see both teams' schedule proposals. The receiving captain explicitly confirms an opposing proposal using its original timestamps and place; outsiders receive no proposals. SQL regression reads the proposal from the receiver's actual overview before confirming it, preserving timestamp precision.
- Parent browser clicks found that the implicit selected-match lookup dropped a completed rehearsal match. Selection now stays pinned across match/result/report steps and also resolves completed owned matches; the same selector is regression-tested after bilateral confirmation so the opponent report targets remain reachable. Mobile headings use whole-word balanced wrapping.
- New journey messages have Korean, English, Japanese and Chinese entries. Position abbreviations, sport/brand microcopy, sample participant/departments and venue placeholders remain literal labels; the explicit legacy record screen retains its prior language coverage.

## Remaining boundaries

Full integrated build, mobile/desktop direct clicks and screenshots are parent-owned evidence, not claimed by these SQL or source tests. Remote migration application, independent real-account sessions, multi-connection PostgreSQL races, real devices, production rollout and official game-account verification remain unverified. The noninitial points formula remains a deployment-gated proposal. Overwatch remains visibly unavailable; PUBG is deferred.

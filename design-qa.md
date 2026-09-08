# Voice entry option 2 — design QA (2026-09-08)

final result: passed

Scope: existing anonymous 1:1 voice entry only. This result concerns local UI and fixture interaction, not production voice readiness.

## Visual truth and evidence

- Chosen original option 2: C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-c069ddbf-0560-47a1-b3a0-a6a9f97b7604.png
- Count-enhanced source: C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-02b68204-8ee1-458b-b3bd-41953c181440.png
- Implementation: http://127.0.0.1:4177/community/voice/random?topic=worries&adviceTopic=romance
- Mobile evidence: artifacts/voice-entry-design-20260908/v2-mobile-final.png
- Desktop evidence: artifacts/voice-entry-design-20260908/v2-desktop-final.png
- Earlier evidence: artifacts/voice-entry-design-20260908/v2-mobile-before-qa.png
- Error evidence: artifacts/voice-entry-design-20260908/v2-error-mobile.png

Source pixels 852 × 1846; mobile browser CSS viewport 390 × 844, captured pixels 375 × 811 (browser capture density approximately 0.9615). Compared both images in the same tool input twice, using their equal-width proportions (source scaled conceptually to 375 × 812.5). No pixel-perfect font claim: source is generated art, implementation uses the existing PretendardVariable font. No physical-device claim.

State: selected talker and romance, sample total 12 / male 5 / female 7. Desktop captured career/listener, total 3 / male 1 / female 2; it is responsive evidence, not a same-state image diff. QA banner explicitly labels fixture data.

Full-view comparison and focused count/photo/CTA inspection used the source and runtime together. The screenshot is sufficiently readable to inspect these regions directly; separate artificial crop/composite files were unnecessary.

## Iterations and findings

1. Earlier [P2] QA banner covered the back/header; changed to document flow, verified header and back control visible.
2. Earlier [P2] participation CTA was below the initial viewport; fixed above existing bottom navigation, added reserved bottom space, compacted mobile photo/layout rhythm. Verified preparation and actual join remain separate actions.
3. Earlier [P2] selected fourth topic could begin outside the rail; selected-topic effect scrolls only the horizontal container on mount/change. Browser measured selected right edge within rail; keyboard selection moves focus too.
4. Earlier [P2] stale or wrong-topic counts could appear; latest-request guard, abort/dispose, scope validation and error clearing now prevent this. Browser verified 0, 1, error and automatic recovery.
5. Final comparison: no remaining actionable P0/P1/P2 difference in the approved entry scope. Longer rules and precise count context intentionally scroll; the participation CTA stays available.

## Required fidelity surfaces

- Typography: existing PretendardVariable, dark headline + terracotta emphasis, readable editable role labels, single untruncated count row. Main contextual text increased to 12px; small image disclosure is subordinate, not an action.
- Layout: two portrait role cards, compact top count section, horizontal photo topic rail, one prominent CTA and preserved six-tab navigation. 390px and 1440px have no page-width overflow. Four-topic rail scroll is intentional.
- Colors: cream #fffaf6, terracotta #b34c3e, dark text and warm photo surfaces. One selected role and one selected topic have check/border; keyboard focus has a distinct blue outline.
- Images: four generated bitmap assets, no CSS recreation of photos. All six rendered image elements loaded in mobile and desktop. Subjects match the approved cup/listener/career/campus-night direction; no claimed participant photos.
- Copy: accurate waiting scope, exact male/female/other disclosure when applicable, school-wide casual scope, no fabricated live callers. No microphone or recording implied before connection. Source mock's simultaneous check marks are intentionally corrected to one topic.

## Interaction and evidence limits

- Verified: talker/listener changes; topic taps, arrows, keyboard focus and native horizontal scrolling; general direct entry; count changes by topic; real zero/one fixture values; error hides numbers; later success removes error; preparation exposes rules; unchecked rules disables join; fixture join, reload persistence, cancel.
- Tests: 31 voice tests + 11 focused UI/fixture tests passed. Full TypeScript no-emit passed. Scoped diff whitespace check passed.
- Console: no runtime error logs observed. Next image-priority warnings were found for reused topic assets; topic images now request priority, matching above-fold use.
- Remote DB, production migrations, provider connection, actual microphone, real multi-account calls and physical-device verification are unverified. Existing local DB snapshot lacks the newer voice queue migration. No migration or deployment performed.

## Implementation checklist

- [x] Approved option 2 translated into existing React screen.
- [x] Exact aggregate semantics and loading/failure/retry preserved.
- [x] Mobile and desktop visual/click verification.
- [x] Source and runtime compared together after fixes.
- [x] Local preview clearly distinguished from live calls.

---

# Home / department option 2 — design QA (2026-09-08)

final result: blocked

Visible layout and tested local navigation passed. End-to-end completion is blocked by unapplied local DB changes and unconfigured voice provider, not hidden behind mock counts. This section supersedes neither the earlier voice-entry fixture proof nor its evidence limits.

## Visual truth and actual captures

- Selected source: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-b67cd4f8-7e1a-47f6-b2d5-6b47c2a9dfde.png`.
- Actual app: `http://localhost:3013/` and `/community/department` (existing Next app, no replacement prototype).
- `artifacts/option2-20260908/home-mobile-actual.png`: 390x844 viewport, current local account with continuation and own-meetup dependency error.
- `artifacts/option2-20260908/home-desktop-actual.png`: 1440x1000 viewport, same account/state.
- `artifacts/option2-20260908/department-mobile-final.png`: first screen, planned five slots, team title entered, enabled fixed CTA; no submission performed.
- `artifacts/option2-20260908/department-mobile-form-final.png`: scrolled form/photo/CTA.
- `artifacts/option2-20260908/department-desktop-final.png`: inline desktop CTA layout.
- `department-mobile-actual-full.png` is an invalid browser full-page stitching capture (duplicated/blank content). It is preserved but is NOT layout evidence. All final evidence uses viewport screenshots.

The selected image and actual mobile/desktop captures were opened together in the same comparison inputs twice, with additional focused first-screen/form captures. The selected mock is 1692x929 with two panels; runtime is responsive, not a pixel-identical exported picture. Home positive membership data cannot match the mock's 4/5 cafe example because the actual DB read function is unapplied. This remains a data-state fidelity blocker; no 4/5 fixture was substituted into the app.

## Findings and refinements

1. Mobile create CTA initially required scrolling below the photo. It now stays above the bottom navigation with reserved document padding. At 390x844, measured CTA top711/bottom768, navigation top779.2: no overlap. Desktop action bar is static, verified from computed style.
2. Images retain original subject framing. Department's gaming photo stays at its natural 2:1 ratio to avoid cropping faces; the form/photo scrolls while the action remains reachable. Original assets were generated individually, not cropped from the approved UI image.
3. Planned seats are labeled planned, not accepted friends. Root clicked a seat: focus moved to team title with an explanation to create the team before inviting. Five default seats and capacity20 (+15 planned seats) were verified without page overflow.
4. Redacted participant names no longer imply vacant seats: actual accepted_count reserves anonymous '참여 중' slots. Pure-helper regression test covers 3/5 with zero disclosed names. This state was not verified against live DB.
5. Successful create followed by failed list refresh now preserves the created-team identity and asks to reload; it does not claim a visible invitation panel or prompt an immediate duplicate create. Pure-helper tests cover null/wrong/matching list states; live creation remains unverified.
6. Football rules disclosure uses football copy, not 'game type'. Game/football selection and disclosure were clicked in the browser.
7. Home own state comes first in mobile and DOM reading order. Desktop intentionally uses a leading left own-state column and right discovery column, rather than stretching the mobile column across the entire screen.
8. Unknown own membership or partial matching lookup remains an explicit small error/retry, not 'no participation'. Upcoming/ongoing scheduled meetings precede unscheduled activity rooms; embedded SQL ordering regression passed.

## Required fidelity surfaces

- Typography: existing Pretendard body; large varsity-outline PLAYMAKER; editable Korean inputs. No text rasterization. Existing Quantum logo and six-tab navigation retained rather than reproducing generated icon inaccuracies.
- Layout: cream/rust card system; own next action before photo discovery; planned roster before team name/rules; safe mobile CTA. Mobile measured page width375 <= viewport390; desktop1425 <=1440. No horizontal page overflow in tested states.
- Palette: cream #fffaf6, terracotta #b34c3e, dark #261914 and restrained borders. Selected sport visibly filled; disabled CTA subdued.
- Assets: generated campus football and PC gaming scenes, plus existing voice/content/posts images. Decorative images do not claim real participants, school verification or available matching headcounts.
- Copy/state: no automatic department friending; no public future continuation itinerary; names/payments/choices remain private. Actual stale schema errors are shown honestly.

## Interaction proof and limits

- Actual clicks: home department hero, home voice/content/posts rows and returned headings; game/football switch; rules disclosure; title input; planned-seat focus; capacity20; home navigation. Weekly direct URL opens the pressed '이번 주 만나기' state, with no registration performed.
- Ordinary local account `/auth/mfa` showed 404. No real administrator login, TOTP enrollment/QR display or factor removal was executed.
- Unverified: live own-meetup card with applied new SQL, team POST/invite/accept, physical mobile keyboard/safe-area/audio, actual microphone/provider calls, screen-reader/full accessibility audit, production deployment.

Next design verification after approved DB application: use real local multi-account membership and invitation data to verify positive ticket/roster/reload states, then complete voice provider/device verification separately.

# Community Photo Explorer Implementation Plan

> **For agentic workers:** Apply the existing approved matching-carousel pattern to this scoped community revision. Parent owns implementation; an independent agent checks references and a fresh reviewer checks the final change. No commit, push, migration or deployment is authorized.

**Goal:** Selecting MBTI, visit food or delivery instantly changes one photo-led community hero, including its copy and real destination CTA.

**Architecture:** Keep the public server page and feature flag. Add one small client explorer backed by local, typed content and pure carousel helpers. Keep the existing food category links and secondary community destinations below it. Do not change login, survey, restaurant data, DB or API behavior.

**Tech Stack:** Existing Next.js, React, TypeScript, Tailwind and Lucide; existing local illustrative photos.

## Locked design and acceptance

- [x] Three compact selectable buttons; MBTI initially selected; selected state and hero agree.
- [x] A large contextual photo, topic-specific question, short explanation and one primary CTA change together in place. No route change until the CTA is used.
- [x] Previous/next, horizontal pointer swipe (44px, horizontal-dominant), ArrowLeft/ArrowRight and Home/End; no autoplay or forced page scroll. Vertical scroll, pointer cancellation and reduced motion remain safe.
- [x] Preserve all three destination routes, visit map and seven food categories, community feature gate and secondary destinations. Remove duplicate static primary cards.
- [x] MBTI is optional self-report experience, not scientific prediction. Photos are illustrative, not members, restaurants or verified delivery evidence. No fabricated popularity, prices or benefit claims.
- [x] Test at 390×844, 320px and desktop; capture each selected state and verify actual CTA destinations, image loading, touch/keyboard behavior and no horizontal overflow.

## Files and steps

1. Add `tests/tooling/community-photo-explorer.test.mjs`: RED for missing explorer and pure selection/swipe behavior. Load the pure TS module through TypeScript transpilation, without mocking carousel logic.
2. Add `lib/community/experience-explorer.ts`: three immutable content records; wrap index, keyboard intent and directional swipe helpers. GREEN tests must cover wraparound, diagonal/short swipe rejection and cancellation handling in the component.
3. Add `components/community/CommunityExperienceExplorer.tsx`: local selection state and accessible buttons; preloaded photo layers with reduced-motion transitions; one visible content/CTA panel. Pointer state belongs to the photo only, not the CTA.
4. Update `app/community/page.tsx`: replace static top cards with the explorer before the secondary menu. Update `CommunitySpotlight.tsx`: retain real catalog counts, category links and compact community links without repeated primary heroes.
5. Update obsolete source-contract assertions in `journey-public-clarity`, `quantum-community-landing`, `integrated-discovery`; retain truthfulness and route guards.
6. Run `node --test tests/tooling/community-photo-explorer.test.mjs tests/tooling/journey-public-clarity.test.mjs`, config compilation/test suite, project lint and isolated output production build. Save fresh logs under `artifacts/community-photo-explorer-20260906`.
7. Independent read-only code/design review; parent browser verification. Fix actionable findings and recheck. Deliver screenshots and clear local-only evidence in `docs/operations/community-photo-explorer-report.md`.

## Boundaries

Continue in the existing isolated `codex/integrated-campus-20260905` workspace. Preserve 421 pre-existing dirty entries and prior QA evidence. Local reuse of existing photo assets does not clear their publication rights; record that risk. Real account/DB/delivery availability and production deployment remain outside this UI change.

# Quantum Peach Air Color System Design

**Date:** 2026-08-13
**Status:** Approved by the user
**Selected direction:** A - Peach Air

## Goal

Replace Quantum's remaining mint and green-dominant visual impression with a warm, restrained color system that supports the product promise: helping students move from online discovery to comfortable offline meetings.

The interface should feel human and warm without becoming a pink dating app, a cosmetics app, or a peach-colored monochrome interface.

## Product principles

1. Use near-white peach as ambient background color, not as a saturated brand fill.
2. Keep cards and information surfaces white so people and activity photography remain the primary visual signal.
3. Reserve coral for primary actions, selected states, and the most important progress indicator.
4. Use dusty blue for information, links, and neutral operational status.
5. Keep green only for confirmed success or safety status.
6. Keep red distinct from coral and use it only for danger, cancellation, validation errors, and destructive actions.
7. Do not change route behavior, API contracts, matching logic, authentication, payment, or database behavior as part of this color-system change.

## Color roles

| Role | Token | Value | Use |
|---|---|---:|---|
| App canvas | `boot-canvas` | `#FFF9F6` | Page background and low-emphasis bands |
| Surface | `boot-surface` | `#FFFFFF` | Cards, sheets, navigation, inputs |
| Soft surface | `boot-soft` | `#FCECE6` | Selected tabs, quiet callouts, subtle status areas |
| Primary action | `boot-primary` | `#B94B3F` | Main CTA, active navigation, selected control |
| Primary dark | `boot-primary-dark` | `#963D34` | Hover and pressed state |
| Coral accent | `boot-coral` | `#D96B5D` | Secondary warmth, highlight labels, non-destructive emphasis |
| Warm accent | `boot-amber` | `#D89A45` | Time-sensitive labels and sparse highlights |
| Information | `boot-info` | `#527181` | Links, neutral progress, operational information |
| Information soft | `boot-info-soft` | `#E8F0F3` | Quiet informational background |
| Ink | `boot-ink` | `#292321` | Main headings and high-emphasis text |
| Body | `boot-body` | `#665C58` | Body text |
| Muted | `boot-muted` | `#8B7E78` | Metadata and secondary labels |
| Hairline | `boot-hairline` | `#EAD9D2` | Dividers and borders |
| Success | existing semantic green | unchanged | Confirmed success and safety only |
| Danger | existing semantic red | unchanged | Error, cancellation, destructive action only |

Primary buttons use white text on `#B94B3F`. The contrast ratio is greater than 4.5:1. Main ink on the app canvas is greater than 14:1.

## Distribution rule

The intended visual ratio is:

- 85% near-white canvas and white surfaces
- 10% soft peach section and selected-state surfaces
- 5% coral primary actions and highlights

This ratio prevents the interface from becoming a single-hue peach theme.

## Screen application

### Home

- Use the Peach Air canvas around the main recommendation and status areas.
- Keep activity photography full-color.
- Use coral only for the single next action.
- Use dusty blue for operational links and neutral information.

### Match

- Use coral for `오늘 바로`, participation, and the user's active matching state.
- Use dusty blue for counts, schedule information, and secondary navigation.
- Preserve dark night-event media sections where they already provide necessary photographic contrast.
- Do not recolor success or safety confirmations to coral.

### Meetups

- Keep category media and activity photos dominant.
- Replace old mint active states with soft peach and coral.
- Use dusty blue for category metadata and secondary actions.

### Community

- Keep the board surface white and dense.
- Use coral for the active category, write action, likes, and accepted connection action.
- Use dusty blue for comments, links, and neutral metadata.
- Do not place every post inside a peach card.

### My and profile

- Keep profile photography dominant and surfaces white.
- Use soft peach only for selected settings and active profile status.
- Use dusty blue for account information and secondary management actions.
- Preserve semantic deposit, report, error, and safety colors.

### Mobile app

- Mirror the same semantic roles in Expo/React Native theme constants.
- Do not attempt a complete native-screen redesign in this pass.
- Apply the palette only to shared shell, navigation, main calls to action, selected states, and the primary Home/Match/Meetups/Community/My surfaces.

## Typography and shape

- Keep the existing Korean type family and zero letter spacing.
- Use near-black ink instead of green-tinted text.
- Keep operational cards at 8px radius or less unless an existing component contract requires otherwise.
- Do not add gradients as a replacement for mint surfaces.
- Do not recolor photography or place a peach overlay over faces.

## Implementation boundaries

### In scope

- Global web color tokens and page theme metadata
- Shared web navigation and shell
- Home, Match, Meetups, Community, and My/Profile primary visible surfaces
- Shared mobile theme constants and primary navigation/shell usage
- Regression tests that assert semantic color values and absence of obsolete mint-dominant tokens in touched files
- Desktop and mobile visual verification with screenshots

### Out of scope

- Supabase schema or RLS
- API and route behavior
- OpenAI appearance analysis
- Toss payment behavior
- Matching allocation logic
- New features or navigation changes
- Reworking every archived or developer-only screen
- Production deployment

## Verification

1. Run the color-system contract test and watch it fail before implementation.
2. Apply web and mobile theme tokens.
3. Run focused tests, TypeScript checks, and the production build where feasible.
4. Open Home, Match, Meetups, Community, and My/Profile at mobile width and desktop width.
5. Verify no horizontal overflow, text overlap, broken images, or inactive navigation caused by the color change.
6. Capture at least one desktop comparison and mobile captures for the main user destinations.
7. Report untouched legacy mint or green uses that remain outside the approved scope.

## Approved visual reference

The approved mockup is served locally at:

`http://localhost:59419/files/quantum-skin-tone-palette-options.html`

The first option, `A - Peach Air`, is the implementation reference.

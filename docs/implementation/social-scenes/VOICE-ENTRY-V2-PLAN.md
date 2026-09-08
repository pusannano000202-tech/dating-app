# 익명 보이스 2번 시안 + 참여 현황 Implementation Plan

**실행 상태 (2026-09-08):** 아래 로컬 UI 구현·자동 테스트·브라우저 검수 완료. 최종 근거는 `VOICE-ENTRY-V2-REPORT.md` 및 루트 `design-qa.md`. 원격 DB/실통화/실기기는 완료 범위가 아닙니다. 체크리스트는 착수 당시 원문으로 보존합니다.

> **For agentic workers:** Use superpowers:subagent-driven-development for independent asset/fixture tasks; the parent owns the tightly coupled UI/state implementation. User approval: “2번이 제일 괜찮네 근데 저거 참여 현황 몇명이 참여중인지 여자 몇명 남자 몇명 이런거 현황도 보이게 ㄱㄱ해라”. Do not stage, commit, push, migrate, deploy, reset or alter existing user artifacts.

**Goal:** 선택한 2번의 사진 역할 선택·가로 주제 탐색을 실제 보이스 화면에 반영하고, 서버가 반환한 전체·남자·여자 대기 인원을 명확히 공개한다.

**Architecture:** 기존 Next route, 큐 API와 통화 계약은 유지한다. 보이스 진입 전용 CSS와 참여 요약 컴포넌트/상태 로더를 분리해 세션 화면과 다른 보이스 화면을 변경하지 않는다. 일반 수다와 고민 대기의 집계 범위를 명시하고, 실패·초기 로딩·실제 0명은 서로 다른 상태로 표시한다.

**Tech Stack:** Next 15, React 19, TypeScript, existing lucide-react, next/image, node:test, local-only fixture proxy.

## Visual target and semantic bounds

- Source: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-c069ddbf-0560-47a1-b3a0-a6a9f97b7604.png` (second actually displayed image), with the user's requested count strip.
- Header → selected-topic waiting summary → two photo role choices → horizontal topic photo rail → preparation/rules → clear CTA above six-tab navigation.
- Existing GET advice status returns waiting counts, not all connected callers. Label it `대기 현황`; do not relabel as `통화 중` or online school population. Advice role totals remain subordinate to overall/male/female counts. Preserve other/unspecified gender counts for arithmetic completeness.
- Show 0 and 1 without hiding small samples. Failure never produces artificial zero or stale prior-topic counts.
- No fake portraits, recording, auto microphone, auto friends, external publishing or provider configuration.

## Task 1: State and count contract (parent)

Files: create `lib/voice/entry-status.ts`, `tests/voice/entry-status.test.ts`; use existing `parseParticipationSummary` without editing its contract.

- [ ] Write failing tests: waiting summary total equals gender sum; advice talker+listener equals total; invalid/missing/connected basis rejected; genuine 0/1 accepted.
- [ ] Add tested latest-request loader: abort old request, ignore stale result/error, expose loading/ready/error; changing topic invalidates old numbers; successful refresh clears old error. No enqueue or microphone side effects.
- [ ] Run `npm run test:voice`, observe new RED then GREEN. Existing voice tests must remain passing.

## Task 2: Assets (asset worker)

Files: new `public/social-scenes/voice-talker-v2.webp`, `voice-listener-v2.webp` only.

- [ ] Generate separate matching portrait photos from approved visual: hands and cup; anonymous listener by window.
- [ ] Inspect and encode locally without modifying existing assets. Reuse only visually compatible existing topic images.

## Task 3: Actual entry UI (parent)

Files: `components/voice/VoiceRandom.tsx`, new `components/voice/voice-entry.module.css`, optional small `VoiceParticipation.tsx`; update only directly relevant obsolete source-contract assertions.

- [ ] Replace the decorative orb and stacked form with the approved role-first composition. Use real image assets, responsive next/image, text overlays as editable UI, existing icon family and brand tokens.
- [ ] Keep all general/romance/career/social routes; advice roles mandatory, casual-chat role pairing is not invented.
- [ ] Add top count section with title, overall/male/female, other/unspecified when present, advice role totals, server timestamp; loading/error/retry states separately.
- [ ] Photo rail works by tap, native horizontal scroll/touch, keyboard; one active subject and corresponding payload only. Preserve rules checkbox before POST join and matching cancellation/resume behavior.
- [ ] Guard double clicks, stale polls and successful join follow-up. No source/API/DB bypass to hide service failure.

## Task 4: Isolated browser fixture (fixture worker)

Files: new `scripts/qa/serve-voice-entry-fixture.mjs`, `tests/tooling/voice-entry-fixture.test.mjs`.

- [ ] Tests before implementation for exact GET status schemas, role counts, 0/1/error scenarios, local-only binding, blocked unrelated writes and APIs, stripped auth/cookies, same-origin fixture writes.
- [ ] Fixed `127.0.0.1:4177`, upstream actual UI from 3013. Preserve existing 4176 process/state. Explicit visible `보이스 UI 검수 · 예시 인원 · 실제 통화 아님` banner.
- [ ] Fixture-only rules/join/leave state for clicking UI; no media/session tokens or external services. Never present this as actual DB verification.

## Task 5: Integration and visual acceptance (parent + independent review)

- [ ] `npm run test:voice`; focused tooling/source tests; `npm run typecheck` or production build without disrupting current preview.
- [ ] Inspect actual 390×844 and 1440×900; both role buttons, photo rail, topic changes, counts/loading/error/retry/0/1, preparation/rules, join/cancel against fixture; actual service error separately.
- [ ] Capture selected-reference and runtime together, compare typography/layout/tokens/images/copy; fix objective design/interaction regressions; record `design-qa.md` without overwriting an unrelated existing report.
- [ ] Sol independent source/product review: no new matching policy, aggregate semantics correct, no false proof.
- [ ] Final Korean report with screenshot; separate local UI, fixture, real API/DB, provider and physical-device evidence. No commit or remote changes.

## Root cause observed before changes

4176's existing `serve-activity-room-fixture.mjs` intentionally returns 404 `fixture_api_not_found` for all unhandled `/api/` requests. Advice status is not one of its allowed fixtures. `voiceFetch` maps this unknown error to a generic message. This is not proof the actual voice service or database is broken; do not alter authentication to bypass it.

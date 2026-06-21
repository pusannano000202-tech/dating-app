# Plans Hub

This folder is the canonical entry point for active product and implementation plans.

## Quick Links

- [Current Implementation Status](./CURRENT_IMPLEMENTATION_STATUS.md)
- [Thread Context Consolidated Audit](./2026-06-12-thread-context-consolidated-audit.md)
- [Codex Team Workflow Reset Plan](./2026-06-12-codex-team-workflow-reset-plan.md)
- [Phase 0 Current State Audit](./2026-06-13-phase-0-current-state-audit.md)
- [Phase 1 Group Create Refactor Worker Brief](./2026-06-13-phase-1-group-create-refactor-worker-brief.md)
- [Phase 2 Cleanup Worker Brief](./2026-06-13-phase-2-cleanup-worker-brief.md)
- [Phase 3 Daily Card DB Worker Brief](./2026-06-13-phase-3-db-worker-brief.md)
- [Phase 3 Daily Card DB Worker Result](./2026-06-13-phase-3-db-worker-result.md)
- [Phase 4 DB Lint Cleanup Worker Brief](./2026-06-14-phase-4-db-lint-cleanup-worker-brief.md)
- [Phase 4 DB Lint Cleanup Worker Result](./2026-06-14-phase-4-db-lint-cleanup-worker-result.md)
- [Phase 5 Category B Meeting Schema Worker Brief](./2026-06-14-phase-5-category-b-meeting-schema-worker-brief.md)
- [Phase 5 Category B Meeting Schema Worker Result](./2026-06-14-phase-5-category-b-meeting-schema-worker-result.md)
- [Phase 6 Sungjun GitHub Alignment Audit Plan](./2026-06-14-phase-6-sungjun-github-alignment-audit-plan.md)
- [Phase 6 Sungjun GitHub Alignment Audit Result](./2026-06-14-phase-6-sungjun-github-alignment-audit-result.md)
- [Phase 8 Match Detail UX Result](./2026-06-16-phase-8-match-detail-ux-result.md)
- [Phase 9 Match Chat Result](./2026-06-16-phase-9-match-chat-result.md)
- [Phase 10 Match Detail Daily Card UX Result](./2026-06-16-phase-10-match-detail-daily-card-ux-result.md)
- [Phase 11 Frontend Flow Redesign Worker Brief](./2026-06-15-phase-11-frontend-flow-redesign-worker-brief.md)
- [Document Organization Plan](./DOCUMENT_ORGANIZATION_PLAN.md)
- [Document Organization Result (Codex용 결과 보고서)](./DOCUMENT_ORGANIZATION_RESULT_2026-06-02.md)
- [Active Plan Index](./ACTIVE_PLAN_INDEX.md)
- [Card-Then-Deposit Flow Design](../product/matching/2026-06-02-proposed-match-card-deposit-flow.md)
- [Card-Then-Deposit Implementation Plan](../product/matching/2026-06-02-card-deposit-flow-implementation-plan.md)
- [Pre-Meeting Excitement Info Plan](./2026-06-02-pre-meeting-excitement-info-plan.md)
- [Operator Console Plan (매칭 승인·근거 보고·외모 점수 보정)](./2026-06-02-operator-console-plan.md)
- [Preference Weight Number Input Plan](./2026-06-12-preference-weight-number-input-plan.md)
- [Overnight External Completion Gates](./2026-06-22-overnight-external-completion-gates.md)
- [Overnight Completion Audit](./2026-06-22-overnight-completion-audit.md)

## Manager Room Operating Order

When starting work from the team-lead room, read and update plans in this order:

1. [Current Implementation Status](./CURRENT_IMPLEMENTATION_STATUS.md) — what is currently true in code.
2. [Thread Context Consolidated Audit](./2026-06-12-thread-context-consolidated-audit.md) — what changed across recent conversations and what still conflicts.
3. [Codex Team Workflow Reset Plan](./2026-06-12-codex-team-workflow-reset-plan.md) — how to split work into manager room, worker rooms, and phase gates.

Current baseline decisions:

- `/dev/preview` is the local design review entry and must not bounce protected onboarding screens back to login.
- MVP auth follows the current email verification/email OTP direction; phone OTP is deferred for later review.
- Current local preference weights are 4 keys: `appearance`, `personality`, `height`, `body_type`. Sungjun's 7-key contract still needs agreement before shared contract changes.
- Daily cards currently use a user-driven 16:00-20:00 draw window in this branch. Sungjun's automatic-distribution prototype still needs product-policy agreement.
- Initial launch now keeps a 10,000 KRW refundable deposit direction, with mock for local UI review and Toss sandbox as the real-payment target.
- Daily-card DB migration work is split into a DB worker/phase.

## Management Rules

- New product decisions should be added here first, then linked to older docs as references.
- Older scattered docs remain as historical references unless they conflict with this folder.
- When implementation changes, update `CURRENT_IMPLEMENTATION_STATUS.md` and the relevant plan checklist.
- Team-lead room decisions should be reflected in the three manager docs above before creating new worker-room tasks.

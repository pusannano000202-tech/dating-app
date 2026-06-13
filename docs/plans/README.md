# Plans Hub

This folder is the canonical entry point for active product and implementation plans.

## Quick Links

- [Current Implementation Status](./CURRENT_IMPLEMENTATION_STATUS.md)
- [Thread Context Consolidated Audit](./2026-06-12-thread-context-consolidated-audit.md)
- [Codex Team Workflow Reset Plan](./2026-06-12-codex-team-workflow-reset-plan.md)
- [Phase 0 Current State Audit](./2026-06-13-phase-0-current-state-audit.md)
- [Phase 1 Group Create Refactor Worker Brief](./2026-06-13-phase-1-group-create-refactor-worker-brief.md)
- [Phase 2 Cleanup Worker Brief](./2026-06-13-phase-2-cleanup-worker-brief.md)
- [Document Organization Plan](./DOCUMENT_ORGANIZATION_PLAN.md)
- [Document Organization Result (Codex용 결과 보고서)](./DOCUMENT_ORGANIZATION_RESULT_2026-06-02.md)
- [Active Plan Index](./ACTIVE_PLAN_INDEX.md)
- [Card-Then-Deposit Flow Design](../product/matching/2026-06-02-proposed-match-card-deposit-flow.md)
- [Card-Then-Deposit Implementation Plan](../product/matching/2026-06-02-card-deposit-flow-implementation-plan.md)
- [Pre-Meeting Excitement Info Plan](./2026-06-02-pre-meeting-excitement-info-plan.md)
- [Operator Console Plan (매칭 승인·근거 보고·외모 점수 보정)](./2026-06-02-operator-console-plan.md)
- [Preference Weight Number Input Plan](./2026-06-12-preference-weight-number-input-plan.md)

## Manager Room Operating Order

When starting work from the team-lead room, read and update plans in this order:

1. [Current Implementation Status](./CURRENT_IMPLEMENTATION_STATUS.md) — what is currently true in code.
2. [Thread Context Consolidated Audit](./2026-06-12-thread-context-consolidated-audit.md) — what changed across recent conversations and what still conflicts.
3. [Codex Team Workflow Reset Plan](./2026-06-12-codex-team-workflow-reset-plan.md) — how to split work into manager room, worker rooms, and phase gates.

Current baseline decisions:

- `/dev/preview` is the local design review entry and must not bounce protected onboarding screens back to login.
- MVP auth follows the current email verification/email OTP direction; phone OTP is deferred for later review.
- Preference weights are 4 keys only: `appearance`, `personality`, `height`, `body_type`.
- Daily cards use a user-driven 16:00-20:00 draw window.
- Initial launch is a free beta; deposit/refund/app-fee UX is deferred.
- Daily-card DB migration work is split into a DB worker/phase.

## Management Rules

- New product decisions should be added here first, then linked to older docs as references.
- Older scattered docs remain as historical references unless they conflict with this folder.
- When implementation changes, update `CURRENT_IMPLEMENTATION_STATUS.md` and the relevant plan checklist.
- Team-lead room decisions should be reflected in the three manager docs above before creating new worker-room tasks.

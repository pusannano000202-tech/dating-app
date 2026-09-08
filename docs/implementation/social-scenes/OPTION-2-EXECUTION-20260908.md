# Option 2 implementation plan and execution ledger

> For agentic workers: use superpowers:subagent-driven-development. This ledger extends the approved PRODUCT-SECURITY-REVIEW-20260908.md; its former audit-only boundary does not describe this newly approved implementation turn.

**Goal:** Apply the user's selected second home/department design and approved local security fixes without replacing existing business flows.

**Architecture:** Preserve the existing Next app, Supabase request identity and live role checks. Own participation is separate from public discovery; unknown service state must not become fabricated empty membership. UI changes are presentation-only unless explicitly listed below.

**Tech stack:** Existing Next 15 / React 19 / Supabase / LiveKit / Node test runner.

## Authority and invariants

- User: “2번으로 하고 계획대로 진행 ㄱㄱ”. Design source: generated image exec-b67cd4f8-7e1a-47f6-b2d5-6b47c2a9dfde.png.
- Workspace: social-scene-implementation-20260907, branch codex/social-scene-implementation-20260907, starting HEAD be9078565d8e59f73cbc017f3c7b1484996da1c3; staged empty. Existing dirty work is preserved.
- Local source/test/asset changes and forward-only migration FILES are in scope. No stage, commit, push, database application, real enrollment, provider account setup, payment or deployment.
- Operator and venue partner remain separate. Admin AAL2 must not become a requirement for regular users or partners.
- Membership counts are real confirmed membership, not planned slots. Same-department auto-friending remains removed. Matching chat unlock rules and private continuation choices/payments remain unchanged.

## Work ownership and verification

- [x] Root: app/page.tsx, components/home/*, home participation presentation, lib/home/*, app/api/meetups/mine/route.ts, one home-read migration, home tests and assets. Own state is first in mobile/DOM reading order and the leading column on desktop; discovery follows/beside it. Show read failures explicitly. Added a read-only authenticated own-meetup endpoint, not a capped public-list approximation. Homepage read never creates rooms.
- [x] Department worker: DepartmentChallengeExperience.tsx and adjacent presentation/tests. PLAYMAKER reference applied; real create/invite/acceptance contract and existing title/capacity constraints retained. Planned slots do not claim joined friends. Live DB create/invite remains unapplied/unverified.
- [x] Common security worker: strict internal return URLs, shared production /dev 404 layout, bounded streaming multipart uploads before parsing. Tests cover encoded/backslash paths and missing/false Content-Length.
- [x] Admin worker: AAL2 page/API/RPC enforcement source, safe TOTP enrollment/challenge entry outside admin layouts, single masked exception contact DTO. Forward-only security SQL file, no apply. Embedded tests reject AAL1, revoked roles and stale auth; partner behavior unchanged. Actual enrollment and DB activation unverified.
- [x] Voice follow-through source: exact participation counts and user microphone action preserved; stale room/session/refresh completions guarded and reviewed. Provider credentials/DB application remains an explicit release gate, not a successful-call claim.
- [x] Root review: independent spec and quality review, targeted suites, full type check, final build, secret scan and migration check. Config transient failure and successful reruns recorded in the result report.
- [x] Browser available states: mobile390x844 and desktop1440x1000 screenshot/click checks, no horizontal overflow, tabs/forms/links, fixed mobile primary CTA. Reference and captures compared together. Live DB create/invite and actual media remain unverified; design-qa final integration result is blocked.

## Photo assets

Built-in image generation, individually generated assets (not UI screenshot crops), optimized with Sharp:

- public/social-scenes/department-clubhouse-gaming.webp: four fictional adult Korean students enjoying PC gaming, warm editorial lighting, full heads, no logos/text.
- public/social-scenes/home-playmaker-football.webp: fictional adult campus football friends, turf and warm daylight, central-right full-body player, no logos/text.

These depict illustrative scenes, not actual participants or official school imagery.

## Completion evidence

Append concrete commands, outputs, screenshots, remaining external setup and release blockers in the implementation report. A build or fixture browser pass is not an actual voice call, applied SQL or release approval.

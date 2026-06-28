# Document Organization Plan

Created: 2026-06-02

## Goal

Make project documents easy to find by grouping them by product area instead of leaving every `.md` file directly under `docs/` or mixed inside `docs/handoff/`.

The main rule:

```text
If a document is about matching, it belongs under matching.
If it is about profile/worldcup, it belongs under profile-worldcup.
If it is outdated or only kept for history, move it to archive or delete-candidates.
```

## Recommended Folder Structure

```text
docs/
  README.md
  plans/
    README.md
    ACTIVE_PLAN_INDEX.md
    CURRENT_IMPLEMENTATION_STATUS.md
    DOCUMENT_ORGANIZATION_PLAN.md
  product/
    matching/
      README.md
      matching-system-plan.md
      card-then-deposit-flow.md
      daily-card-spec.md
      sungjun-daily-card-handoff.md
    profile-worldcup/
      README.md
      ideal-worldcup-design.md
      appearance-analysis-schema.md
      appearance-vector-calibration.md
      image-metadata/
    social/
      README.md
      friends-and-invites.md
    operations/
      README.md
      admin-operations.md
      migration-verify-reports.md
      revenue-refund-no-show.md
  engineering/
    README.md
    interface-contract.md
    collaboration.md
    code-review.md
  handoff/
    README.md
    active/
    archive/
  archive/
    2026-05/
    old-master-plans/
  delete-candidates/
    README.md
```

## Folder Meaning

### `docs/plans/`

Current planning hub only.

Use this for:

- active product decisions
- implementation status
- next-step plans
- document organization plans

Do not put old handoff dumps here.

### `docs/product/matching/`

Everything related to:

- 1:1 matching
- 3:3 group matching
- match queue
- deposit/card/confirmation flow
- daily card reveal
- no-show and attendance if it affects match lifecycle

Suggested files to move here:

- `docs/MATCHING_SYSTEM_PLAN.md`
- `docs/DAILY_CARD_SPEC_2026-05-28.md`
- `docs/plans/2026-06-02-proposed-match-card-deposit-flow.md`
- `docs/plans/2026-06-02-card-deposit-flow-implementation-plan.md`
- `docs/handoff/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md`

### `docs/product/profile-worldcup/`

Everything related to:

- 이상형 월드컵
- 외모/성격 벡터
- 남자/여자 이미지 세트
- 이미지 metadata
- appearance analysis

Suggested files to move here:

- `docs/IDEAL_WORLDCUP_64_DESIGN.md`
- `docs/IDEAL_WORLDCUP_MEASURED_*.md`
- `docs/MALE_IDEAL_WORLDCUP_*.md`
- `docs/APPEARANCE_ANALYSIS_*.md`
- `docs/APPEARANCE_VECTOR_CALIBRATION*.md`
- `docs/*IMAGES_METADATA*.md`

### `docs/product/social/`

Everything related to:

- friends
- friend requests
- group invites
- invite links

This folder is currently light, but it should exist because friend/group invite docs will otherwise get mixed into matching docs.

### `docs/product/operations/`

Everything related to:

- admin features
- revenue
- refunds
- no-show penalties
- migration verification reports
- operational policy

Suggested files to move here:

- `docs/ADMIN_OPERATIONS_PLAN.md`
- `docs/MIGRATION_VERIFY_REPORT_*.md`

### `docs/engineering/`

Everything related to:

- interface contracts
- collaboration rules
- code review reports
- project-wide engineering context

Suggested files to move here:

- `docs/INTERFACE_CONTRACT.md`
- `docs/COLLABORATION.md`
- `docs/CODE_REVIEW_2026-05-21.md`
- `docs/UNDERSTANDING_REVIEW_ROOT.md`

### `docs/handoff/`

Keep only handoff documents.

Recommended split:

```text
docs/handoff/active/
docs/handoff/archive/
```

Move only still-useful handoffs into `active`. Move old agent dump files into `archive`.

### `docs/delete-candidates/`

Temporary holding area for files that look unnecessary but should not be deleted immediately.

Rules:

- Do not delete directly on the first cleanup pass.
- Move questionable files here first.
- Keep a `README.md` explaining why each file was moved.
- After one review cycle, delete only files that are confirmed obsolete.

## GitHub Impact

Changing the document folder structure is generally safe for GitHub.

It will not break GitHub just because files are moved. Git handles file moves normally.

The real risks are:

- Broken markdown links between docs.
- Broken references in code, prompts, or README files that point to old doc paths.
- Open PR reviews becoming harder to compare if too many files move at once.
- Search confusion if duplicate old/new copies both remain.

Recommended approach:

1. First commit: create the new folder structure and index files.
2. Second commit: move documents by category.
3. Third commit: update links and references.
4. Fourth commit: move obsolete files into `docs/delete-candidates/`.
5. Do not delete files until after reviewing `delete-candidates`.

This keeps GitHub diffs readable and makes it easy to revert one stage if something is wrong.

## First Cleanup Pass

Recommended first pass without deleting anything:

1. Create category folders:
   - `docs/product/matching/`
   - `docs/product/profile-worldcup/`
   - `docs/product/social/`
   - `docs/product/operations/`
   - `docs/engineering/`
   - `docs/archive/`
   - `docs/delete-candidates/`
2. Add `README.md` to each folder.
3. Move only clearly categorized files.
4. Leave ambiguous files in place for now.
5. Run a link/reference search for old paths.
6. Commit the organization pass.

## Proposed Priority

Start with matching docs because that is the active product area right now.

Priority order:

1. Matching and daily cards
2. Profile/worldcup and image metadata
3. Operations/admin/refund/no-show
4. Engineering contracts and collaboration docs
5. Handoff archive cleanup
6. Delete-candidates review

## Current Recommendation

Do not mass-delete anything yet.

Use `docs/delete-candidates/` as a quarantine folder first. Once the app is stable and the new document index is trusted, then delete confirmed obsolete files in a separate commit.

# Destiny Matching v1.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Destiny prototype into a data-persistent weekly group matching flow: onboarding data is saved, groups can enter the queue, matching can be scored and executed, and the home/group UI reads real queue state.

**Architecture:** Keep Supabase as the source of truth for users, profiles, groups, invitations, queue entries, and match results. Implement deterministic TypeScript matching libraries first, then attach DB loaders/RPCs and UI flows. Use Python Hungarian assignment only after the TypeScript scoring contract is stable.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Auth/Postgres/RLS, Supabase Storage, Python matching runner for Hungarian assignment, existing appearance metadata pipeline.

---

## 0. Source Of Truth

This document supersedes the execution order in `docs/MATCHING_SYSTEM_PLAN.md` where the older plan conflicts with the latest code or decisions.

Inputs used:
- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md`
- `docs/CODEX_REPORT_2026-05-21_PM.md`
- `docs/CODE_REVIEW_2026-05-21.md`
- Current branch: `profile/post-worldcup-decisions-2026-05-21`

Non-negotiable decisions:
- D-01 onboarding order is `basic -> worldcup -> photos -> survey -> schedule -> preferences`.
- D-02 self-worldcup UI is removed from the active flow. Keep historical references only where they do not affect user flow.
- D-03 `self_appearance_score` comes from GPT Vision photo analysis by default, with admin override support.
- D-04 home visualization is weekly matching queue, not Soul Orbs.
- D-05 female ideal worldcup pool is the current final 64 set.
- D-06 male ideal worldcup pool must become MI01-MI64 before female users can complete the real 64-card worldcup.
- D-07 invite-link flow is required for users with zero friends.
- D-08 current `friend_requests` and `friendships` tables remain the baseline.
- D-09 worldcup result persistence to `profiles.preferred_*` and `worldcup_choice_logs` is required before matching.
- D-10 application FKs use `public.users(id)` as the app-side auth mirror.
- D-11 상대 성격 선호 system is owned by Sungjun and must be integrated into matching when ready.
- D-12 venues can be excluded from v1 matching launch unless Sungjun provides a ready integration contract.

---

## 1. Current State

> Update 2026-05-22: Task D / E 까지 완료. 이번 절은 본 세션 종료 시점 기준으로 갱신.

Already implemented:
- `public.users` mirror and new matching tables exist in migrations.
- Worldcup result save path writes `preferred_*` vectors and `worldcup_choice_logs`.
- Profile complete page no longer shows self-worldcup.
- `profiles_public` view is explicitly marked `security_invoker`.
- `group_members` active membership uniqueness uses `left_at`.
- Strict RLS bridge policies exist for friend requests, friendships, group members, invites, and match queue.
- `lib/matching` deterministic core library complete (filter / time / score / group-summary / simulate). 8 tests pass.
- `self_appearance_score` 생산/저장 흐름 완료 (`/api/score` + `lib/profile/appearance-score.ts` + z13 마이그). 9 tests pass.
- **Group API + Invite acceptance flow** (Task D 완료):
  - `app/api/groups/route.ts`, `app/api/group-invites/{route,accept}/route.ts`
  - `app/group/invite/[token]/page.tsx`
  - `accept_group_invite_by_token` RPC + invite guard bypass
- **MatchingPool 실데이터 연결** (Task E 완료):
  - `get_match_pool_stats()` RPC, `/api/match-pool/stats/route.ts`
  - `app/page.tsx` server-side fetch + `components/MatchingPool.tsx` 동적 렌더
- **큐 진입/취소 RPC** (보증금 미통합):
  - `enter_match_pool` / `cancel_match_pool` SECURITY DEFINER + leader 검증
  - `/api/match-pool/{enter,cancel}/route.ts`
- **profiles.display_name + friend/group member summary RPC**:
  - `get_friend_summaries` / `get_group_member_summaries`
  - BasicInfoForm 에 이름 입력, 그룹/친구 UI 에서 placeholder 제거
- **invite_kind 컬럼 정리** — link invite `invited_phone='link:...'` hack 제거.
- **invite 익명 미리보기** — `get_group_invite_by_token` anon GRANT.

Still blocking:
- Supabase migration apply/reset 가 본 환경에서 미검증 (CLI 부재). staging 에서 `supabase db reset` 1회 필요.
- Friend search / request UI 0 — 사용자가 친구를 생성할 경로가 없음. `/group/create` 의 친구 목록은 항상 빈 상태.
- 보증금 / 토스페이먼츠 미통합 — `enter_match_pool` 이 deposits 검증 없이 큐 진입.
- Task F (Python Hungarian batch runner) 미시작 — 성준 영역.
- Male ideal worldcup pool 4 entries — Manus 작업 대기.

---

## 2. Execution Order

Order is fixed for v1.6:

1. DB/RLS stabilization commit.
2. Matching core library with fixtures, no UI dependency.
3. `self_appearance_score` production path.
4. Group creation and invite APIs/RPCs.
5. Group UI DB integration.
6. MatchingPool real stats.
7. Python Hungarian runner and batch persistence.
8. Male MI01-MI64 pool completion in parallel, but release is blocked until complete.

Reasoning:
- UI cannot be made real until DB writes and policies are stable.
- Matching UI cannot be trusted until scoring has deterministic library tests.
- Matching cannot produce fair results until `self_appearance_score` exists.
- Female-user onboarding cannot be complete until male pool is 64 active measured entries.

---

## 3. Task A: DB/RLS Stabilization

**Files:**
- Existing: `app/profile/complete/page.tsx`
- Existing: `docs/CODEX_REPORT_2026-05-21_PM.md`
- Create: `supabase/migrations/20260521_z10_profiles_public_view_security_invoker.sql`
- Create: `supabase/migrations/20260521_z11_relax_group_members_unique_to_active.sql`
- Create: `supabase/migrations/20260521_z12_rls_strict_write_policies.sql`

- [ ] Step A1: Confirm migration filename order.

Run:
```powershell
Get-ChildItem supabase\migrations | Sort-Object Name | Select-Object Name
```

Expected order:
```text
20260521_00_create_public_users_table.sql
20260521_matching_create_core_tables.sql
20260521_profile_add_preference_vectors.sql
20260521_z10_profiles_public_view_security_invoker.sql
20260521_z11_relax_group_members_unique_to_active.sql
20260521_z12_rls_strict_write_policies.sql
```

- [ ] Step A2: Run local static policy checks.

Run:
```powershell
$p='supabase\migrations\20260521_z12_rls_strict_write_policies.sql'
Select-String -Path $p -Pattern 'CREATE POLICY "friend_requests_participant_update"'
Select-String -Path $p -Pattern 'CREATE POLICY "group_invites_participant_update"'
Select-String -Path $p -Pattern 'CREATE POLICY "group_members_self_or_leader_delete"'
```

Expected: no matches.

- [ ] Step A3: Run TypeScript and lint verification.

Run:
```powershell
npm run typecheck
npm run lint
```

Expected:
```text
tsc --noEmit exits 0
next lint exits 0 with no warnings or errors
```

- [ ] Step A4: Run real migration validation in an environment with Supabase CLI.

Run:
```powershell
supabase db reset
```

Expected:
```text
All migrations apply in filename order without missing relation, duplicate policy, or RLS recursion errors.
```

- [ ] Step A5: Commit DB/RLS stabilization.

Run:
```powershell
git add app/profile/complete/page.tsx docs/CODEX_REPORT_2026-05-21_PM.md supabase/migrations/20260521_z10_profiles_public_view_security_invoker.sql supabase/migrations/20260521_z11_relax_group_members_unique_to_active.sql supabase/migrations/20260521_z12_rls_strict_write_policies.sql
git commit -m "fix(db): tighten matching RLS and active group membership"
```

---

## 4. Task B: Matching Core Library

**Files:**
- Existing: `lib/matching/config.ts`
- Create: `lib/matching/types.ts`
- Create: `lib/matching/time.ts`
- Create: `lib/matching/filter.ts`
- Create: `lib/matching/score.ts`
- Create: `lib/matching/group-summary.ts`
- Create: `lib/matching/simulate.ts`
- Create: `lib/matching/fixtures.ts`

Required public API:
- `intersectWeekdaySlots(a, b)`
- `hasTimeslotOverlap(a, b)`
- `isMatchable(a, b, config)`
- `pairScore(a, b, config)`
- `summarizeGroup(group, members)`
- `simulateBatch(groups, config)`

Implementation rules:
- No DB reads in `time.ts`, `filter.ts`, or `score.ts`.
- No React imports in `lib/matching`.
- Pair scoring must return both final score and breakdown.
- Hard filter must return structured reason codes:
  - `same_gender`
  - `size_mismatch`
  - `department_blocked`
  - `no_time_overlap`
  - `excluded_pair`
  - `score_band_mismatch`
  - `missing_required_profile_data`
- Threshold defaults come from `lib/matching/config.ts`.

- [ ] Step B1: Add a minimal test runner decision.

Preferred:
```powershell
npm install -D vitest
```

If dependency install is blocked, implement a temporary `scripts/check-matching-core.mjs` that imports compiled JS after `tsc` is configured to emit testable output. Do not implement matching core without an automated regression path.

- [ ] Step B2: Write failing tests for time overlap.

Test cases:
- two groups sharing Saturday afternoon returns overlap.
- two groups with no common slot returns empty overlap.
- empty availability returns empty overlap.

- [ ] Step B3: Implement `lib/matching/time.ts`.

Required behavior:
- Input is a normalized object keyed by weekday.
- Output is the exact intersection, not a boolean-only result.

- [ ] Step B4: Write failing tests for hard filters.

Test cases:
- same gender rejected.
- different group size rejected.
- score band gap over 15 rejected.
- no time overlap rejected.
- excluded pair rejected.
- valid male/female same-size group with overlap passes.

- [ ] Step B5: Implement `lib/matching/filter.ts`.

Use config constants only. Do not duplicate magic values.

- [ ] Step B6: Write failing tests for `pairScore`.

Test cases:
- symmetric high preference produces score above threshold.
- one-sided preference gap applies asymmetry penalty.
- missing vector returns `missing_required_profile_data` at filter stage before score.
- score breakdown includes `appearance_ab`, `appearance_ba`, `personality`, `time`, `score_band`, `weight_alignment`, `asymmetry_penalty`.

- [ ] Step B7: Implement `lib/matching/score.ts`.

Use cosine similarity for vector comparisons and clamp final score to `[0, 1]`.

- [ ] Step B8: Commit matching core.

Run:
```powershell
npm run typecheck
npm run lint
git add lib/matching package.json package-lock.json
git commit -m "feat(matching): add deterministic matching core library"
```

---

## 5. Task C: self_appearance_score Production

**Files:**
- Existing: `app/profile/photos/page.tsx`
- Existing: `app/api/score/route.ts`
- Create: `supabase/migrations/20260521_z13_profile_self_appearance_score_sources.sql`
- Create: `lib/profile/appearance-score.ts`

Decision:
- v1 requires automatic score.
- Admin UI can ship after v1.
- DB must support override now so operations can correct scores through Supabase Studio.

Required columns:
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_appearance_score_auto FLOAT CHECK (self_appearance_score_auto BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS self_appearance_score_override FLOAT CHECK (self_appearance_score_override BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS self_appearance_score_source TEXT
    CHECK (self_appearance_score_source IN ('auto', 'override', 'legacy')),
  ADD COLUMN IF NOT EXISTS self_appearance_score_updated_at TIMESTAMPTZ;
```

Effective score rule:
```ts
effective = override ?? auto ?? legacySelfAppearanceScore
```

- [ ] Step C1: Add pure resolver tests for `resolveSelfAppearanceScore`.
- [ ] Step C2: Implement `lib/profile/appearance-score.ts`.
- [ ] Step C3: Update `/api/score` or add a new internal API so successful scoring writes `profiles.self_appearance_score_auto` and effective `profiles.self_appearance_score`.
- [ ] Step C4: Make `/profile/photos` block progression or show retry state when score persistence fails.
- [ ] Step C5: Commit.

Run:
```powershell
npm run typecheck
npm run lint
git commit -m "feat(profile): persist self appearance score from photo analysis"
```

---

## 6. Task D: Group APIs And Invite Link Flow

**Files:**
- Create: `app/api/groups/route.ts`
- Create: `app/api/groups/[groupId]/members/route.ts`
- Create: `app/api/group-invites/route.ts`
- Create: `app/group/invite/[token]/page.tsx`
- Modify: `app/group/create/page.tsx`

Required flows:
- Create group.
- Insert leader into `group_members`.
- Fetch active friendships.
- Create invite by user or phone.
- Accept invite from token.
- Add accepted invited user to group.
- Prevent group size over 3.
- Preserve `left_at` history.

Implementation rule:
- Prefer server routes/RPC-style writes over direct client table writes for multi-table transitions.

- [ ] Step D1: Implement group creation route.
- [ ] Step D2: Implement invite creation route.
- [ ] Step D3: Implement invite acceptance route/page.
- [ ] Step D4: Replace `INITIAL_FRIENDS` mock state in `app/group/create/page.tsx`.
- [ ] Step D5: Commit.

Run:
```powershell
npm run typecheck
npm run lint
git commit -m "feat(groups): connect group creation and invites to Supabase"
```

---

## 7. Task E: MatchingPool Real Stats

**Files:**
- Existing: `components/MatchingPool.tsx`
- Existing: `app/page.tsx`
- Create: `app/api/match-pool/stats/route.ts`

Stats contract:
```ts
interface MatchPoolStats {
  female: number
  male: number
  rows: Array<{
    label: string
    male: number
    female: number
    active: boolean
  }>
}
```

Data source:
- `match_pool.status IN ('waiting', 'rolled_over')`
- join `groups.gender`
- group by `groups.size` and availability bucket when that field exists

- [ ] Step E1: Add API route returning real queue stats.
- [ ] Step E2: Update home page to fetch stats server-side or via client effect.
- [ ] Step E3: Keep hardcoded values only as skeleton/loading fallback.
- [ ] Step E4: Commit.

Run:
```powershell
npm run typecheck
npm run lint
git commit -m "feat(home): show real matching pool stats"
```

---

## 8. Task F: Hungarian Batch Runner

**Files:**
- Create: `python/matching/engine.py`
- Create: `python/matching/batch.py`
- Create: `python/matching/tests/test_engine.py`
- Create: `app/api/admin/matching/run-batch/route.ts`

Decision:
- Keep pair scoring in TypeScript until the scoring contract stabilizes.
- Python receives a cost matrix and returns selected pairs.
- Persist matches in Supabase from a controlled server/admin path.

Required behavior:
- Do not match groups with score below threshold.
- Do not match same gender or different size.
- Unmatched groups stay in `match_pool`.
- Matched groups update `match_pool.status='matched'` and create `matches` row.

- [ ] Step F1: Implement Python engine with fixture matrix tests.
- [ ] Step F2: Add batch route guarded by admin/service role.
- [ ] Step F3: Run a dry simulation with fixture groups.
- [ ] Step F4: Commit.

Run:
```powershell
python -m unittest discover python/matching/tests
npm run typecheck
npm run lint
git commit -m "feat(matching): add Hungarian batch runner"
```

---

## 9. Parallel External Track: Male MI01-MI64

Owner: Manus / image pipeline owner.

Acceptance criteria:
- `public/appearance-ideal/METADATA.json` has 64 male entries.
- Every male entry has `status: "active"`.
- Every male entry has `measured.appearance_vector`.
- `selectActivePool(meta, 'male')` returns 64.
- Female users see a real 64-card ideal worldcup.

Blocking rule:
- v1 matching can be tested with fixtures before MI01-MI64 lands.
- v1 release cannot claim complete onboarding for female users until MI01-MI64 lands.

Verification command:
```powershell
Select-String -Path public\appearance-ideal\METADATA.json -Pattern '"gender": "male"' | Measure-Object
```

Expected count after completion:
```text
64
```

---

## 10. Release Gates

Before v1 release:
- [ ] Supabase migrations apply from clean DB.
- [ ] RLS checks confirm users cannot read or write unrelated groups.
- [ ] Ideal worldcup persists `preferred_*` and choice logs.
- [ ] `self_appearance_score` exists for every profile entering queue.
- [ ] Male and female ideal pools each have 64 active measured entries.
- [ ] Group create page uses Supabase data, not mock state.
- [ ] Home MatchingPool reads DB stats.
- [ ] Matching core has automated tests.
- [ ] Batch runner creates `matches` rows and updates `match_pool`.
- [ ] Raw vectors and appearance scores are not exposed in user-facing UI.

---

## 11. Immediate Next Commit Plan

Commit current DB/RLS/profile/doc changes first. Then implement Task B.

Recommended commits:
```text
fix(db): tighten matching RLS and active group membership
docs: add matching v1.6 master plan
```

Do not start group UI DB integration before Task B matching core has a tested contract.

---

## 12. Track Update 2026-05-22 (Claude Code)

Task D ~ E 완료 이후 추가된 작업/트랙. 본 절은 이후 작업자가 받아가야 할 순서를 명시.

### 12.A Fresh DB Apply 검증 🟡 정적 검증 통과 (실제 적용 미수행)

마이그 13개 (z14~z26) 신규. 본 환경에 Supabase CLI / Docker / Postgres 모두 부재로 `supabase db reset` 실행 불가.

대신 `scripts/verify-migrations.py` 로 정적 검증 완료:
- 24개 파일 / 152 객체 정의 / 452 참조
- ASCII 정렬 순서 / 의존성 / 정책·트리거 중복 / $$ 짝 모두 PASS

자세한 결과: `docs/MIGRATION_VERIFY_REPORT_2026-05-22.md`

**운영 출시 전 필수**:
- Supabase 클라우드 dev 프로젝트 또는 staging 에서 1회 `supabase db reset` + RPC 흐름 수동 검증
- 12.E 의 RPC bypass guard 가 실제로 동작하는지 (BYPASSRLS 환경 의존성 해소 확인)
- leader 가 그룹 생성 → invite 수락 → 보증금 결제 → 큐 진입 흐름 end-to-end

### 12.B Friend Search / Request UI ✅ 완료 (2026-05-22)

`supabase/migrations/20260521_z23_friend_request_flow.sql` + `z26` + API + UI 로 완료.

구현 내용:
- 전화번호로 친구 요청 보내기 (가입 전 사용자도 가능, 가입 시 자동 매칭 트리거)
- 받은 요청 수락 (accept_friend_request RPC: status update + friendships insert 한 트랜잭션)
- 받은 요청 거절 / 보낸 요청 취소
- /friends 페이지: 친구 목록 + 받은/보낸 요청 + 전화번호 추가 폼
- 본인 phone 으로 온 receiver_user_id=NULL 요청도 SELECT 정책으로 조회 가능
- friend_requests 카드에 sender/receiver display_name 안전 노출 (get_friend_request_summaries RPC)
- /group/create 친구 0명 빈 상태에서 /friends 진입 CTA

### 12.C 보증금 / 토스페이먼츠 🟡 mock 완료 (2026-05-22) / 실결제 미통합

`supabase/migrations/20260521_z24_deposit_check_in_enter_match_pool.sql` + `z25` + API + UI 로 mock 단계 완료.

mock 단계:
- enter_match_pool RPC 가 활성 멤버 전원의 paid/held 보증금 검증 (없으면 deposit_not_paid)
- mock_pay_deposit RPC: 본인 deposit insert (status='paid', toss_payment_key='MOCK_...')
- /api/deposits + /api/deposits/summary
- /group/create UI: 내 보증금 결제 카드 + 그룹 전체 결제 현황 (n/m + 멤버 칩) + 큐 진입 버튼 disabled until paid

다음 트랙 (운영 전 필수):
- 토스페이먼츠 sandbox 키
- client SDK 결제창 호출
- /api/payments/toss/webhook/route.ts (deposits.status='paid' set + paid_at)
- mock_pay_deposit → 실 결제 트리거로 교체 (또는 둘 다 유지하되 dev flag)
- 환불 / 노쇼 보상 분배 (deposits.distribution_to)

### 12.D Task F: Python Hungarian Batch (Medium, 성준 영역)

본 master plan 7절 그대로 유지. 충현 단독 진입 X. 성준 ping 필요.

### 12.E z12 BYPASSRLS 안전 패턴 통일 ✅ 완료 (2026-05-22)

`supabase/migrations/20260521_z22_rpc_bypass_guards.sql` 로 완료.

적용된 항목:
- `group_members_strict_insert` 정책에 `app.bypass_group_members_guard` 경로 추가
- `match_pool_member_insert` / `match_pool_member_cancel_update` 정책에 `app.bypass_match_pool_guard`
- `groups_leader_write` 정책에 `app.bypass_groups_guard`
- `guard_match_pool_update` trigger 에 bypass 분기
- `accept_group_invite_by_token` / `enter_match_pool` / `cancel_match_pool` RPC 본문에서 `set_config(..., 'on', TRUE)` 호출 (트랜잭션 종료 시 auto reset)

friendships INSERT 정책에 bypass 추가는 12.B (friend RPC) 작업 시 같이 적용 예정.

### 12.F UI 잔여 (Low)

- `/profile/edit` 에 display_name 단독 수정 입력 추가 (현재는 `/profile/basic` 전체 폼만)
- group_invites pending 카드의 link invite 표시 UX 개선 ✅ 일부 완료 (link 라벨 분기)
- 친구 목록 빈 상태 안내 카피 개선 ✅ 완료 (/friends CTA 추가)

### 12.G Male MI01-MI64 (External Track)

Manus 작업 — 8절 그대로 유지. v1 출시 차단 항목.

---

## 13. Handoff Files Index

```
docs/handoff/CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md   (Codex → Claude, 본 세션 입력)
docs/handoff/CLAUDE_TO_CODEX_HANDOFF_2026-05-22.md   (Claude → Codex, 본 세션 출력)
docs/handoff/MANUS_MALE_64_HANDOFF.md                 (Manus 작업)
docs/handoff/ADMIN_APPEARANCE_SCORE_OVERRIDE.md       (D-03 admin 설계)
```

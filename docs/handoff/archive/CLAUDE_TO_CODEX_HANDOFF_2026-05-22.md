# Claude Code to Codex Handoff - 2026-05-22

> 다음 작업자(Codex)가 바로 이어받을 수 있게 정리한 인수인계서.
> 본 세션은 Codex 가 어제(2026-05-22 새벽) 남긴 `docs/handoff/CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md`
> 를 받아 Task D 이후 + 추가 정리까지 진행한 결과.

---

## 0. Codex에게 먼저

1. `git status --short --branch` 로 현재 상태 확인.
2. `git log --oneline -15` 로 본 세션에서 추가된 commit 7개 확인.
3. 본 문서 8절 "다음 우선순위" 부터 실행.
4. **새 트랙 시작 전에 본 문서 11절 "하지 말 것" 먼저 읽기.**

---

## 1. Repo / Branch State

- Branch: `profile/post-worldcup-decisions-2026-05-21`
- 최신 푸시 커밋 (이번 세션 종료 시):
  ```
  2ee36ac chore(invite): drop link-phone hack via invite_kind column
  ```
- 워킹트리 상태: clean (이 인수인계서 파일 작성 후 untracked 1건만 남음)
- 모든 변경은 origin 에 push 완료. main 직접 push 없음. CLAUDE.md 절대 규칙 준수.

---

## 2. App 이해 (현 시점 기준)

Codex 가 작성한 `CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md` 2절 내용이 그대로 유효. 추가/변경된 부분만 명시:

- 그룹 / 초대 / 매칭 큐 흐름이 DB-backed 으로 동작 (mock 제거)
- 홈 랜딩 페이지의 매칭 풀 시각화가 실제 RPC 집계값을 사용
- 친구 목록에서 `display_name` 노출 (NULL 폴백 유지)
- 초대 링크가 `invited_phone='link:xxx'` hack 없이 `invite_kind='link'` 로 정리
- 큐 진입 시 `groups.status` `forming` → `ready`, 취소 시 `ready` → `forming` 자동 전환

---

## 3. Master Plan v1.6 진척도 업데이트

`docs/MASTER_PLAN_V1_6_2026-05-21.md` 기준:

| Task | 상태 (Codex 마지막 보고) | 상태 (이번 세션 종료) |
|---|---|---|
| Task A: DB/RLS stabilization | ✅ 완료 | ✅ (유지) |
| Task B: Matching core library | ✅ 완료 | ✅ (유지) |
| Task C: self_appearance_score | ✅ 완료 | ✅ (유지) |
| **Task D: Group APIs & invite** | ⏳ 미커밋 | ✅ **본 세션 완료/커밋/푸시** |
| **Task E: MatchingPool real stats** | ❌ 미시작 | ✅ **본 세션 완료** |
| **Queue entry / deposit flow** (Plan 12.B) | ❌ 미시작 | 🟡 **큐 진입만 완료 (보증금 미통합)** |
| Task F: Hungarian batch runner | ❌ 미시작 | ❌ (성준 영역, 본 세션 미터치) |
| Male MI01-MI64 pool | ❌ 미완 | ❌ (Manus 작업 대기, 외부 트랙) |

이번 세션 추가 산출물:
- Task D 정리 + 안티온 디테일 (invite_kind, display_name 등)
- Task E 완료
- 큐 진입/취소 RPC 신설 (deposits 통합은 다음 트랙)
- invite 미로그인 미리보기 허용

---

## 4. 본 세션 commit 목록 (origin push 완료)

원격에 모두 반영. 모든 mig 파일은 `z` prefix 로 의존 마이그(`_matching_*`, `_profile_*`) 이후에 적용되도록 정렬됨.

```
eb24f4f feat(groups): connect group creation and invites to Supabase
f47a788 feat(matching-pool): connect MatchingPool to real DB stats via RPC
9e28b1b feat(match-pool): wire queue enter/cancel via RPC
46e318d feat(invite): allow anonymous invite token preview
0199a08 feat(profile): add display_name + friend summary RPC
2ee36ac chore(invite): drop link-phone hack via invite_kind column
0456075 docs: handoff Claude -> Codex 2026-05-22
7572322 feat(groups): show real member display_name in group card
8436abc docs(master-plan): mark Task D/E done + add 12.A~12.G next tracks
4d6fae5 fix(db): explicit RPC bypass guard for group/match_pool RLS
```

(앞서 작업한 d8d1412 / 94956d5 / 7f0b96a / e1a4aef 은 Codex 세션 산출물 — 변경 없이 유지)

### 4-A. eb24f4f feat(groups): Task D 완료

- `lib/supabase-server.ts`: App Router 공용 server client (`@supabase/ssr` + cookies)
- `app/api/groups/route.ts`:
  - GET: 활성 그룹 + 멤버 + invite + 친구 목록 + `current_user_id` 반환
  - POST: leader 본인이 그룹 생성 + leader 멤버 insert (실패 시 그룹 삭제 롤백)
- `app/api/group-invites/route.ts`:
  - GET: `get_group_invite_by_token` RPC (token 으로 안전 필드만 조회)
  - POST: `invite_kind` 명시 invite 생성 (token + 7 일 만료)
- `app/api/group-invites/accept/route.ts`: POST → `accept_group_invite_by_token` RPC
- `app/group/invite/[token]/page.tsx`: 토큰 페이지, 미로그인/로그인 분기
- `supabase/migrations/20260521_z14_group_invite_token_acceptance.sql`:
  - `get_group_invite_by_token(p_token)` / `accept_group_invite_by_token(p_token)` SECURITY DEFINER RPC
  - `app.bypass_group_invites_guard` 패턴으로 RPC 안에서 invite guard 우회
- `app/group/create/page.tsx`: 하드코딩 mock 제거, DB 기반 그룹/초대/멤버 렌더

### 4-B. f47a788 feat(matching-pool): Task E 완료

- `supabase/migrations/20260521_z15_match_pool_stats_rpc.sql`:
  - `get_match_pool_stats()` SECURITY DEFINER RPC. 집계값만(gender × group_size). anon/authenticated 모두 호출 가능
- `app/api/match-pool/stats/route.ts`: GET RPC + `aggregate()` 함수 (page.tsx 재사용)
- `components/MatchingPool.tsx`: 하드코딩 제거. `bySize` 기반 동적 QUEUE_ROWS. PoolStats 타입 export
- `app/page.tsx`: server-side RPC fetch → LandingPage prop. Supabase 미설정 시 빈 통계 폴백

### 4-C. 9e28b1b feat(match-pool): queue enter/cancel

- `supabase/migrations/20260521_z16_match_pool_enter_cancel_rpc.sql`:
  - `enter_match_pool(p_group_id)`: leader 만 호출. 활성 멤버 >= 2 검증, `groups.status` forming→ready, `match_pool` waiting insert. **보증금 검증 없음 — 후속 작업**
  - `cancel_match_pool(p_group_id)`: leader 만 호출. `match_pool` waiting/rolled_over → cancelled + `groups.status` ready→forming 복귀
- `app/api/match-pool/enter/route.ts` / `cancel/route.ts`
- `app/api/groups/route.ts`: 응답에 `current_user_id` 포함 (client leader 판정용)
- `app/group/create/page.tsx`:
  - `isLeader` / `inQueue` / `canEnterQueue` / `canCancelQueue` 파생값
  - enterQueue / cancelQueue 핸들러 + 한글 에러 매핑 (`translateQueueError`)
  - 큐 진입 후 UI 가 "큐에서 빠지기" 버튼으로 전환

### 4-D. 46e318d feat(invite): anonymous preview

- `supabase/migrations/20260521_z17_grant_invite_lookup_to_anon.sql`:
  - `get_group_invite_by_token` RPC 에 `anon` GRANT 추가
- `app/api/group-invites/route.ts` GET: user 체크 제거, `authenticated: boolean` 동봉
- `app/group/invite/[token]/page.tsx`: unauthorized state 에서도 그룹 이름/사이즈 미리보기 + 로그인 next 파라미터

### 4-E. 0199a08 feat(profile): display_name

- `supabase/migrations/20260521_z18_profile_display_name.sql`:
  - `profiles.display_name TEXT` 추가
  - `profiles_public` view 재정의 (display_name 포함, `security_invoker = on`)
- `supabase/migrations/20260521_z19_friend_summaries_rpc.sql`:
  - `get_friend_summaries()` SECURITY DEFINER RPC. 본인의 active 친구 (user_id + display_name + status) 만 반환. 외모/벡터/big5 등 미노출
- `app/api/groups/route.ts` loadFriends: friendships 직접 select → RPC 호출
- `components/profile/BasicInfoForm.tsx`: display_name 입력 필드 (2~20자)
- `app/profile/basic/page.tsx`: profiles SELECT 에 display_name 포함
- `app/profile/edit/page.tsx`: 요약 카드 상단에 display_name 표시

### 4-F. 2ee36ac chore(invite): invite_kind cleanup

- `supabase/migrations/20260521_z20_group_invite_kind.sql`:
  - `group_invites.invite_kind` 컬럼 (`'user' | 'phone' | 'link'`)
  - 기존 row 백필 + 임시 `link:xxx` invited_phone 값 NULL 정리
  - 기존 OR-CHECK 제거 + invite_kind 기반 새 CHECK
- `app/api/group-invites/route.ts`: invite_kind 명시 insert. link 일 때 invited_phone NULL
- 타입 + UI 분기 정리 (`'공개 초대 링크'` 라벨)

---

## 5. 검증 결과 (이번 세션)

각 commit 직전에 모두 수행:
```text
npm run typecheck   → tsc --noEmit exits 0
npm run lint        → No ESLint warnings or errors
npm run test:profile  → 9 pass / 0 fail (Codex 세션 산출물; 본 세션에서도 통과 확인)
npm run test:matching → 8 pass / 0 fail
```

미수행 (환경 제약):
- `supabase db reset` — Supabase CLI 미설치. **fresh DB 적용 검증은 staging 환경에서 필수**
- 실제 dev server 브라우저 동작 — timeout 우려로 skip

---

## 6. 마이그레이션 순서 검증

ASCII 정렬 기준 적용 순서:
```
20260514_profile_create_appearance_tables.sql
20260514_profile_create_profiles_table.sql
20260515_profile_add_self_appearance_score.sql
20260515_profile_create_photos_table.sql
20260516_matching_add_venues_and_match_meetings.sql
20260521_00_create_public_users_table.sql
20260521_matching_create_core_tables.sql
20260521_profile_add_preference_vectors.sql
20260521_z10_profiles_public_view_security_invoker.sql
20260521_z11_relax_group_members_unique_to_active.sql
20260521_z12_rls_strict_write_policies.sql
20260521_z13_profile_self_appearance_score_sources.sql
20260521_z14_group_invite_token_acceptance.sql
20260521_z15_match_pool_stats_rpc.sql
20260521_z16_match_pool_enter_cancel_rpc.sql
20260521_z17_grant_invite_lookup_to_anon.sql
20260521_z18_profile_display_name.sql
20260521_z19_friend_summaries_rpc.sql
20260521_z20_group_invite_kind.sql
20260521_z21_group_member_summaries_rpc.sql
20260521_z22_rpc_bypass_guards.sql
```

`z` prefix 덕분에 모든 후속 마이그레이션이 의존 테이블 생성 이후에 적용됨 (Codex 가 이전 세션에 지적한 Critical 이슈는 해결됨).

---

## 7. Known limitations / risks

### 7-A. SECURITY DEFINER RPC + RLS 가정 → **해소됨 (z22)**

본 세션 중간에 `supabase/migrations/20260521_z22_rpc_bypass_guards.sql` 에서 명시적 bypass guard 패턴으로 통일.

적용 후 RPC 들이 BYPASSRLS attribute 환경 의존 없이 동작:
- `accept_group_invite_by_token`: group_members INSERT 시 `app.bypass_group_members_guard` 사용
- `enter_match_pool`: groups UPDATE + match_pool INSERT 시 각각 bypass
- `cancel_match_pool`: groups UPDATE + match_pool UPDATE 시 각각 bypass

검증 필요 항목은 fresh DB apply 만 남음 (12-A 참고).

friendships INSERT 는 다음 세션 friend RPC 작업 시 같이 정리 예정.

### 7-B. 보증금 흐름 미통합

`enter_match_pool` 이 deposits.paid 검증 없이 큐 진입. 토스페이먼츠 통합 + deposits 테이블 흐름은 별도 트랙.

UI 에 명시 메시지 있음: "보증금 결제는 곧 연결돼요. 지금은 미리 큐에만 들어가요."

운영 출시 전 반드시 enter_match_pool 에 deposits.status='paid' EXISTS 조건 추가 필요.

### 7-C. display_name 기존 사용자 NULL

마이그레이션 적용 후 기존 가입자는 `display_name = NULL` 상태. `/profile/basic` 재방문 시 입력 필요. 친구 목록에서는 NULL fallback (`친구 abcd1234`) 표시.

UI 에 별도 onboarding 강제 없음 — 사용자 자율.

### 7-D. group_members + match_pool RLS bypass guard → **해소됨 (z22)**

z22 마이그레이션에서 모든 정책에 bypass 경로 추가 + RPC 본문에 set_config 호출. 7-A 와 같이 통합 해소.

### 7-E. dev server 브라우저 검증 미수행

본 세션에서는 `npm run dev` 띄우고 실제 페이지 로드 검증 안 함. typecheck/lint/test 통과로 갈음.

다음 작업자는 가능하면 다음 시나리오 visual 검증:
- 미로그인 사용자가 `/group/invite/<token>` 접속 → 그룹 이름 보이고 로그인 버튼 노출
- 가입자가 `/group/create` → 빈 그룹 생성 → invite 링크 복사 → 다른 가입자가 수락 → 멤버 2명 → 큐 진입 → 큐에서 빠지기
- `/` 랜딩에서 큐 통계가 0 또는 실제 집계값 표시

### 7-F. friend search / request UI 미구현

현재 친구를 만들 수 있는 경로가 없음. friendships 행이 생성될 흐름이 어떤 것도 없으므로 `/group/create` 의 "친구 목록" 섹션은 항상 빈 상태.

기존 `friend_requests` 테이블 + z12 RLS 정책은 갖춰져 있지만, UI 가 없음. 다음 우선순위.

---

## 8. 다음 우선순위 (Codex 가 받아 진행)

### 8-1. (High) Fresh DB Apply 검증

**왜 먼저인가**: 본 세션에서 마이그 7개 신규. 실제 Supabase 적용 검증 안 됨. 의존 순서, RLS 동작, SECURITY DEFINER + BYPASSRLS 가정 모두 미검증.

```powershell
supabase db reset
```

검증 항목:
- [ ] 모든 마이그가 ASCII 정렬 순서대로 에러 없이 적용
- [ ] policy duplicate / missing relation / RLS recursion 없음
- [ ] (수동) leader 가 enter_match_pool 호출 → match_pool waiting row 생성됨
- [ ] (수동) invitee 가 accept_group_invite_by_token 호출 → group_members row 생성됨
- [ ] (수동) anon 으로 `SELECT * FROM get_match_pool_stats()` 호출 → 집계값 반환

**만약 7-A 가정이 깨지면**: 7-D 처방 적용.

### 8-2. (High) Friend Search / Request UI

`friend_requests` 테이블 + RLS 정책 + guard trigger 까지 있지만 UI 가 0. 현재 친구가 생기는 경로가 없어서 `/group/create` 친구 목록이 항상 빈 상태.

필요한 것:
- `/friends/page.tsx`: 친구 목록 + 받은 요청 + 보낸 요청
- `app/api/friend-requests/route.ts`:
  - GET: 본인이 sender 또는 receiver 인 모든 request
  - POST: 전화번호 또는 user_id 로 friend_request 생성
- `app/api/friend-requests/[id]/route.ts`:
  - POST `accept` / `decline`
- friendships row 생성: accept 시 client-side insert (z12 RLS 가 accepted request 검증)

추가 RPC 도 가능: `accept_friend_request(p_request_id)` SECURITY DEFINER 가 한 번에 friendships insert 까지.

### 8-3. (High) Deposit / Toss Payments

`enter_match_pool` 이 보증금 검증 없이 진입 중. v1 출시 전 통합 필수.

흐름:
- `deposits` 테이블 INSERT (status='pending', toss_order_id)
- 토스페이먼츠 결제창 호출 (client SDK)
- 토스 webhook → `deposits.status='paid'`, paid_at set
- `enter_match_pool` 안에 deposits.status='paid' EXISTS 검증 추가

`/api/payments/toss/webhook/route.ts` 와 `/api/deposits/route.ts` 신규. 토스 sandbox 키 필요.

### 8-4. (Medium) Task F: Python Hungarian Batch Runner

성준 영역. `lib/matching/simulate.ts` 까지는 충현이 구현. Python 측에서 cost matrix 받아 헝가리안 알고리즘 실행 + 결과를 Supabase 에 persist.

`python/matching/engine.py` / `batch.py` / `tests/` / `app/api/admin/matching/run-batch/route.ts`.

성준에게 ping. 충현 단독 진입 X.

### 8-5. (Medium) Male MI01-MI64

D-06 결정. Manus 작업. 외부 트랙. `docs/handoff/MANUS_MALE_64_HANDOFF.md` 참고. 마감 기한 없으면 master plan 에 명시 필요.

### 8-6. z12 BYPASSRLS 안전 패턴 통일 → **완료 (z22)**

본 세션 z22 에서 group_members / match_pool / groups 정책 + 관련 RPC 통일. friendships INSERT 정책 bypass 는 friend RPC 작성 시 12.B 에서 마저 처리.

### 8-7. (Low) UI 잔여 정리

- `/profile/edit` 에 display_name 직접 수정 입력 (현재는 `/profile/basic` 거쳐야 함)
- group_members 의 멤버 카드 이름이 아직 placeholder. RPC 로 멤버 display_name fetch 또는 `loadMembers` 가 profiles join

---

## 9. 검증 명령어

매 commit 전 / 머지 전 실행:
```powershell
npm run typecheck
npm run lint
npm run test:profile
npm run test:matching
```

마이그레이션 검증 (Supabase CLI 있는 환경):
```powershell
supabase db reset
```

git 상태:
```powershell
git status --short --branch
git log --oneline -15
```

---

## 10. Source Of Truth 파일

이번 세션 이후 결정/맥락을 담은 파일:
- `docs/MASTER_PLAN_V1_6_2026-05-21.md` (Codex 작성, Task D/E 까지 완료 표시 필요)
- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-01~D-12 (변경 없음)
- `docs/CODEX_REPORT_2026-05-21_PM.md` (변경 없음)
- `docs/handoff/CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md` (Codex → Claude. 본 세션 입력)
- `docs/handoff/CLAUDE_TO_CODEX_HANDOFF_2026-05-22.md` (본 문서. Claude → Codex)
- `docs/handoff/MANUS_MALE_64_HANDOFF.md` (Manus 작업)
- `docs/handoff/ADMIN_APPEARANCE_SCORE_OVERRIDE.md` (D-03 admin 설계)

---

## 11. 하지 말 것

- `/profile/self-worldcup` 부활 금지 (D-02)
- onboarding 순서 변경 시 D-01 문서 갱신 없이 코드만 바꾸지 말 것
- raw 외모 벡터 / 외모 점수 / big5 / preferred_* 컬럼 사용자 UI 노출 금지
- main 직접 push 금지. 항상 PR + 성준 리뷰
- `lib/types.ts` 수정 시 반드시 PR + 성준 리뷰
- supabase migrations 신규 추가 시 PR + 성준 확인
- INTERFACE_CONTRACT.md 의 타입/컬럼명 임의 변경 금지
- `supabase db reset` 검증 안 한 상태로 운영/스테이징에 마이그 적용 금지
- `enter_match_pool` 에 deposits 검증 추가 전까지는 운영 release 금지

---

## 12. 짧은 요약 (Codex)

Codex 마지막 세션 끝난 시점 → 본 세션 끝 시점 변화:

**완료된 것**:
- Task D (group APIs + invite acceptance) 리뷰 + 커밋 + 푸시
- Task E (MatchingPool 실데이터) 완료
- 큐 진입/취소 RPC + UI 연결 (보증금 제외)
- invite 익명 미리보기 허용 (UX 개선)
- profiles.display_name + friend summary RPC (placeholder 제거)
- invite_kind 컬럼으로 link hack 제거

**아직 안 된 것**:
- fresh DB apply 검증 (CLI 없음)
- friend search/request UI (현재 친구 생성 경로 없음)
- 보증금/토스 통합 (큐 진입 검증 누락)
- Python 헝가리안 배치 (Task F, 성준 영역)
- 남자 풀 MI01-MI64 (Manus 작업)

**다음 1순위**: 8-1 fresh DB apply 검증. 7-A 가정이 깨지면 7-D 처방. 통과하면 8-2 friend UI 진입.

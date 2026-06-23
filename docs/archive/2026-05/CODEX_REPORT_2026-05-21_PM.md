# Codex 보고서 — 2026-05-21 오후

> 작성자: 충현 + Claude Code (이번 세션)
> 대상:   Codex (다음 세션에서 master plan v1.6 작성 시 출발점)
> 입력:   `docs/CODE_REVIEW_2026-05-21.md` (Codex 어제 작성, 11개 이슈)
>         `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-01~D-12 (오늘 충현 결정 12개)

---

## 0. TL;DR

Codex 5단계 워크플로우 진행 상황:

| 단계 | 상태 |
|---|---|
| 1. Claude 답변 받기 | 완료 (어제) |
| 2. D-01~D-12 항목별 정리 | 완료 (어제) |
| 3. 갈리는 부분 충현 확정 | 완료 (오늘 오전) |
| 4. 새 master plan 만들기 | **미완 — Codex 차례** |
| 5. Critical 부터 구현 | 부분 진행 (이번 보고서 범위) |

Codex 코드리뷰 11개 이슈 진행:

| # | 이슈 | 이전 | 이번 세션 | 비고 |
|---|---|---|---|---|
| 1 | users / auth.users FK 혼재 | ❌ | ✅ 해결 | D-10 public.users 신설 (오전) |
| 2 | RLS insert 누락 | ❌ | ✅ 해결 | 신규 마이그 `20260521_z12` |
| 3 | 월드컵 결과 DB 영속화 | ❌ | ✅ 해결 | D-09 (오전) |
| 4 | 남자 64장 풀 | ❌ | 📝 핸드오프 | Manus 작업 대기 |
| 5 | matching engine 본체 | ❌ | ❌ **성준 영역** | 아래 5절 |
| 6 | self_appearance_score 산출 경로 | ❌ | 📝 핸드오프 | admin 설계 문서만 |
| 7 | group create page mock | ❌ | ❌ **성준 영역** | 아래 5절 |
| 8 | MatchingPool 숫자 하드코딩 | ❌ | ❌ **성준 영역** | 아래 5절 |
| 9 | group_members unique 과강 | ❌ | ✅ 해결 | 신규 마이그 `20260521_z11` |
| 10 | profiles_public view 보안 | ❌ | ✅ 해결 | 신규 마이그 `20260521_z10` |
| 11 | profile/complete self-worldcup 잔존 | ❌ | ✅ 해결 | `app/profile/complete/page.tsx` |

이번 세션에서 **4개 신규 해결 (#2, #9, #10, #11)** + 오전에 **3개 (#1, #3, #6 일부)**. 남은 4개 중 3개(#5/#7/#8)는 성준이 본체 구현해야 함.

---

## 1. 이번 세션에서 작성한 코드/마이그레이션 (구현 완료분)

### 1-A. `app/profile/complete/page.tsx`

D-02 결정으로 self-worldcup 단계가 폐기되었는데 완료 페이지 체크리스트에 "내 외모 스타일"이 남아있었음. 제거 + 순서 정정(D-01 결정: 기본정보 → 이상형 월드컵 → 사진 → 성격 → 시간대 → 가중치).

### 1-B. `supabase/migrations/20260521_z10_profiles_public_view_security_invoker.sql`

`profiles_public` view 에 `security_invoker = on` 명시. Postgres 15+ 기본값과 동일하지만 의도를 명시해서 향후 누구나 RLS 가 caller 권한으로 적용된다는 것을 알 수 있게 함.

### 1-C. `supabase/migrations/20260521_z11_relax_group_members_unique_to_active.sql`

기존: `group_members(user_id)` 전체 unique → 사용자가 평생 한 그룹.
변경:
- `group_members.left_at TIMESTAMPTZ NULL` 추가
- `WHERE left_at IS NULL` partial unique index
- `groups.status` 가 `completed/disbanded` 로 갈 때 활성 멤버 자동 `left_at = NOW()` 트리거

### 1-D. `supabase/migrations/20260521_z12_rls_strict_write_policies.sql`

이전엔 SELECT 정책만 있어서 친구 수락/그룹 가입/매칭풀 진입이 client 측에서 모두 RLS 차단.
추가 정책:
- `friend_requests`: sender 는 cancel 만, receiver 는 accept/decline 만 가능
- `friendships`: accepted friend_request 에 연결된 insert 만 허용
- `group_members`: leader self-add / accepted invite 경로만 insert, delete 는 닫고 `left_at` update 로 이력 보존
- `group_invites`: active member 만 invite 생성, invitee 만 accept/decline 가능
- `match_pool`: ready group 의 active member 만 waiting entry 생성, 사용자는 cancel 만 가능
- `group_members` read policy 의 self-recursive RLS 는 helper 함수로 분리

---

## 2. 본 세션 검증

```bash
$ npm run typecheck  →  통과
$ npm run lint       →  No ESLint warnings or errors
```

마이그레이션은 로컬 DB 가 없어 실제 적용은 안 했음. PR 머지 전 성준이 staging 에 적용해서 검증해야 함.

---

## 3. 충현이 이번 세션에 손대지 않은 영역 (Codex 가 master plan v1.6 에서 다뤄야 할 항목)

### 3-A. (Codex #5) `matching engine 본체`

- 현재 상태: `lib/matching/config.ts` 만 존재 (HARD_FILTER_CONFIG, WEIGHT_CONFIG)
- 누락:
  - `lib/matching/types.ts` — pair score / batch input 타입
  - `lib/matching/filter.ts` — hard filter (학교/학과/score band/excluded_pairs)
  - `lib/matching/time.ts` — `available_timeslots` 교집합 계산
  - `lib/matching/group-summary.ts` — 그룹 평균 벡터/점수 산출
  - `lib/matching/score.ts` — 외모/성격/시간 점수 + 가중치 합성
  - `lib/matching/simulate.ts` — 시뮬레이션 entry
  - `python/matching/` — 헝가리안 알고리즘 배치 러너
- 충현 영역 외라 손대지 않음. 성준이 본체 작성.

### 3-B. (Codex #7) `app/group/create/page.tsx`

- 현재 상태: UI 초안만 (mock state)
- 누락:
  - 친구 목록 DB fetch (`friendships` join `users` join `profiles`)
  - 그룹 인원 선택 → `groups.size` insert
  - 보증금 결제 trigger (토스페이먼츠) → `deposits` insert
  - 매칭풀 진입 → `match_pool` insert
- 성준 영역.

### 3-C. (Codex #8) `components/MatchingPool.tsx`

- 현재 상태: `{ female: 12, male: 9 }` 하드코딩
- 필요: `match_pool` + `groups.gender` 집계 쿼리. RLS 때문에 service_role view 또는 RPC 함수로 노출.
- 성준 영역.

---

## 4. 핸드오프 문서로만 남긴 것 (구현 미진행)

### 4-A. (Codex #4 / D-06) 남자 64장 풀

- `public/appearance-ideal/male-64/` 빈 폴더 / METADATA 4개 fixture
- 핸드오프: `docs/handoff/MANUS_MALE_64_HANDOFF.md`
- Manus 작업 대기. 남자 6 버킷 디폴트 `chic / warm / smart / friendly / stylish / healthy`

### 4-B. (Codex #6 / D-03) self_appearance_score 산출 경로

- GPT Vision 자동 + 운영자 보정
- 설계 문서: `docs/handoff/ADMIN_APPEARANCE_SCORE_OVERRIDE.md`
- 옵션 1(별도 컬럼 분리) 추천. v1 출시 MVP: Supabase Studio 직접 SQL 보정으로 시작.
- 핵심 누락 구현:
  - `app/api/score-photos/route.ts` — GPT Vision API 호출
  - profiles 에 `self_appearance_score_auto / _override / _source` 컬럼 추가 마이그
  - `/admin/users` 페이지 (v1.1 이후)

---

## 5. Codex 가 master plan v1.6 에서 결정해야 할 항목

이번 세션에서 새로 떠오른 결정 포인트:

1. **#5/#7/#8 구현 순서** — 성준 영역. matching engine 본체가 먼저인가, group create UI 가 먼저인가?
   - 추천: 본체 → UI. UI 는 본체 API 가 정의돼야 mock 을 진짜 호출로 바꿀 수 있음.
2. **#6 GPT Vision 파이프라인** — 별도 트랙으로 빼서 충현이 진행? 운영자 보정 UI 는 v1.1 로 미룬다고 결정했지만 자동 산출은 v1 출시에 필요.
3. **남자 풀 마감 기한** — D-06 Manus 작업이 늦어지면 매칭 자체가 동작 안 함. 외부 의존성이라 master plan 에 명시 필요.
4. **D-07 초대 링크 기능** — 충현/성준 어느 쪽?
   - `group_invites.token` 은 이미 마이그에 있음. 라우트 (`app/invite/[token]/page.tsx`) 와 API 가 미구현.

---

## 6. PR 상태

이번 세션 작업 기준:
- 브랜치: `profile/post-worldcup-decisions-2026-05-21` (오전부터 진행 중)
- 마지막 커밋: `2b78257 chore(python): 여자 풀 벡터 분석 스크립트 + 신규 테스트`
- 추가 예정 커밋 (아직 stage 안 함):
  - `feat(profile): D-02 self-worldcup 잔존 정리 (complete page)`
  - `db: Codex #10 profiles_public view security_invoker 명시`
  - `db: Codex #9 group_members unique → partial unique (active only)`
  - `db: Codex #2 RLS strict write 정책 보충 (friend_requests/friendships/group_members/group_invites/match_pool)`
  - `docs: Codex 보고서 2026-05-21 PM`

PR 본문에 **성준 리뷰 필수** 명시 (CLAUDE.md 절대 규칙: supabase/migrations 신규 시 상대방 확인).

---

## 7. 다음 액션 (Codex 가 받아 진행)

```
1. 본 보고서 + docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md (충현 결정 12개)
   + docs/CODE_REVIEW_2026-05-21.md (Codex 어제 작성) 를 종합해서
2. 새 master plan v1.6 작성 (docs/MATCHING_SYSTEM_PLAN.md 또는 신규 문서)
3. master plan 에 다음을 명시:
   - 5절 (Codex 가 결정해야 할 항목) 에 대한 결정
   - 성준 영역(#5/#7/#8) 작업 순서와 일정
   - 충현 영역(GPT Vision/남자 풀/D-07 초대 링크) 일정
4. master plan 합의 후 성준이 #5 부터 구현 진입
```

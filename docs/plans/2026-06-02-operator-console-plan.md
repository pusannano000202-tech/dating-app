# 운영자 콘솔 계획서 — 매칭 승인 + 매칭 근거 보고 + 외모 점수 보정

> **작성일**: 2026-06-02 · 작성자: 충현 (Claude Code 세션)
> **상태**: 설계 확정 대기 (§4 결정 항목) → 확정 후 마이그/코드 착수
> **대상 독자**: 충현(구현) · 성준/Codex(매칭 엔진 경계 협의)
> **기반 인프라**: z44 운영자 권한(`admins`, `is_admin()`, RLS bypass), z13 외모 점수 보정 컬럼

---

## 1. 한 줄 정의

앱 초창기에 **운영자(엔지니어)가 사람 눈으로 품질을 통제**하기 위한 `/admin` 콘솔.
세 가지 요구를 하나의 콘솔로 묶는다:

1. **매칭 근거 보고** — 매칭이 돌면 "어느 그룹 ↔ 어느 그룹, 점수·근거"를 운영자가 받는다.
2. **매칭 승인/거절 게이트** — 초창기엔 매칭이 사용자에게 노출되기 전 운영자가 프로필·근거를 보고 승인/거절한다 (휴먼인더루프). 신뢰가 쌓이면 플래그로 끈다.
3. **외모 점수 보정** — GPT 자동 외모 점수가 적합한지 사진 보고 판단, 운영자가 점수를 보정한다.

---

## 2. 현재 상태 (이미 됨 vs 만들 것)

### 2.1 매칭 근거 + 승인

| 항목 | 상태 |
|---|---|
| `matches.score` (총점), `matches.score_breakdown` (JSONB: 외모AB/BA·성격·시간·나이·점수대·비대칭패널티) | ✅ z(core) 존재. "사용자 노출 금지" 주석 → 운영자 전용으로 적합 |
| `matches.is_forced` (강제매칭 여부) | ✅ 존재 |
| 매칭 점수/필터 엔진 (`lib/matching/*`) | ✅ 충현 구현 + 테스트 통과 |
| **매칭 배치 러너** (풀에서 읽어 `matches` INSERT) | ❌ 없음 — 승인 게이트의 전제 |
| **승인 상태 컬럼/RPC** | ❌ 없음 (`matches.status` enum에 승인 단계 없음) |
| 운영자 리뷰 큐 UI | ❌ 없음 |

> `matches.status` 현재 enum = `pending / confirmed / cancelled / completed / no_show`. 여기서 `pending`은 "양쪽 리더 confirm 대기"라 승인 단계와 의미가 다름 → **별도 `approval_status` 컬럼 추가**(enum 오염 방지).

### 2.2 외모 점수 보정

| 항목 | 상태 |
|---|---|
| 보정 컬럼 (`self_appearance_score_auto` / `_override` / `_source` / `_updated_at`) | ✅ **z13에서 이미 마이그 완료** |
| effective 값 = `COALESCE(override, auto, legacy)` 규약 | ✅ z13 주석에 명문화 |
| **GPT 채점 파이프라인이 `_auto` 채우기** | ❌ 미구현 (ADMIN_APPEARANCE_SCORE_OVERRIDE 문서: "GPT Vision 파이프라인 현재 미구현") |
| 보정 RPC + 이력 audit 테이블 | ❌ 없음 |
| 운영자 보정 UI (사진+점수 한 화면) | ❌ 없음 |

### 2.3 공통

| 항목 | 상태 |
|---|---|
| 운영자 권한 (`admins`, `is_admin()`, RLS bypass, `admin_revenue_summary`) | ✅ z44 |
| `/admin/*` 페이지 셸 + 가드 | ❌ 없음 |
| RLS bypass guard 패턴 (z22) | ✅ 새 테이블 쓰기는 이 패턴 따를 것 |

---

## 3. 목표 구조

```
/admin                         (is_admin() 가드 — 비운영자 접근 차단)
├── (대시보드)                  풀 현황 · 매칭 통계 · 노쇼율 · 리뷰 대기 건수
├── /matches/review            ① 매칭 근거 보고 + ② 승인/거절 큐
│     └── /matches/[id]        단일 매칭 상세 (양 그룹 프로필 + score_breakdown 근거)
└── /users/[id]                ③ 프로필 + 사진 + GPT 점수 + 보정 입력 + 이력
```

데이터 흐름:
```
[사진 업로드] → GPT 채점 → self_appearance_score_auto 저장
                                    ↓ (운영자 보정 시 _override)
[매칭 배치] → matches INSERT (approval_status=pending_review) → 운영자 알림
                                    ↓
[운영자 리뷰] → 승인 → 사용자 노출(정상 confirm 흐름) / 거절 → 풀 복귀
```

---

## 4. 설계 결정 (착수 전 확정 필요)

| # | 결정 | 옵션 | 충현 추천 |
|---|---|---|---|
| D1 | 승인 게이트 on/off 제어 | (a) DB `app_config` 키-값 테이블 (런타임 토글) / (b) 코드 상수 | **(a)** — 운영자가 배포 없이 끄고 켜기 |
| D2 | 승인 단위 | (a) 매칭 1건씩 / (b) 배치 전체 일괄 | **(a)** 기본 + 일괄 승인 버튼 보조 |
| D3 | 거절 시 후처리 | (a) 그룹만 풀 복귀 / (b) 복귀 + `excluded_pairs` 등록(재매칭 방지) | **(b) 선택형** — 거절 사유가 "이 조합이 별로"면 등록 |
| D4 | 보정 UI 위치 | (a) Supabase Studio 직접 SQL / (b) `/admin/users` 페이지 | **(b)** — "사진 보고 판단"하려면 사진 표시 필수 (Studio 불가) |
| D5 | 보고 전달 방식 | (a) 리뷰 큐 페이지만 / (b) 배치 후 요약 알림(in-app/이메일)+페이지 | **(b)** — "보고를 받는다" 요구 충족 |
| D6 | GPT 채점 시점 | (a) 사진 업로드 즉시 / (b) 운영자 배치 트리거 | **(a)** — 매칭 전 점수 준비 보장 |

---

## 5. DB 스키마 추가 (마이그 z54~)

> 모든 신규 테이블 쓰기는 z22 bypass guard 패턴(`app.bypass_<table>_guard`) 적용. 신규 마이그는 성준 리뷰 후 머지(CLAUDE.md 규칙).

### z54 — 매칭 승인 게이트
```sql
ALTER TABLE public.matches
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending_review','approved','rejected')),
  ADD COLUMN reviewed_by   uuid REFERENCES auth.users(id),
  ADD COLUMN reviewed_at   timestamptz,
  ADD COLUMN review_reason  text;
-- 기존 행은 default 'approved' → 영향 없음. 배치가 새 행을 pending_review로 생성.

CREATE TABLE public.app_config (        -- D1: 런타임 토글
  key   text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- seed: ('match_requires_approval', 'true')
```
- RLS: `matches` SELECT 정책에 `approval_status='approved' OR is_admin()` 추가 → 사용자는 승인된 것만 봄.
- `get_my_matches` 도 `approval_status='approved'` 필터.

### z55 — 외모 점수 보정 이력
```sql
CREATE TABLE public.appearance_score_audits (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prev_effective float,
  new_effective  float NOT NULL,
  source        text NOT NULL CHECK (source IN ('auto','admin_override','cleared')),
  admin_user_id uuid REFERENCES auth.users(id),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## 6. RPC / API (SECURITY DEFINER + is_admin() 가드)

| RPC | 용도 |
|---|---|
| `admin_list_pending_matches()` | 리뷰 대기 매칭 + 양 그룹 요약 + score + score_breakdown 반환 (①②) |
| `admin_get_match_review(match_id)` | 단일 매칭 상세 (양 그룹 멤버 프로필·점수·근거) |
| `admin_review_match(match_id, decision, reason, add_excluded)` | 승인/거절 (②, D3) |
| `admin_get_user_profile(user_id)` | 프로필 + 사진 + auto/override 점수 + 벡터 (③) |
| `admin_set_appearance_override(user_id, score, reason)` | 보정 설정 → `_override`, `_source='override'`, audit 기록 (③) |
| `admin_clear_appearance_override(user_id)` | 보정 해제 → auto로 복귀 |
| `set_app_config(key, value)` | 승인 게이트 토글 (D1) |

라우트(route.ts, 기존 패턴): `app/api/admin/matches/...`, `app/api/admin/users/[id]/...`. 전부 `is_admin()` 서버 가드.

---

## 7. 매칭 배치 러너 (②의 전제 — 별도지만 여기 포함)

`lib/matching/simulate.ts` 위에 얹는다:
1. `match_pool`에서 `waiting` 그룹 로드 → `GroupSummary[]` 변환
2. `simulateBatch()` 로 점수/필터 → 후보 정렬
3. **최종 배정 선택** (각 그룹 1회 — greedy: 점수 높은 순으로 미사용 그룹끼리 확정)
4. `matches` INSERT (`score`, `score_breakdown`, `approval_status = match_requires_approval ? 'pending_review' : 'approved'`)
5. 배치 요약 → 운영자 알림 (D5)
- 실행 형태: Next route(`/api/admin/run-batch`, 운영자 수동 트리거)로 시작 → 안정화 후 cron.
- ⚠️ 성준 협의: 매칭 엔진 본체를 성준이 별도로 만들 계획이면 이 러너의 소유권/형태(TS vs Python) 합의 필요.

---

## 8. 구현 순서 (Phase + 체크박스)

> **2026-06-02 구현됨**: §4 결정 D1~D6 추천값 채택. 마이그 번호는 z54(daily_card_draw_policy)
> 충돌로 **z55/z56/z57** 로 배정됨.

### Phase 0 — 콘솔 토대 ✅
- [x] `/admin` 레이아웃 + `is_admin()` 가드 (비운영자 redirect, 로컬은 dev bypass) — `app/admin/layout.tsx`, `middleware.ts`
- [x] `app_config` + `match_requires_approval` seed + `get/set_app_config` RPC — z55

### Phase 1 — 외모 점수 (③)
- [ ] GPT 채점 파이프라인이 `self_appearance_score_auto` 저장 (사진 업로드 시, D6) — **미구현 (OpenAI 키 필요, 별도 작업)**
- [x] z56 audit 테이블 + `admin_set/clear_appearance_override` RPC + `admin_get_user_profile`
- [x] `/admin/users/[id]` — 사진 + auto/override/effective 점수 + 보정 입력/해제

### Phase 2 — 매칭 배치 + 승인 게이트 (①②)
- [x] z55 `matches.approval_status` + RLS/`get_my_matches`/`get_match_detail` 게이트 + `admin_create_pending_match`
- [x] greedy 배정 헬퍼 `lib/matching/assign.ts` + 테스트 (배치 러너의 배정 단계)
- [ ] 배치 러너 풀 로더(`match_pool`→`GroupSummary`) + `/api/admin/run-batch` + 요약 알림 — **미구현 (라이브 DB 검증 필요)**
- [x] `admin_list_pending_matches` / `admin_get_match_review` / `admin_review_match` RPC — z57

### Phase 3 — 리뷰 콘솔 UI ✅
- [x] `/admin/matches/review` 큐 (점수·근거·승인/거절 버튼)
- [x] `/admin/matches/[id]` 단일 상세 (양 그룹 멤버 프로필 + score_breakdown)
- [x] `/admin` 대시보드 (리뷰 대기 건수 + 승인 게이트 토글)

### Phase 4 — 검증 ✅
- [x] `npm run typecheck` ✅ + `npm run build` ✅ + `npm run test:matching` ✅ 22/22 + `verify-migrations.py` (내 파일 0 issues)
- [ ] 비운영자 `/admin` 접근 차단 — 라이브 DB 수동 확인 필요
- [ ] 승인 플래그 off 시 매칭 자동 노출 — 라이브 DB 수동 확인 필요

### 남은 2가지 (외부 의존)
1. **GPT 채점 파이프라인** — `self_appearance_score_auto` 자동 채움. 현재 운영자 보정(override)은 auto 없이도 동작하나, auto 가 있어야 "GPT가 적정한지 보고 보정" 워크플로가 완성됨.
2. **배치 러너 풀 로더** — `admin_create_pending_match` RPC + `assign.ts` 는 준비됨. `match_pool` 의 그룹들을 `GroupSummary` 로 적재하는 RPC/어댑터만 추가하면 `/api/admin/run-batch` 로 자동 생성 가능. 라이브 DB 스키마 검증이 필요해 이번 커밋에서 보류.

---

## 9. 의존성 · 리스크

- **배치 러너 미구현** → ②의 전제. Phase 2에서 같이 해결.
- **GPT 파이프라인 미구현** → ③의 전제. Phase 1에서 같이 해결.
- **성준 매칭 엔진 경계** → 배치 러너 소유권 협의 (§7).
- `lib/types.ts` 또는 `matches` 스키마 변경 → 성준 리뷰 필수.
- score_breakdown·raw 점수는 **운영자 전용**, 절대 일반 사용자 응답에 싣지 않기.

---

## 10. 참조

- `docs/handoff/active/ADMIN_APPEARANCE_SCORE_OVERRIDE.md` — ③ 원설계 (옵션1 채택됨 = z13)
- `docs/product/operations/ADMIN_OPERATIONS_PLAN.md` — 운영 전반
- `docs/CODEX_MASTER_2026-05-23.md` §10(bypass guard)·§11(점수 가중치)·§8(데이터 모델)
- `lib/matching/{simulate,score,filter}.ts` — 배치 러너가 얹힐 엔진
- 마이그: `z13`(보정 컬럼), `z44`(운영자 인프라), `matching_create_core_tables`(matches.score_breakdown)

---

*이 문서는 계획이다. 착수하면 §4 결정을 확정값으로 갱신하고, 진행 상황은 `CURRENT_IMPLEMENTATION_STATUS.md`에 반영한다.*

# 마이그레이션 정적 검증 보고서 — 2026-05-22

> Master Plan v1.6 12.A "Fresh DB Apply 검증" 의 정적 검증 결과.
> 실제 Supabase 환경 없이 마이그 24개를 코드 레벨에서 분석.

---

## 결과 한 줄

**PASS** — 의존성 순서 이슈 0건. 마이그 13개 신규는 기존 마이그 위에 ASCII 정렬 순서로 안전하게 적용될 것으로 예상.

```
Files scanned: 24
Total defs: 152
Total refs: 452
Issues: 0
```

---

## 환경 제약

본 환경에 다음 도구가 모두 부재:

- Supabase CLI
- Docker
- 로컬 PostgreSQL

따라서 `supabase db reset` 같은 진짜 실행 검증은 불가능. 대신 `scripts/verify-migrations.py` 로 정적 분석 수행.

---

## 검증 항목

1. **ASCII 정렬 순서**: 24개 파일이 의존 순서대로 정렬되는지
2. **객체 정의-사용 의존성**: REFERENCES / JOIN / FROM / EXISTS / EXECUTE FUNCTION / GRANT 등에서 참조하는 객체가 이전 마이그(또는 같은 파일 앞부분)에 정의되었는지
3. **정책 중복 CREATE**: DROP POLICY IF EXISTS 없이 같은 이름 정책을 두 번 만드는지
4. **트리거 중복 CREATE**: 동일
5. **`$$` 균형**: PL/pgSQL 함수 본문 delimiter 짝 맞는지

---

## 적용 순서 (ASCII 정렬, Supabase 가 적용할 순서)

```
20260514_profile_create_appearance_tables.sql
20260514_profile_create_profiles_table.sql
20260515_profile_add_self_appearance_score.sql
20260515_profile_create_photos_table.sql
20260521_00_create_public_users_table.sql           ← z 시리즈 의존 기반
20260521_matching_create_core_tables.sql            ← 매칭 코어 테이블
20260521_profile_add_preference_vectors.sql         ← 월드컵 결과 컬럼
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
20260521_z23_friend_request_flow.sql
20260521_z24_deposit_check_in_enter_match_pool.sql
20260521_z25_group_deposit_summary_rpc.sql
20260521_z26_friend_request_summaries_rpc.sql
```

`z` prefix 덕분에 모든 z 시리즈가 의존 마이그(`_matching_*`, `_profile_*`) 이후에 정렬됨. Codex 가 이전 세션에서 지적한 정렬 critical 이슈는 해소.

---

## 검증으로 얻을 수 있는 신뢰 / 얻을 수 없는 것

### 얻을 수 있는 것

- 객체 정의 누락 없음 (REFERENCES auth.users / public.users / profiles / groups / match_pool / 등 모두 정의됨)
- 정책/트리거 중복 정의 없음 — 재정의 시 DROP IF EXISTS 또는 CREATE OR REPLACE 사용
- 함수 호출 대상 (auth.uid, gen_random_uuid, set_config, current_setting, accept_group_invite_by_token, ...) 모두 정의됨
- `$$` 함수 본문 delimiter 짝 모두 맞음

### 얻을 수 없는 것 (실제 적용 검증으로 확인 필요)

- **Postgres 의 미묘한 의미 에러**: CHECK 조건 평가, 컬럼 타입 호환, NOT NULL 위반, 트리거 순서 부작용
- **RLS 정책 정확성**: 실제로 인증된 user 가 SELECT/INSERT/UPDATE 가능한가
- **SECURITY DEFINER 동작**: BYPASSRLS attribute 가 환경에서 동작하는가
- **RPC 트랜잭션 정합성**: enter_match_pool 안에서 groups UPDATE + match_pool INSERT 가 같은 트랜잭션으로 동작하는가
- **트리거 부작용**: groups.status='completed' → group_members.left_at 자동 set, public.users INSERT → friend_request 매핑 등
- **데이터 백필 결과**: z20 의 invite_kind 백필이 기존 row 에 올바르게 적용되는가
- **운영 데이터와의 상호작용**: 기존 사용자/그룹이 있을 때 마이그가 깨지지 않는가

---

## 다음 단계 (실제 적용 검증)

이 정적 검증은 "코드 레벨에서 깨질만한 의존성 이슈는 없다" 까지의 신뢰만 줌. 운영 출시 전에는 반드시:

### 옵션 A: Supabase 클라우드 dev 프로젝트

1. Supabase 대시보드에서 별도 dev 프로젝트 생성
2. `.env.local.dev` 에 dev URL/KEY 저장
3. SQL Editor 또는 Supabase CLI 로 마이그 24개 순서대로 실행
4. 핵심 RPC 동작 수동 검증:
   - leader 가 그룹 생성 → 멤버 invite → 수락 → 보증금 결제 → 큐 진입 전체 흐름
   - 친구 phone 으로 요청 → 가입 시 자동 매칭 트리거 → 수락 → friendships
5. RLS 정책 검증 (다른 사용자 그룹/보증금/매칭풀 접근 시도 → 거부 확인)

### 옵션 B: Supabase CLI + Docker 로컬 dev

1. `npm install -g supabase`
2. Docker Desktop 설치 (Windows)
3. `supabase init` (현재 디렉토리에 supabase 설정)
4. `supabase start` (로컬 Postgres + Studio 실행)
5. `supabase db reset` (모든 마이그 fresh apply)

### 옵션 C: 사용자 시점에서 staging 환경 가이드

성준이나 운영 담당자에게 다음 정보 전달:
- 본 정적 검증 결과 (이 문서)
- staging 환경에서 `supabase db reset` 1회 실행 부탁
- 검증할 RPC 목록 (위 옵션 A 의 흐름)

---

## 검증 도구

`scripts/verify-migrations.py` — 본 검증을 재현하려면:

```powershell
python scripts/verify-migrations.py
```

기대 출력:
```
Files scanned: 24
Total defs: 152
Total refs: 452
Issues: 0

PASS - no dependency-order issues found.
```

스크립트는 정규식 기반이라 false positive 가 발생할 수 있어 SPURIOUS_NAMES / BASELINE_RELATIONS / OLD./NEW. PL-pgSQL 변수 필터링 코드 포함. 새 SQL 키워드가 false positive 로 잡히면 SPURIOUS_NAMES 에 추가하면 됨.

---

## 결론

마이그 13개 신규는 코드 레벨 의존성 검증 통과. 실제 적용 시 깨질 만한 객체 누락 / 정책 중복 / 함수 미정의 이슈 없음.

**그러나 본 검증만으로 운영 출시 가능 판정 불가.** 실제 Supabase 환경에서 1회 적용 + RPC 동작 검증이 반드시 선행되어야 함. 위 "다음 단계" 옵션 중 하나로 진행.

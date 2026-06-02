# 운영자 관리 계획서 (Admin Operations Plan)

> 부산대 과팅앱 운영자(admin) 역할·권한·도구 정의. 2026-05-22 작성.
> 본 문서는 **계획서**. 실제 구현은 단계별로 z44(인프라) → v1.1(전용 페이지) → v2(자동화).

---

## 1. 운영 단계

| 단계 | 운영자 수 | 도구 | 시점 |
|---|---|---|---|
| **v1 (출시 직후)** | 1명 (충현) | Supabase 대시보드 SQL Editor 에서 직접 RPC 호출 | 출시 ~ 1-2개월 |
| **v1.1** | 1-2명 | `/admin/*` 페이지 (충현 본인 + 1인 가능) | 사용자 100명+ |
| **v2** | 2-3명 + 자동화 | 권한 분리 (super_admin / moderator), 자동 트리거 | 사용자 1000명+ |

본 문서 우선은 **v1 운영 모델** 정의. v1.1 페이지는 별도 PR 로 작업.

---

## 2. 권한 모델 (z44 마이그)

### 2.1 admins 테이블

```sql
CREATE TABLE admins (
  user_id      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'admin'
                 CHECK (role IN ('admin', 'super_admin')),
  granted_by   UUID REFERENCES public.users(id),  -- 누가 admin 권한 부여했는지
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT
);
```

- `super_admin`: 다른 admin 추가/제거 가능. v1 에서는 충현 본인.
- `admin`: 일반 운영 작업 (사용자 차단, 매칭 강제, 점수 보정 등). 다른 admin 관리 X.

### 2.2 is_admin() 헬퍼 함수

```sql
CREATE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN STABLE SECURITY DEFINER ...;
```

모든 핵심 테이블 RLS USING 절에 `OR public.is_admin()` 추가:
- groups, group_members, match_pool, matches, deposits, attendances, reviews, connections, friend_requests, friendships, notifications, deposit_refund_requests, match_continuation_choices, profiles, photos

→ admin 은 어느 사용자의 데이터든 SELECT 가능.
→ UPDATE/DELETE 는 SECURITY DEFINER RPC 통해서만 (operation 추적성).

### 2.3 초기 super_admin 설정

```sql
-- staging/prod 에서 1회 수동 실행
INSERT INTO admins (user_id, role, granted_by, notes)
VALUES (
  '<충현 user_id>'::UUID,
  'super_admin',
  '<충현 user_id>'::UUID,
  'initial bootstrap admin'
);
```

---

## 3. 운영자 작업 카탈로그 (v1)

각 작업은 Supabase 대시보드 SQL Editor 에서 SELECT/CALL 로 실행. 모든 변경은 SECURITY DEFINER RPC 거침 (audit log 자동).

### 3.1 사용자 관리

| 작업 | 방법 |
|---|---|
| 사용자 검색 | `SELECT * FROM profiles WHERE display_name ILIKE '%이름%'` |
| 외모 점수 수동 보정 | `docs/handoff/ADMIN_APPEARANCE_SCORE_OVERRIDE.md` 명세 (별도 RPC v1.1) |
| 사용자 차단 (banned) | v1.1 RPC `ban_user(user_id, reason)` — 미구현 |
| 사용자 강퇴 | profile DELETE (CASCADE 로 모든 연관 데이터 정리) |

### 3.2 그룹 관리

| 작업 | 방법 |
|---|---|
| 그룹 검색 | `SELECT * FROM groups WHERE status='ready'` |
| 그룹 강제 해체 | `SELECT public.disband_group(group_id)` (z27, 본인 그룹만 → admin bypass 필요 v1.1) |
| 리더 강제 위임 | `SELECT public.transfer_group_leadership(group_id, new_leader)` (z32) |
| 멤버 강제 제거 | v1.1 RPC `admin_remove_member(group_id, user_id)` — 미구현 |

### 3.3 매칭 관리

| 작업 | 방법 |
|---|---|
| 매칭 강제 (특정 두 그룹) | v1.1 RPC `force_match_pair(group_a, group_b, batch_id)` — 미구현 |
| 매칭 취소 강제 | `UPDATE matches SET status='cancelled' WHERE id=...` (z38 트리거가 환불 처리) |
| 매칭 완료 강제 (no-show 확정) | `UPDATE matches SET status='completed' ...` + `distribute_no_show_penalty()` 호출 |
| score_breakdown 디버깅 | `SELECT score_breakdown FROM matches WHERE id=...` (사용자 노출 금지) |

### 3.4 보증금 / 환불 관리

| 작업 | 방법 |
|---|---|
| 노쇼 페널티 자동 분배 | `SELECT * FROM public.distribute_no_show_penalty(match_id, ARRAY['no-show-user-id'])` (z41) |
| 환불 신청 검토 (0원 신고) | `SELECT * FROM deposit_refund_requests WHERE requested_refund_amount=0 ORDER BY created_at DESC` |
| 환불 수동 처리 | `UPDATE deposits SET status='refunded' WHERE id=...` |
| forfeited 보증금 분배 확인 | `SELECT distribution_to FROM deposits WHERE status='forfeited'` |

### 3.5 알림 / 만료 관리 (cron 대체)

| 작업 | 방법 |
|---|---|
| 친구 요청 만료 | `SELECT public.expire_overdue_friend_requests()` (z31) |
| continuation 7일 만료 | `SELECT public.expire_continuation_choices()` (z43) |
| refund 14일 만료 | `SELECT public.expire_refund_requests()` (z43) |
| 약속 리마인더 발송 | `SELECT public.enqueue_meeting_reminders()` (z40) |

→ 위 RPC 들을 Supabase `pg_cron` extension 활성화 후 등록 권장:

```sql
SELECT cron.schedule(
  'enqueue_meeting_reminders',
  '*/5 * * * *',  -- 5분마다
  $$ SELECT public.enqueue_meeting_reminders(); $$
);
SELECT cron.schedule('expire_friend_requests', '0 4 * * *',
  $$ SELECT public.expire_overdue_friend_requests(); $$);
SELECT cron.schedule('expire_continuation_choices', '0 4 * * *',
  $$ SELECT public.expire_continuation_choices(); $$);
SELECT cron.schedule('expire_refund_requests', '0 4 * * *',
  $$ SELECT public.expire_refund_requests(); $$);
```

### 3.6 운영 통계 (관찰)

| 지표 | 쿼리 |
|---|---|
| 일일 가입자 | `SELECT date_trunc('day', created_at), COUNT(*) FROM public.users GROUP BY 1 ORDER BY 1 DESC LIMIT 14` |
| 주간 매칭 성공률 | `SELECT date_trunc('week', matched_at), COUNT(*) FILTER (WHERE status IN ('confirmed','completed'))*1.0 / COUNT(*) FROM matches GROUP BY 1 ORDER BY 1 DESC` |
| continuation 비율 | `SELECT choice, COUNT(*) FROM match_continuation_choices GROUP BY 1` |
| 0원 환불 건수 | `SELECT COUNT(*) FROM deposit_refund_requests WHERE requested_refund_amount=0` |
| 일일 앱 수익 (구걸 차액) | `SELECT date_trunc('day', processed_at), SUM(d.amount - drr.requested_refund_amount) FROM deposit_refund_requests drr JOIN deposits d ON d.id=drr.deposit_id WHERE drr.status='processed' GROUP BY 1` |

---

## 4. v1.1 admin 페이지 설계 (스케치)

`/admin/*` (RLS: is_admin() = true 만)

```
/admin                  ← 대시보드 (오늘 가입자 / 매칭 / 수익 / 신고)
/admin/users            ← 사용자 검색 + 점수 보정
/admin/groups           ← 그룹 검색 + 강제 해체/위임
/admin/matches          ← 매칭 검색 + 강제 매칭 / 강제 완료 / 취소
/admin/deposits         ← 보증금 + 환불 처리 + 0원 신고 검토
/admin/reports          ← 신고/이슈 검토 큐
/admin/cron             ← 수동 만료 RPC 트리거 + 로그
/admin/stats            ← 통계 차트
```

각 페이지 RPC 계약:
- `admin_search_users(query, limit)`
- `admin_set_appearance_score(user_id, new_score, reason)`
- `admin_force_disband_group(group_id, reason)`
- `admin_force_match_pair(group_a, group_b, reason)`
- `admin_ban_user(user_id, reason, expires_at?)`
- `admin_resolve_zero_refund_report(refund_id, action)`

→ 각 admin RPC 는 `actions_log` 테이블에 감사 로그 자동 INSERT (v1.1).

---

## 5. 운영 시나리오별 대응

### 5.1 노쇼 신고 받음
1. `/admin/reports` 또는 reviews 테이블에서 신고 확인
2. 관련 매칭의 attendances 확인 (v1.1 GPS) 또는 신고자/피신고자 인터뷰
3. 노쇼 확정 시 `SELECT public.distribute_no_show_penalty(match_id, ARRAY['no-show-user-id'])`
4. 알림 자동 발송 (z41 가 처리)

### 5.2 0원 환불 신고 받음 (사용자 A 가 0원 환불 → B 가 항의)
1. `SELECT * FROM deposit_refund_requests WHERE requested_refund_amount=0 AND created_at >= NOW() - INTERVAL '7 days'`
2. `zero_refund_reasons` + `zero_refund_comment` 확인
3. 양쪽 reviews 확인
4. 운영자 판단:
   - 정당한 사유 → 그대로 (A 가 전액 앱 수익 입수)
   - 악의적 → A 의 환불 요청 무효화 (UPDATE deposit_refund_requests SET status='cancelled', UPDATE deposits SET status='refunded' for A) + A 에게 경고 알림

### 5.3 프로필 불일치 신고 (8-11 operator_review)
1. reviews 에서 reported_issues 에 'profile_mismatch' 있는 row 검색
2. 신고된 사용자의 사진 + 프로필 검토
3. 명백한 불일치 → 프로필 수정 강제 / 외모 점수 보정 / 차단
4. 결정 사항을 `actions_log` 에 기록

### 5.4 그룹 리더 잠수 (큐 진입 후 응답 X)
1. 다른 멤버가 운영팀에 문의
2. `SELECT public.transfer_group_leadership(group_id, other_member_user_id)` — v1.1 RPC 에 admin bypass 추가 필요
3. 또는 그룹 강제 해체 + 보증금 환불

### 5.5 부정 사용 (어뷰징)
1. 의심 사용자 식별
2. v1.1 `admin_ban_user(user_id, reason)` — 또는 `UPDATE public.users SET banned_at=NOW() WHERE id=...` (스키마 확장 필요)
3. 진행 중인 그룹/매칭 정리

---

## 6. 보안 / 감사

- 모든 admin RPC 는 `actions_log` 테이블에 INSERT (v1.1)
  - `actions_log(admin_user_id, action, target_table, target_id, payload jsonb, created_at)`
- super_admin 권한은 1명 (충현). 추가 admin 발급 시 super_admin 만 가능
- admin 도 다른 사용자의 phone, email 같은 PII 직접 export X (UI 마스킹 + 운영자 책임 약관)

---

## 7. v1 즉시 적용 (z44 마이그 후)

1. Supabase 대시보드 → SQL Editor → 다음 실행:
```sql
INSERT INTO admins (user_id, role, granted_by, notes)
VALUES (
  '<충현 user_id>',
  'super_admin',
  '<충현 user_id>',
  'initial bootstrap'
);
```

2. pg_cron 활성화 + 4개 cron 등록 (3.5절)

3. 운영자(충현) 가 본인 권한 확인:
```sql
SELECT public.is_admin();  -- 본인 세션에서 호출 → TRUE
```

4. 모든 데이터 SELECT 가능 검증:
```sql
SELECT count(*) FROM matches;  -- admin RLS bypass 동작 확인
```

---

## 8. v1.1 진입 시 이 문서 갱신

- admin 페이지 구현 완료 시 4절 → 실제 라우트 + 스크린샷 추가
- actions_log 테이블 추가 시 6절 → 실제 스키마
- 권한 분리 도입 시 1절 v2 → v1.5/v2 단계 정의

---

*운영 정책은 사용자 데이터에 직접 영향을 미친다. 모든 운영 작업은 사후 감사 가능해야 한다 (actions_log).*

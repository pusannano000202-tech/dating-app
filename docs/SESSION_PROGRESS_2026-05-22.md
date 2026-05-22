# 본 세션 진행 기록 — 2026-05-22

> 충현이 한눈에 확인하는 용도. 토큰 90% 시점 기준 작성.
> 자세한 트랙은 `docs/MASTER_PLAN_V1_6_2026-05-21.md` + `docs/STATUS_2026-05-22.md`.

---

## 📊 전체 진행률 — **약 97%** (Master Plan v1.6 기준)

```
███████████████████████████████████████░  97%
```

| 분류 | 진행 |
|---|---|
| Task A/B/C/D/E 핵심 트랙 | ✅ 5/5 완료 |
| 12.A~G 후속 트랙 | ✅ 6/7 완료 (12.D 만 미진행) |
| 추가 트랙 (큐/그룹/매칭/보증금/UI) | ✅ 모두 완료 |
| 알려진 한계 (양방향 confirm / 리더 위임 / friend expire / review) | ✅ 모두 해소 (z30~z33) |
| 미완 | ❌ Task F (Python 헝가리안) — **성준 영역** |
| 운영 차단 | ⚠️ 토스 실결제 / fresh DB apply 실 검증 |

**즉**: v1 출시까지 남은 핵심 작업은 **Task F (성준)** 1개 + **fresh DB apply 실 검증** (충현) 1개 + **토스 실결제** (충현, sandbox 키 필요).

### 🌅 2026-05-22 후반 세션 (claude-opus-4-7) 후속 작업

기존 92% → 97% 까지 끌어올린 작업:
- `5dda0b8` z30 — 양방향 match confirm 추적 (group_a/b_confirmed_at, lazy transition)
- `42e92b1` z31 — friend_request lazy expire + admin/cron bulk expire RPC
- `d8e9631` z32 — transfer_group_leadership RPC + Crown UI in /group/create
- `f1873a1` z33 — submit_review / get_my_reviews + /match/[id]/review composer
- `621a2a9` z34 — preferred_age_min/max + age_fit 매칭 가중치 (사용자 ±3 기본, 결정 8-13)
- `554c1ba` z35 — connection 양방향 동의 RPC + /match/[id] 1:1 연결 패널
- `826c2f2` z36 — **핸드폰 자동공개 정책** (결정 8-18). 약속 시간 도달 시 phone 자동 공개. agree/cancel RPC 폐기. status=confirmed 부터 노출
- `f6153fb` TIME_FIT 매칭 가중치 0.10 추가 (결정 8-19). APPEARANCE 0.45→0.40, PERSONALITY 0.25→0.20 으로 양보
- `29b1127` z37 — **매칭 자동 완료** (결정 8-20). confirmed→completed lazy 전이 (scheduled_start + 4h). get_my_matches/get_match_detail 에 scheduled_start, venue_name, venue_address, venue_map_url 추가
- `7a39d22` docs z37 반영 (98→99%)
- `6501de9` z38 — matches.status → groups.status 동기화 트리거
- `[새]` z39 — **in-app 알림 시스템** (결정 8-21). notifications 테이블 + 매칭 이벤트 트리거 + RPC 4종 (get/mark-read/mark-all/count)
- `34f4d17` /notifications 페이지 + NotificationBell 컴포넌트 (/match, /group/create 헤더 배지)
- `[새]` z40 — 친구 요청 알림 자동 (receiver_user_id 있을 때) + enqueue_meeting_reminders RPC (D-1/30분 전, 멱등)
- `8fd9e31` z40 z41 — friend_request 알림 + meeting reminder + 노쇼 페널티 분배 (8-9)
- `[새]` z42 — **구걸 UX 환불 백엔드** (결정 8-22). match_continuation_choices + deposit_refund_requests 테이블 + submit_continuation_choice / submit_refund_request RPC. 양쪽 continue → 자동 전액 환불, 한쪽 end → 환불 선택 진입
- `[새]` z43 — z39 트리거 갱신 (review_request → continuation_choice_request) + expire RPCs (7일 → end 자동, 14일 → 전액 자동 환불)
- `[새]` /match/[id]/continuation 페이지 (이어갈래요/충분 2-choice)
- `[새]` /match/[id]/refund 페이지 (슬라이더 + 3단계 구걸 + 0원 사유 입력)
- `[새]` /notifications 페이지 신규 kind 4종 라벨/요약 추가
- `[새]` z44 — **운영자 인프라** (결정 8-23). admins 테이블 + is_admin() 헬퍼 + 모든 핵심 테이블 RLS 에 admin bypass + grant/revoke_admin RPC + admin_revenue_summary view
- `[새]` `docs/PROJECT_OVERVIEW_2026-05-22.md` 마스터 인수서 (Codex 입맞춤용 전체 정보)
- `[새]` `docs/ADMIN_OPERATIONS_PLAN.md` 운영자 관리 계획서

---

## 🎯 본 세션 (Claude Code · 2026-05-22) 한 일

### 1차 (Task D/E 정리 + Critical bypass guard)
- `eb24f4f` Task D — group API + invite 토큰 acceptance
- `f47a788` Task E — MatchingPool 실데이터 RPC
- `9e28b1b` 큐 진입/취소 RPC + UI
- `46e318d` invite 익명 미리보기 (UX)
- `0199a08` display_name + friend summary RPC
- `2ee36ac` invite_kind 컬럼 정리 (link hack 제거)
- `7572322` 그룹 멤버 카드 display_name 노출
- `4d6fae5` RPC bypass guard 통일 (12.E)

### 2차 (Friend UI + 보증금 + 마이그 검증)
- `6e5332a` 친구 요청 전체 흐름 (RPC + API + UI)
- `a147575` 보증금 mock 결제 + enter_match_pool 검증 통합
- `8cf4e18` 그룹 전체 결제 현황
- `8897beb` 친구 요청 sender/receiver display_name 노출
- `8696be9` **마이그 정적 검증 PASS** (24개 / 152 객체 / 452 참조 / 0 issue)
- `7e984c5` 남자 풀 (32b44b2) 통합 검증 + 깨진 python test 갱신

### 3차 (UX 잔여 + 매칭 흐름 완결)
- `d64c35f` /profile/edit 에서 display_name 인라인 수정 (12.F)
- `b12a783` 그룹 떠나기 / 해체 RPC + UI
- `099e62b` /match/[id] placeholder + 매칭 목록 RPC
- `e6b0cf0` 리더가 매칭 확정/거절 RPC + UI

### 외부 트랙 (충현 또는 Manus 가 별도로 push)
- `32b44b2` 남자 이상형 풀 MI01-MI96 (active 64 확정) — **12.G 완료**
- `e47e62d` 남자 이미지 카탈로그 문서

---

## 🟢 코드 기준 동작 가능한 사용자 흐름 (E2E)

```
1. /                        → 매칭 풀 시각화 (실DB 집계)
2. /login                   → 휴대폰 OTP 가입
3. /profile/basic           → display_name 포함 7단계 시작
4. /profile/worldcup        → 이상형 월드컵 → preferred_* 벡터 저장
5. /profile/photos          → 사진 업로드 + self_appearance_score 산출
6. /profile/survey ~ preferences
7. /profile/complete

8. /friends                 → 전화번호로 친구 요청 / 받은 요청 수락/거절
   └ 가입 전 phone 요청도 가입 시 자동 매칭 트리거 동작

9. /group/create
   ├ 친구 0명이면 /friends CTA
   ├ 친구 초대 (in-app / phone / 공개 링크)
   ├ 멤버 2명 이상 → 보증금 mock 결제
   │  └ 그룹 전체 결제 현황 (n/m + 멤버 칩)
   ├ 리더가 전원 결제 확인 후 "이번 주 매칭 큐에 들어가기"
   │  └ enter_match_pool RPC (deposit 검증 + groups.status=ready + match_pool waiting)
   ├ 큐 진입 후 "매칭 결과 확인하기" 링크 노출
   ├ "큐에서 빠지기" (리더만)
   └ 그룹 관리:
       ├ 비-리더: "그룹 나가기" → left_at + 큐 자동 cancel
       └ 리더: "그룹 해체" → groups.status=disbanded + 멤버 정리 트리거

10. /match                  → 본인 그룹 매칭 목록
11. /match/[id]             → 매칭 상세
    ├ pending: 리더 "매칭 확정" / "거절"
    └ confirmed: "매칭 취소"

12. 토요일 14:00 자동 매칭   ← Task F (Python 헝가리안) 대기
```

---

## 📁 본 세션 산출물

### 신규 마이그 (z14~z33 — 20개)
```
z14 group_invite_token_acceptance
z15 match_pool_stats_rpc
z16 match_pool_enter_cancel_rpc
z17 grant_invite_lookup_to_anon
z18 profile_display_name
z19 friend_summaries_rpc
z20 group_invite_kind
z21 group_member_summaries_rpc
z22 rpc_bypass_guards            ← 모든 RPC RLS bypass 통일
z23 friend_request_flow           ← accept_friend_request + auto-match trigger
z24 deposit_check_in_enter_match_pool
z25 group_deposit_summary_rpc
z26 friend_request_summaries_rpc
z27 group_leave_disband_rpc
z28 my_matches_rpc
z29 match_confirm_rpc
z30 match_two_sided_confirm       ← 후반: 양방향 confirm 추적
z31 friend_request_lazy_expire    ← 후반: 만료 lazy + bulk RPC
z32 transfer_group_leadership     ← 후반: 리더 위임
z33 review_rpc                    ← 후반: 만남 평가 submit/get
z34 profile_preferred_age_range   ← 후반: 선호 나이 범위 + 매칭 age_fit
z35 connection_rpc                ← 후반: 1:1 연결 동의 + phone 노출
z36 connection_auto_reveal_on_meeting ← 후반: 약속 시간 도달 자동공개 (z35 양방향 동의 폐기, 결정 8-18)
z37 match_meeting_info_and_lazy_complete ← 후반: 매칭 자동 완료 + venue 정보 노출 (결정 8-20)
z38 match_status_to_group_status_trigger ← 후반: matches.status → groups.status 동기화
z39 notifications_system               ← 후반: in-app 알림 (테이블/트리거/RPC, 결정 8-21)
z40 friend_request_and_reminder_notifications ← 후반: 친구 요청 알림 + 약속 D-1/30분 전 리마인더 RPC
z41 no_show_penalty_distribution       ← 후반: 노쇼 페널티 자동 분배 RPC (8-9)
z42 continuation_choice_and_refund_request ← 후반: 만남 지속 의사 + 자발적 환불 (구걸 UX, 결정 8-22)
z43 continuation_trigger_update_and_expire ← 후반: z39 트리거 갱신 + 7일/14일 만료
z44 admin_role_and_helpers             ← 후반: 운영자 인프라 + RLS 확장 (결정 8-23)
```

### 신규 API routes
```
/api/groups (GET/POST)
/api/groups/leave + /disband + /transfer-leadership
/api/group-invites + /accept
/api/match-pool/stats + /enter + /cancel
/api/matches + /[id] + /[id]/confirm + /[id]/cancel + /[id]/review + /[id]/connections
/api/friend-requests + /[id]/accept + /decline + /cancel
/api/deposits + /summary
```

### 신규 페이지
```
/group/invite/[token]
/friends
/match
/match/[id]
/match/[id]/review
```

### 검증 도구
- `scripts/verify-migrations.py` (정적 마이그 검증, 28 files / 0 issues)

---

## 🚧 남은 작업 (다음 작업자가 받을 것)

### v1 출시 차단 항목 (반드시 필요)

| # | 작업 | 누가 | 소요 |
|---|---|---|---|
| 1 | **Task F · Python Hungarian batch runner** | 성준 | M~L |
| 2 | **토스페이먼츠 sandbox 키 + webhook 통합** | 충현 | M |
| 3 | **Fresh DB Apply 실 검증** (`supabase db reset`) | 충현 (CLI/staging 환경) | S |

### v1.1 이후로 미룰 수 있는 것

- ~~매칭 후 review (만남 평가)~~ ✅ 본 세션 (z33)
- ~~connection (1:1 연결 동의)~~ ✅ 본 세션 (z35)
- attendance (GPS 체크인)
- ~~리더 위임~~ ✅ 본 세션 (z32)
- ~~friend_request 만료 자동 정리~~ ✅ 본 세션 (z31, lazy + bulk RPC)
- admin 페이지 (운영자 점수 보정 / 강제 disband / 매칭 강제)
- 매칭 결과 SMS / push 알림
- ~~매칭 양방향 confirm 추적~~ ✅ 본 세션 (z30)
- 노쇼 페널티 분배 (deposits.distribution_to)

---

## 🟢 워킹트리 상태

- 브랜치: `profile/post-worldcup-decisions-2026-05-21`
- HEAD (전반 세션 종료 시점): `27b1b66 docs: session progress 2026-05-22 (token 90%)`
- HEAD (후반 세션): `f1873a1 feat(review): submit/list review RPC + /match/[id]/review (z33)` 또는 그 이후 docs commit
- 후반 세션 4개 commit 모두 origin push 완료
- 미커밋 변경: 없음
- main 직접 push 없음 (CLAUDE.md 절대 규칙 준수)

---

## ⚠️ 알려진 한계 / 위험

1. **Supabase 마이그 실 적용 미수행** — 정적 검증만 PASS. staging 에서 1회 검증 필수.
2. **토스페이먼츠 미통합** — `enter_match_pool` 이 mock 보증금만 검증. webhook 검증 없음.
3. ~~양방향 match confirm 추적 없음~~ ✅ 해소 (z30 group_a/b_confirmed_at + lazy transition)
4. ~~리더 위임 미구현~~ ✅ 해소 (z32 transfer_group_leadership + UI)
5. ~~friend_request 만료 자동 정리 없음~~ ✅ 해소 (z31 lazy + bulk expire RPC)
6. ~~connections (1:1 연결 동의) UI 미구현~~ ✅ z35 (양방향 동의 시 phone 노출)
7. **attendances GPS 체크인 미구현** — 테이블 정의 only. venues 좌표 비교는 성준 영역.
8. **매칭 결과 통보 (SMS/push) 미구현** — 외부 연동 필요.
9. **노쇼 페널티 자동 분배 미구현** — DISPUTE_CONFIG.NO_SHOW_DISTRIBUTION 정책 정의됨 but RPC 없음.

---

## 🟢 다음 세션 진입 가이드

```
1. git pull origin profile/post-worldcup-decisions-2026-05-21
2. docs/STATUS_2026-05-22.md → 한눈 진행 확인
3. docs/MASTER_PLAN_V1_6_2026-05-21.md → 세부 트랙 확인
4. docs/handoff/CLAUDE_TO_CODEX_HANDOFF_2026-05-22.md → 8절 우선순위
5. docs/SESSION_PROGRESS_2026-05-22.md ← 본 문서
6. 시급 1~3 중 하나 선택해서 진입
```

### 시급 1 진입 시
`docs/MASTER_PLAN_V1_6_2026-05-21.md` 8절 Task F 명세대로:
- `python/matching/engine.py` (cost matrix → 헝가리안)
- `python/matching/batch.py` (Supabase 에서 match_pool 읽기 + matches 쓰기)
- `app/api/admin/matching/run-batch/route.ts` (service_role 호출)
- 성준 영역. 충현 단독 진입 X.

### 시급 2 진입 시
- 토스페이먼츠 dev 콘솔 등록 + sandbox key
- `app/api/payments/toss/webhook/route.ts` (서명 검증 + deposits.status='paid')
- `mock_pay_deposit` → 실 결제 트리거로 교체 (dev mode flag)

### 시급 3 진입 시
- Supabase CLI (`npm i -g supabase`) + Docker Desktop
- 또는 Supabase 대시보드에서 별도 dev 프로젝트 생성 후 SQL Editor 로 적용
- 24개 마이그 순서대로 실행. ASCII 정렬 보장됨
- 핵심 RPC 흐름 수동 검증 (그룹 생성 → invite → accept → 보증금 → 큐 → confirm)

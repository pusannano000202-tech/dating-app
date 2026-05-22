# 부산대 과팅앱 (Destiny) — 프로젝트 전체 인수서

> **Codex 입맞춤용 마스터 문서**. 2026-05-22 후반 세션 종료 시점 기준.
> 이 한 문서만 읽으면 어디까지 진행됐고 다음에 뭘 해야 하는지 알 수 있다.
>
> 더 자세한 결정 기록은 `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` (D-01~D-12)
> + `docs/PLAN_2026-05-22_FINAL.md` (결정 8-1~8-24).

---

## 1. 한 줄 정의

**부산대 대학생 그룹미팅 매칭 앱.** 친구와 그룹 만들고 보증금 걸면, 시스템이 상대 그룹·시간·장소를 자동 확정하는 **프로필 비공개 자동확정 과팅 앱**.

기존 데이팅앱과 차별점:
- **프로필 비공개**: 만남 시점까지 상대 사진·이름 공개 X
- **자동 확정**: 채팅·조율 없이 시간·장소 시스템이 잡아줌
- **보증금 노쇼 방지**: 2만원/인. 노쇼 시 forfeit + 출석자 분배
- **구걸 환불**: 자동 환불 X. 사용자가 0~전액 사이로 직접 선택. 차액이 앱 수익 (8-22)

---

## 2. 팀 구성

| 사람 | 역할 | 도구 |
|---|---|---|
| **충현** | 프로필/외모 + 매칭 마이그/그룹 UI 인수 | Claude Code (이 세션) |
| **성준** | 매칭 엔진 본체 (Python 헝가리안), venues, match_meetings | Claude Code + Codex |
| **Manus** | 남자 64장 이상형 풀 (완료) | 외부 |

**현재 브랜치**: `profile/post-worldcup-decisions-2026-05-21`
**충현 영역 HEAD**: `(z46 commit 직후 / 본 문서가 갱신된 시점의 origin 기준)` — `git log -1 --oneline` 로 확인. 본 문서 작성 시점 기준 마이그 z14~z46 까지 적용.
**성준 영역 HEAD**: `origin/matching/group-engine e9c6637` (venues/match_meetings)

---

## 3. 기술 스택

```
Frontend:  Next.js 14 App Router + TypeScript
Auth:      Supabase Auth (휴대폰 OTP)
DB:        Supabase Postgres + RLS
Storage:   Supabase Storage (사진)
외모 AI:    Python + PyTorch (SCUT-FBP5500 + ResNet50, 충현 영역)
매칭엔진:   Python + scipy (헝가리안 알고리즘, 성준 영역)
결제:      토스페이먼츠 (sandbox 키 대기 → v1 mock_pay_deposit 동작)
배포:      Vercel (프론트) + 분리된 Python 서버 (AI/매칭)
```

---

## 4. 디렉토리 구조

```
/
├── app/                     # Next.js App Router
│   ├── (auth)/login          # 휴대폰 OTP
│   ├── profile/              # 프로필 7단계 입력
│   ├── group/create          # 그룹 만들기 + 초대 + 보증금 + 큐 + 위임 + 해체
│   ├── group/invite/[token]  # 초대 수락 (익명 preview)
│   ├── friends               # 친구 요청 양방향 흐름
│   ├── match/                # 매칭 목록 + 상세 + review + continuation + refund
│   └── notifications         # in-app 알림
├── components/
│   ├── profile/              # worldcup, photo upload, etc
│   ├── matching/             # MatchingPool
│   └── NotificationBell.tsx  # unread 배지
├── lib/
│   ├── supabase.ts, supabase-server.ts
│   ├── types.ts              # 공용 (수정 시 PR + 상대방 리뷰 필수)
│   ├── constants.ts          # DEPOSIT_AMOUNT 등
│   ├── matching/             # config / score / time / filter / group-summary (충현 인수)
│   └── appearance/           # preference / vector
├── python/
│   ├── appearance/           # 외모 AI 추론 (충현)
│   └── matching/             # 매칭 배치 (성준, 미작성)
├── supabase/migrations/      # 본 인수서 7절 참조
├── scripts/verify-migrations.py
└── docs/
    ├── PROJECT_OVERVIEW_2026-05-22.md   ← 이 문서
    ├── PLAN_2026-05-22_FINAL.md         ← 한 페이지 요약 + 결정 기록
    ├── ADMIN_OPERATIONS_PLAN.md          ← 운영자 관리 계획서
    ├── MASTER_PLAN_V1_6_2026-05-21.md   ← v1.6 트랙 전체
    ├── INTERFACE_CONTRACT.md             ← 충현/성준 경계
    ├── COLLABORATION.md                  ← 브랜치/충돌 규칙
    ├── STATUS_2026-05-22.md              ← 한 페이지 진행 요약
    ├── SESSION_PROGRESS_2026-05-22.md    ← 본 세션 commit 기록
    ├── UNDERSTANDING_REVIEW_ROOM_2026-05-21.md  # D-01~D-12
    └── handoff/
        ├── CLAUDE_TO_CODEX_HANDOFF_2026-05-22.md
        ├── CLAUDE_TO_CODEX_HANDOFF_2026-05-22_LATE.md
        ├── CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md
        ├── MANUS_MALE_64_HANDOFF.md
        └── ADMIN_APPEARANCE_SCORE_OVERRIDE.md
```

---

## 5. 전체 사용자 흐름 (E2E)

```
[랜딩페이지 /]
  ↓ MatchingPool 시각화 (실제 DB 집계)
[로그인 /login]
  ↓ 휴대폰 OTP
[프로필 7단계]
  /profile/basic       — 이름(display_name) + 성별 + 나이 + 학교 + 학과
  /profile/worldcup    — 이상형 월드컵 (16강 → 1위) → preferred_axis 벡터 저장
  /profile/photos      — 사진 업로드 + AI self_appearance_score
  /profile/survey      — Big5 성격
  /profile/schedule    — 가능 시간대 (요일별 슬롯)
  /profile/preferences — 매칭 가중치 슬라이더 + 선호 나이 ±N 살
  /profile/complete    — 완료 안내
  ↓
[친구 시스템 /friends]
  ├ 친구 요청 (전화번호로) → friend_requests INSERT
  │   ├ receiver 가입자: 즉시 알림 (z40 트리거: friend_request_received)
  │   └ receiver 미가입: phone-only 저장, 가입 시 z23 자동 매칭
  ├ 받은 요청 수락/거절 → friendships (정규화 user_a < user_b)
  └ 14일 무응답 → expired (z31 lazy expire)
  ↓
[그룹 /group/create]
  ├ 친구 0명이면 /friends CTA
  ├ 그룹 멤버 초대 (in-app friend / phone / 공개 링크)
  │   ├ 친구 가입자: invite_kind='in_app'
  │   ├ phone-only:  invite_kind='phone'
  │   └ 공개 링크:    invite_kind='link'  (z20)
  ├ 멤버 2명 이상 → 보증금 mock 결제 (z24)
  │   └ 그룹 전체 결제 현황 (n/m + 멤버 칩, z25)
  ├ 리더가 전원 결제 후 "매칭 큐 진입"
  │   └ enter_match_pool (z16): deposit 검증 → groups.status='ready' + match_pool waiting
  ├ "큐에서 빠지기" (리더만, z16)
  ├ 그룹 떠나기 (비-리더, z27): left_at + 큐 자동 cancel
  ├ 그룹 해체 (리더, z27): groups.status='disbanded' + 멤버 정리
  └ 리더 위임 (Crown 버튼, z32): forming/ready 일 때만 허용
  ↓
[매칭 결과 /match]
  ↓ Task F (Python 헝가리안) 가 matches row 생성 ← 미구현, 성준 영역
  ↓ matches AFTER INSERT 트리거 → match_created 알림 fan-out (z39)
[매칭 상세 /match/[id]]
  ├ pending 상태:
  │   ├ 양쪽 리더 모두 confirm 필요 (z30 group_a/b_confirmed_at)
  │   ├ 한쪽만 → "상대 확정 대기" 노출
  │   └ 양쪽 → status=confirmed → 그룹 status=matched (z38 트리거)
  ├ confirmed 상태:
  │   ├ 약속 시간/장소 표시 (z37 get_match_detail + match_meetings)
  │   ├ 카운트다운 (D-N / N시간 후 / 시작 시각 도달)
  │   ├ 핸드폰 자동 공개 패널: 약속 시간 도달 시 phone reveal (z36)
  │   ├ GPS 체크인 (약속 30분 전 ~ +2시간, z45)
  │   │   ├ within_radius=TRUE → 출석자
  │   │   └ within_radius=FALSE → 범위 밖 (다시 시도 안내)
  │   ├ 약속 + 30분 후 "노쇼 처리" 버튼 (출석자만)
  │   │   → finalize_no_show RPC
  │   │   → 노쇼 자동 forfeit + 출석자 균등 분배 (z41 자동 호출)
  │   │   → ⚠️ 노쇼 발생 시 z42 구걸 UX 진입 차단
  │   └ "매칭 취소" 버튼 (리더만)
  ├ completed 상태 (z37 lazy: confirmed + scheduled_start + 4h):
  │   ├ groups.status=completed (z38 트리거)
  │   ├ 알림 fan-out: match_completed + phone_revealed + continuation_choice_request (z43)
  │   ├ 사용자에게 두 CTA:
  │   │   ├ "이어갈지 선택하기" → /match/[id]/continuation
  │   │   └ "만남 평가 작성"    → /match/[id]/review (z33)
  │   └ 보증금은 환불 선택 결과 대기
  └ cancelled 상태:
      └ groups.status=ready 로 복귀 (z38) — 큐 재진입 가능

[지속 의사 /match/[id]/continuation] (z42)
  ├ "이어갈래요" / "한 번이면 충분" 2-choice
  ├ 양쪽 그룹 모든 활성 멤버가 'continue' →
  │   ├ 자동 전액 환불 (deposits paid → refunded)
  │   ├ both_continue 알림 fan-out
  │   └ 핸드폰 자동 공개 강조 + 리뷰 skip
  └ 누구라도 'end' →
      ├ review_request 알림 fan-out
      └ /match/[id]/refund 로 자동 이동

[보증금 환불 /match/[id]/refund] (z42 구걸 UX)
  ├ 슬라이더 0 ~ 20,000원 + quick 버튼 (0/half/전액)
  ├ 전액 선택 → 구걸 3단계:
  │   "3,000원만 주시면 안될깡요?? 🥺" → "2,000원만!!" → "1,000원만!!!"
  │   각 단계 거부 → 다음 단계. 최종 → "너무해!!!" → 전액 환불
  ├ 부분 선택 → 그대로 처리
  │   → app_revenue = deposit.amount - refund_amount
  └ 0원 선택 → 사유 chip + 자유 코멘트
      → 상대편 그룹 멤버에게 'partner_paid_zero' 자동 알림 (반강제)
      → 운영자 신고 큐에 입수

[리뷰 /match/[id]/review] (z33, 누구라도 'end' 시 활성화)
  ├ 5-star + 이슈 chip + comment
  ├ 이슈: no_show / profile_mismatch / inappropriate_behavior / good_match
  └ UNIQUE(match_id, reviewer_user_id, target_group_id) 멱등

[알림 /notifications] (z39)
  ├ 최신순 목록, 미읽음 강조
  ├ 클릭 시 자동 mark + 매칭 페이지로 이동 (kind 별 라우팅)
  └ "모두 읽음" 일괄 처리
```

---

## 6. 데이터 모델 (테이블 전체)

### 6.1 사용자/프로필 (충현)

- **`public.users`**: phone, email, created_at (D-10 통일)
- **`profiles`**: user_id PK, display_name, gender, age, height, body_type, school, department, year, appearance_type, appearance_score_normalized (0-1), big5_*, available_timeslots(jsonb), preference_weights(jsonb), **preferred_age_min/max** (z34, 결정 8-13), is_profile_complete
- **`appearance_scores`**: 원본 0-100 점수 (절대 외부 노출 금지)
- **`photos`**: 사진 + storage path

### 6.2 친구

- **`friend_requests`**: sender/receiver_user_id, receiver_phone(가입 전), token, status(pending/accepted/declined/cancelled/expired), expires_at
- **`friendships`**: 정규화 (user_id < friend_user_id), status(active/blocked)

### 6.3 그룹/매칭

- **`groups`**: leader_user_id, size(2-3), gender, status(forming/ready/in_pool/matched/completed/disbanded)
- **`group_members`**: group_id+user_id PK, role, joined_at, left_at
- **`group_invites`**: invited_phone/invited_user_id, token, status, invite_kind(in_app/phone/link)
- **`match_pool`**: group_id, status(waiting/matched/expired/cancelled/rolled_over), rollover_count, batch_id
- **`matches`**: group_a_id < group_b_id, score, score_breakdown(jsonb), status, matched_at, confirmed_at, completed_at, **group_a_confirmed_at**, **group_b_confirmed_at** (z30)
- **`excluded_pairs`**: 정규화 + reason(same_department/previously_matched/manual_block)

### 6.4 보증금/만남

- **`deposits`**: user_id+group_id, amount, status(pending/paid/held/refunded/forfeited/compensated), toss_payment_key/order_id, **distribution_to** (z41 노쇼 분배 대상)
- **`attendances`**: 매칭별 GPS 체크인 (v1.1 미작업)
- **`reviews`**: 매칭+리뷰어+대상그룹 UNIQUE, overall_score(1-5), reported_issues[], comment (z33)
- **`connections`**: 정규화 user_a/b_id, a/b_agreed (z36 부터 자동공개로 무의미), **contact_revealed_at**

### 6.5 venues (성준)

- **`venues`**: 카페/식당/바, 좌표, 영업시간, vibe_tags
- **`match_meetings`**: match_id FK, venue_id FK, scheduled_start, scheduled_end, status, checkin_radius_m

### 6.6 신규 (이번 후반 세션)

- **`notifications`** (z39): user_id, kind, payload(jsonb), read_at, created_at
  - kind: match_created / match_confirmed / match_completed / phone_revealed / review_request / friend_request_received / meeting_reminder / **continuation_choice_request** / **both_continue** / **partner_paid_zero** / **refund_processed** (z42 확장)
- **`match_continuation_choices`** (z42): match_id+user_id UNIQUE, choice(continue/end)
- **`deposit_refund_requests`** (z42): match_id+user_id UNIQUE, requested_refund_amount, zero_refund_reasons[], zero_refund_comment, status
- **`admins`** (z44): user_id PK, role(admin/super_admin), granted_by, granted_at, notes

---

## 7. 마이그레이션 시리즈 (적용 순서)

`_` prefix 는 백본, `z` prefix 는 ASCII 정렬로 백본 이후 적용.

```
20260514_profile_create_appearance_tables
20260514_profile_create_profiles_table
20260515_profile_add_self_appearance_score
20260515_profile_create_photos_table
20260516_matching_add_venues_and_match_meetings ← 성준 영역, 다른 브랜치
20260521_00_create_public_users_table          (D-10)
20260521_matching_create_core_tables
20260521_profile_add_preference_vectors
─ z10 profiles_public_view_security_invoker
─ z11 relax_group_members_unique_to_active
─ z12 rls_strict_write_policies
─ z13 profile_self_appearance_score_sources
─ z14 group_invite_token_acceptance
─ z15 match_pool_stats_rpc
─ z16 match_pool_enter_cancel_rpc
─ z17 grant_invite_lookup_to_anon
─ z18 profile_display_name
─ z19 friend_summaries_rpc
─ z20 group_invite_kind
─ z21 group_member_summaries_rpc
─ z22 rpc_bypass_guards          ← 모든 SECURITY DEFINER 의 bypass guard 통일
─ z23 friend_request_flow         (accept + auto-match 트리거)
─ z24 deposit_check_in_enter_match_pool
─ z25 group_deposit_summary_rpc
─ z26 friend_request_summaries_rpc
─ z27 group_leave_disband_rpc
─ z28 my_matches_rpc
─ z29 match_confirm_rpc
─ z30 match_two_sided_confirm      ★ 양방향 confirm
─ z31 friend_request_lazy_expire   ★ 14일 자동 expired
─ z32 transfer_group_leadership    ★ 리더 위임
─ z33 review_rpc                   ★ 만남 평가
─ z34 profile_preferred_age_range  ★ 결정 8-13 (age_fit)
─ z35 connection_rpc               ★ 양방향 동의 (z36 에서 폐기)
─ z36 connection_auto_reveal_on_meeting  ★ 결정 8-18 (시간 도달 자동공개)
─ z37 match_meeting_info_and_lazy_complete ★ 결정 8-20 (auto complete + venue 노출)
─ z38 match_status_to_group_status_trigger ★ groups.status 동기화
─ z39 notifications_system         ★ 결정 8-21 (in-app 알림)
─ z40 friend_request_and_reminder_notifications ★ 친구 알림 + 약속 D-1/30분 전
─ z41 no_show_penalty_distribution ★ 결정 8-9 자동화
─ z42 continuation_choice_and_refund_request ★ 결정 8-22 (구걸 UX 백엔드)
─ z43 continuation_trigger_update_and_expire ★ 7일/14일 만료 + z39 트리거 갱신
─ z44 admin_role_and_helpers       ★ 운영자 권한 인프라 (결정 8-23)
─ z45 gps_checkin_and_finalize_no_show ★ GPS 노쇼 자동 확정 + 구걸 차단 (결정 8-24)
─ z46 review_fixes_status_admin_view_guards ★ Codex 리뷰 반영 — status 전이, view security_invoker, admin/batch 가드, no_show_finalized 노출
```

**정적 검증**: 44 files / 249 defs / 956 refs / 0 issues. cross-branch `match_meetings/venues` 는 dynamic SQL + to_regclass 우회.

---

## 8. SECURITY DEFINER + bypass guard 패턴 (필독)

z22 이후 모든 데이터 변경은 SECURITY DEFINER RPC 안에서 한다. RLS 정책은:

```sql
USING/WITH CHECK (
  current_setting('app.bypass_<table>_guard', TRUE) = 'on'
  OR (기존 사용자 조건)
)
```

RPC 본문에서:
```sql
PERFORM set_config('app.bypass_<table>_guard', 'on', TRUE);  -- is_local=TRUE
-- UPDATE/INSERT
PERFORM set_config('app.bypass_<table>_guard', 'off', TRUE);
```

`is_local=TRUE` 라 트랜잭션 종료 시 자동 reset. **이 패턴 안 따르면 RLS 위반으로 무음 실패 가능**.

현재 bypass guard 들:
- `app.bypass_groups_guard`
- `app.bypass_match_pool_guard`
- `app.bypass_friend_requests_guard`
- `app.bypass_friendships_guard`
- `app.bypass_deposits_guard`
- `app.bypass_connections_guard`
- `app.bypass_notifications_guard` (z39)
- `app.bypass_mcc_guard` (z42 match_continuation_choices)
- `app.bypass_drr_guard` (z42 deposit_refund_requests)
- `app.bypass_admins_guard` (z44)
- `app.bypass_attendances_guard` (z45)

---

## 9. 매칭 점수 가중치 (현재 값)

`lib/matching/config.ts SCORE_WEIGHTS` (합 1.0):

| 컴포넌트 | 가중치 | 출처 |
|---|---|---|
| APPEARANCE | 0.40 | 외모 양방향 (cosine + asymmetry penalty) |
| PERSONALITY | 0.20 | Big5 양방향 호환 |
| SCORE_BAND_PROXIMITY | 0.10 | 외모 점수대 근접 (±15 stratification 외 가점) |
| PREFERENCE_WEIGHT_ALIGN | 0.10 | 두 그룹의 가중치 슬라이더 일치도 |
| AGE_FIT | 0.10 | 결정 8-13 (자기 선호 범위 ± 3, 밖 5살마다 감소) |
| TIME_FIT | 0.10 | 결정 8-19 (양 그룹 available_timeslots 요일 수 / 7) |

추가:
- Hard filter: MIN_TIME_OVERLAP_DAYS=1, SCORE_BAND_WIDTH=15
- THRESHOLD.PAIR_SCORE_MIN=0.45, ASYMMETRY_PENALTY=0.30
- Forced match: SCORE_MIN=0.30, BAND_WIDTH=25

---

## 10. 알림 종류 (notifications.kind)

| kind | 발송 시점 | 라우팅 |
|---|---|---|
| `match_created` | matches INSERT (z39 트리거) | /match/[id] |
| `match_confirmed` | matches.status pending→confirmed | /match/[id] |
| `match_completed` | matches.status confirmed→completed | /match/[id] |
| `phone_revealed` | matches.status completed (z36 자동공개 트리거) | /match/[id] |
| `continuation_choice_request` | matches.status completed (z43 갱신) | /match/[id]/continuation |
| `both_continue` | 양쪽 모두 continue (z42 트리거) | /match/[id] |
| `review_request` | 누구라도 첫 'end' (z43 트리거) | /match/[id]/review |
| `partner_paid_zero` | submit_refund_request 0원 (z42 RPC) | /match/[id] |
| `refund_processed` | submit_refund_request 처리 + 14일 만료 자동 환불 | /match/[id] |
| `friend_request_received` | friend_requests INSERT (z40 트리거) | /friends |
| `meeting_reminder` | enqueue_meeting_reminders() cron (z40) | /match/[id] |
| `attendance_confirmed` | finalize_no_show 결과 출석자에게 (z45) | /match/[id] |
| `no_show_confirmed` | finalize_no_show 결과 노쇼에게 (z45) | /match/[id] |

cron 호출 권장 주기:
- `enqueue_meeting_reminders()`: 5분 마다
- `expire_continuation_choices()`: 1일 1회
- `expire_refund_requests()`: 1일 1회
- `expire_overdue_friend_requests()` (z31): 1일 1회

→ Supabase `pg_cron` 활성화 후 등록 필요. v1 출시 전 운영자가 수동 호출도 가능.

---

## 11. 핵심 결정 기록 (D-01~D-12 + 8-1~8-24)

### D 결정 (앱 컨셉, 2026-05-21)
- D-01~D-06: 프로필 7단계 구성
- D-02: self-worldcup 폐기 (부활 금지)
- D-09: worldcup 결과 DB 영속화
- D-10: 모든 app FK → `public.users(id)` 통일
- D-12: venues + match_meetings 성준 영역

### 8 결정 (운영 정책)
- **8-1**: 보증금 1인당 20,000원
- **8-2**: 매칭 배치 토요일 14:00
- **8-3**: 그룹 인원 2-3명
- **8-4**: Forced Match 응답 마감 16시간
- **8-5**: 외모 점수대 stratification ±15
- **8-6**: PAIR_SCORE_MIN 0.45
- **8-7**: ASYMMETRY_PENALTY 0.30
- **8-8**: Forced Match PAIR_SCORE_MIN 0.30, BAND_WIDTH 25
- **8-9**: 노쇼 페널티 출석자 균등 분배 (z41 자동화)
- **8-10**: 4주 연속 이월 시 자동 환불
- **8-11**: 거짓말 신고 → operator_review (자동 불가)
- **8-12**: 알림 채널 pwa + email (v1.1)
- **8-13**: AGE_FIT 가중치 0.10, 기본 ±3 (z34)
- **8-14**: 매칭 양방향 confirm 필수 (z30)
- **8-15**: 리더 위임 후 leave 가능 (z32)
- **8-16**: ~~1:1 connection 양방향 동의~~ → **8-18 로 폐기**
- **8-17**: review·connection 둘 다 status='completed' 전제
- **8-18**: **핸드폰 자동공개** — 약속 시간 도달 시 양쪽 phone 자동 reveal. 사용자 동의 불필요 (z36)
- **8-19**: **TIME_FIT 가중치 0.10** — APPEARANCE 0.45→0.40, PERSONALITY 0.25→0.20 양보
- **8-20**: **매칭 자동 완료** — confirmed → completed lazy (scheduled_start + 4h, z37)
- **8-21**: **in-app 알림 시스템** (z39). 외부 SMS/push 는 v1.1
- **8-22 ⭐**: **구걸 UX 환불 (z42)** — 자동 환불 폐기. 사용자 능동 선택. 양쪽 continue 면 자동 전액, 한쪽 end → 환불 선택. 전액 시 3000→2000→1000 구걸. 0원 시 상대편 자동 알림. **앱 수익 = deposit - 사용자 선택 환불액**
- **8-23**: **운영자 권한 인프라 (z44)** — admins 테이블 + is_admin() + 모든 RLS USING 에 admin bypass + grant/revoke_admin RPC + revenue view. v1 1인 super_admin SQL Editor 운영. v1.1 페이지.
- **8-24 ⭐**: **GPS 노쇼 자동 확정 (z45)** — 약속 시간 + 30분 후 finalize_no_show 호출 (출석자만). attendances within_radius=FALSE 거나 없는 사람 = 노쇼 확정. z41 자동 호출 + deposits forfeited 처리. 노쇼 발생 시 z42 구걸 UX 진입 차단 (구걸 멘트 없이 forfeit). batch_finalize_no_shows cron 자동화. **GPS 가 진실의 판단자**.
- **8-25**: **z45 결함 수정 (z46, Codex 리뷰 반영)** —
    (a) `distribute_no_show_penalty` 의 status 검사를 `confirmed/completed` 둘 다 허용 + caller 가 NULL(service_role)/admin 도 허용
    (b) `finalize_no_show` 안에서 status='confirmed' 면 즉시 `completed` 로 전이 (lazy +4h 무시. 노쇼=만남 끝)
    (c) `finalize_no_show_admin` / `batch_finalize_no_shows` 에 admin/service_role 가드 추가 (일반 사용자 호출 차단)
    (d) `admin_revenue_summary` view `security_invoker=on` + `WHERE public.is_admin()` 이중 방어
    (e) `get_match_attendance_state` 에 `no_show_finalized`, `caller_is_no_show` 컬럼 추가 → UI 가 노쇼 발생 시 continuation/refund/review CTA 자동 숨김

---

## 12. 사업 모델 (수익)

```
deposit (1인 20,000원) 의 운명:

  CASE A 양쪽 다 'continue':
    → 전액 환불 (앱 수익 0, retention 가치)

  CASE B 누구라도 'end':
    → /refund 진입
        ├ 전액 선택 (구걸 3단계 후): 0~3,000원 앱 수익
        ├ 부분 선택: (deposit - 선택액) 앱 수익
        └ 0원 선택: 전액 앱 수익 + 상대편 자동 알림

  CASE C 노쇼 (GPS finalize_no_show 로 판정, z45):
    → 노쇼 deposit forfeit, 출석자 균등 분배 (앱 수익 0)
    → 구걸 UX 진입 자체 차단 (continuation/refund RPC 에서 forfeited 검사)

  CASE D 7일 무응답 (continuation 미선택):
    → 자동 'end' → 14일 무응답 (refund 미선택)
    → 자동 전액 환불 (앱 수익 0, 사용자 손해 방지)
```

**예상 수익 패턴**:
- 만남 잘 됨 (양쪽 continue) → 환불해주기 (브랜드 가치)
- 만남 보통 → 1000-3000원 구걸로 수익
- 만남 별로 → 0원 선택 (상대 알림 부담) 또는 부분 (분리)
- 노쇼 → 앱 X, 출석자에게 (보험)

---

## 13. 운영자 관리 (자세한 건 ADMIN_OPERATIONS_PLAN.md 참고)

### v1 (충현 1인 운영)
- z44 `admins` 테이블 + `is_admin()` 헬퍼 함수 추가
- 모든 핵심 테이블 RLS 에 admin bypass 추가 (운영자는 모든 데이터 SELECT 가능)
- Supabase 대시보드 SQL Editor 에서 직접 RPC 호출 (별도 페이지 없이)
- 주요 운영 RPC: `distribute_no_show_penalty`, `expire_*`, `enqueue_meeting_reminders`, `transfer_group_leadership` (운영자 강제 위임 v1.1)

### v1.1
- `/admin/*` 페이지 (대시보드, 사용자 검색, 외모 점수 보정, 매칭 강제, 노쇼 처리, 0원 신고 검토)
- 외모 점수 보정: `docs/handoff/ADMIN_APPEARANCE_SCORE_OVERRIDE.md` 명세
- 매칭 강제 RPC (`force_match_pair(group_a, group_b, batch_id)`)
- 사용자 차단/강퇴 RPC

---

## 14. v1 출시 차단 (외부 의존)

| # | 항목 | 누가 | 상태 |
|---|---|---|---|
| 1 | **Task F · Python 헝가리안 매칭 엔진** | 성준 | 미시작. matches row 생성 차단 |
| 2 | **토스페이먼츠 실결제** | 충현 | sandbox 키 대기. mock 흐름 동작 |
| 3 | **Fresh DB Apply 실 검증** | 충현 | 정적 검증 통과. CLI/staging 환경 필요 |

위 3개가 풀려야 v1 베타 출시 가능.

---

## 15. v1.1 백로그

- attendance GPS 체크인 (좌표 비교 + peer_confirmed)
- admin 페이지 (운영자 도구)
- SMS / push 외부 알림 통합 (notifications row 가 source)
- previously_matched 자동 등록 트리거 (z44 와 별도 마이그)
- Forced match 흐름 (8-8 정책, RPC 미작성)
- excluded_pairs 운영자 관리 UI
- 무응답 14일 → 자동 환불 (z43 expire_refund_requests) 의 cron 등록

---

## 16. 검증 상태 (2026-05-22 후반 세션 종료)

| 검증 | 결과 |
|---|---|
| TypeScript typecheck | ✅ PASS |
| ESLint | ✅ PASS (0 warnings) |
| 마이그 정적 검증 | ✅ 44 files / 249 defs / 956 refs / **0 issues** |
| node:test matching | ✅ 10/10 (ageFit + TIME_FIT 포함) |
| python static | ✅ 11/11 (3 ERROR 는 환경 supabase 모듈 누락, 무관) |

---

## 17. 본 후반 세션 commit (origin push 완료, 13개)

```
826c2f2 z36 핸드폰 자동공개 (결정 8-18)
f6153fb     TIME_FIT 가중치 (결정 8-19)
3eb2821 docs z36 + TIME_FIT 반영
29b1127 z37 매칭 자동 완료 + venue 노출 (결정 8-20)
7a39d22 docs z37 반영
6501de9 z38 groups.status 동기화 트리거
34f4d17 z39 in-app 알림 시스템 (결정 8-21)
8fd9e31 z40 z41 친구 알림 + 약속 리마인더 + 노쇼 분배 (8-9)
[z42z43] z42 z43 구걸 UX 환불 (결정 8-22) + UI
e34db53 docs 구걸 환불 반영
[새]     z44 admin 인프라 + ADMIN_OPERATIONS_PLAN + 본 문서
```

main 직접 push 없음 (CLAUDE.md 절대 규칙 준수).

---

## 18. 다음 작업자 진입 가이드 (Codex 또는 다음 세션)

```bash
git pull origin profile/post-worldcup-decisions-2026-05-21
cat docs/PROJECT_OVERVIEW_2026-05-22.md       # 이 문서
cat docs/PLAN_2026-05-22_FINAL.md              # 한 페이지 요약
cat docs/ADMIN_OPERATIONS_PLAN.md              # 운영자 계획
```

### 선택지

1. **Task F · Python 헝가리안** (성준 영역, 매칭 결과 row 생성)
2. **토스 webhook 통합** (충현 영역, 결제 sandbox)
3. **Fresh DB Apply 실 검증** (Supabase CLI 또는 SQL Editor)
4. **admin 페이지 (v1.1 진입)**
5. **attendance GPS 체크인 (v1.1)**

---

## 19. 절대 규칙 (CLAUDE.md)

- `lib/types.ts` 수정 → PR + 상대방 리뷰 필수
- `supabase/migrations/` 신규 추가 → 상대방 확인 없이 main 머지 금지
- `main` 브랜치 직접 push 금지
- `docs/INTERFACE_CONTRACT.md` 정의된 타입/컬럼명 임의 변경 금지
- 보안: 매칭 엔진 내부값(score_breakdown, batch_id, is_forced) 사용자 노출 금지

---

*이 문서가 곧 진실의 출처(source of truth). 코드와 불일치 발견 시 코드 기준으로 본 문서를 갱신할 것.*

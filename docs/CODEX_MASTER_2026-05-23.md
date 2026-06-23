# 부산대 과팅앱 (Destiny) — Codex 마스터 인수서

> **작성일**: 2026-05-23 · 작성자: 충현 (Claude Code 세션)
> **이 문서 하나로 어디까지 됐고 다음에 뭘 해야 하는지 전부 알 수 있다.**
> 코드와 불일치 발견 시 코드가 진실 — 이 문서를 갱신할 것.

---

## 0. 빠른 진입 명령

```bash
git pull origin profile/post-worldcup-decisions-2026-05-21
cat docs/CODEX_MASTER_2026-05-23.md   # 이 문서
```

**현재 브랜치**: `profile/post-worldcup-decisions-2026-05-21`
**마지막 커밋**: `8db03b8 fix: Codex 리뷰 결함 5개 수정 (z46, 결정 8-25)`
**워킹트리**: z47 SQL + UI (미커밋) — 아래 §3 참조

---

## 1. 한 줄 정의

**부산대 대학생 그룹미팅 매칭 앱.**
친구와 그룹 만들고 보증금 걸면, 시스템이 상대 그룹·시간·장소를 **자동 확정**하는 프로필 비공개 과팅 앱.

핵심 차별점:
- **프로필 비공개**: 만남 시점까지 상대 사진/이름 공개 안 함
- **자동 확정**: 채팅·조율 없이 시간·장소 시스템이 잡아줌
- **보증금 노쇼 방지**: 1인 20,000원. 노쇼 시 forfeit + 출석자 균등 분배
- **Continue 정산 (수익 모델)**: 만남 후 `Continue` 시 사용자가 보증금 20,000원 중 앱에게 줄 금액을 직접 선택. 그 금액이 앱 수익

---

## 2. 팀 구성

| 사람 | 역할 | 도구 |
|---|---|---|
| **충현** | 프로필/외모 + 매칭 마이그/그룹 UI 전체 인수 | Claude Code |
| **성준** | 매칭 엔진 본체 (Python 헝가리안), venues, match_meetings | Claude Code + Codex |
| **Manus** | 남자 64장 이상형 풀 (완료) | 외부 |

**성준 브랜치**: `origin/matching/group-engine HEAD e9c6637` (venues / match_meetings 정의)

---

## 3. 현재 진행률 및 미커밋 작업

### 전체 진행률

```
████████████████████████████████████████  ~99%
```

v1 출시를 막는 건 외부 의존 3개뿐 (§16 참조).

### 미커밋 (z47 — 워킹트리에만 존재)

아래 파일들이 커밋 대기 중:

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260522_z47_invert_beg_policy.sql` | 구걸 UX 정책 반전 (결정 8-26) |
| `app/match/[id]/continuation/page.tsx` | both_continue → 구걸 진입 UX / any_end → 자동환불 안내 |
| `app/match/[id]/refund/page.tsx` | 산지니 캐릭터 구걸 UX (SanjiCard 컴포넌트) |
| `app/api/match-pool/stats/route.ts` | lib/match-pool-stats.ts 로 집계 로직 분리 |
| `app/page.tsx` | 같은 분리 반영 |
| `lib/match-pool-stats.ts` | 신규 - aggregateMatchPoolStats 유틸 |
| `components/SanjiCharacter.tsx` | 신규 - 귀여운 산지니 캐릭터 SVG 컴포넌트 |

---

## 4. 기술 스택

```
Frontend:  Next.js 14 App Router + TypeScript
Auth:      Supabase Auth (휴대폰 OTP)
DB:        Supabase Postgres + Row Level Security (RLS)
Storage:   Supabase Storage (사진)
외모 AI:    Python + PyTorch (SCUT-FBP5500 + ResNet50) — 충현
매칭 엔진:  Python + scipy (헝가리안 알고리즘) — 성준, 미작성
결제:      토스페이먼츠 (현재 mock_pay_deposit 동작, sandbox 키 대기)
배포:      Vercel (프론트) + 분리된 Python 서버 (AI/매칭)
```

---

## 5. 디렉토리 구조

```
/
├── app/
│   ├── (auth)/login/              # 휴대폰 OTP 로그인
│   ├── profile/
│   │   ├── basic/                 # 이름·성별·나이·학교·학과
│   │   ├── worldcup/              # 이상형 월드컵 (16강→1위)
│   │   ├── photos/                # 사진 업로드 + AI 자기 점수
│   │   ├── survey/                # Big5 성격 검사
│   │   ├── schedule/              # 가능 시간대 (요일별 슬롯)
│   │   ├── preferences/           # 매칭 가중치 슬라이더 + 선호 나이 ±N살
│   │   └── complete/              # 완료 안내
│   ├── friends/                   # 친구 요청 양방향 흐름
│   ├── group/
│   │   ├── create/                # 그룹 만들기 + 초대 + 보증금 + 큐 + 위임 + 해체
│   │   └── invite/[token]/        # 초대 수락 (익명 preview)
│   ├── match/
│   │   ├── page.tsx               # 매칭 목록
│   │   └── [id]/
│   │       ├── page.tsx           # 매칭 상세 + GPS 체크인 + 노쇼 처리
│   │       ├── review/            # 만남 평가 (5-star + 이슈 + 코멘트)
│   │       ├── continuation/      # 이어갈지 선택 (continue/end)
│   │       └── refund/            # 보증금 환불 (산지니 구걸 UX)
│   ├── notifications/             # in-app 알림 목록
│   ├── api/
│   │   ├── match-pool/stats/      # GET — 매칭 풀 집계
│   │   └── matches/[id]/refund/   # POST — 환불 처리
│   └── debug/sanji/               # ⚠️ 임시 캐릭터 프리뷰 (출시 전 삭제)
├── components/
│   ├── profile/                   # AppearanceWorldcup, PhotoUpload 등
│   ├── SanjiCharacter.tsx         # ★ 산지니 SVG 캐릭터 (4단계 표정)
│   ├── MatchingPool.tsx           # 풀 현황 시각화
│   └── NotificationBell.tsx       # 미읽음 배지
├── lib/
│   ├── supabase.ts / supabase-server.ts
│   ├── types.ts                   # 공용 타입 (수정 시 PR 필수)
│   ├── constants.ts               # DEPOSIT_AMOUNT=20000 등
│   ├── match-pool-stats.ts        # ★ 신규 - 풀 집계 유틸
│   ├── matching/                  # config / score / time / filter / group-summary
│   └── appearance/                # preference / vector
├── python/
│   ├── appearance/                # 외모 AI 추론 서버 (충현)
│   └── matching/                  # 매칭 배치 엔진 (성준, 미작성)
├── supabase/migrations/           # 백본 + z10~z47 (§9 참조)
├── scripts/verify-migrations.py   # 정적 검증 도구
└── docs/
    ├── CODEX_MASTER_2026-05-23.md ← 이 문서
    ├── PROJECT_OVERVIEW_2026-05-22.md  ← 이전 버전 (참고용)
    ├── PLAN_2026-05-22_FINAL.md        ← 한 페이지 요약
    ├── INTERFACE_CONTRACT.md           ← 충현/성준 경계 (필독)
    ├── COLLABORATION.md                ← 브랜치/충돌 규칙
    ├── ADMIN_OPERATIONS_PLAN.md        ← 운영자 관리
    └── handoff/                        ← 이전 인수서들
```

---

## 6. 전체 사용자 흐름 (E2E)

```
[랜딩 /]
  MatchingPool 풀 현황 시각화 (실시간 DB 집계)
  ↓
[로그인 /(auth)/login]
  휴대폰 OTP → Supabase Auth
  ↓
[프로필 7단계]
  /profile/basic        → display_name + 성별 + 나이 + 학교 + 학과
  /profile/worldcup     → 이상형 월드컵 16강 → preferred_axis 벡터 저장
  /profile/photos       → 사진 업로드 + AI self_appearance_score
  /profile/survey       → Big5 성격 5문항
  /profile/schedule     → 가능 시간대 (요일별 슬롯 → available_timeslots JSONB)
  /profile/preferences  → 매칭 가중치 슬라이더 + 선호 나이 ±N살
  /profile/complete     → is_profile_complete=TRUE
  ↓
[친구 /friends]
  전화번호로 친구 요청 → friend_requests INSERT
    └ 가입자: 즉시 알림 (friend_request_received 종류)
    └ 미가입: phone-only 저장, 가입 시 자동 매칭 (z23 트리거)
  받은 요청 수락/거절 → friendships (정규화 user_a < user_b)
  14일 무응답 → expired (z31 lazy expire)
  ↓
[그룹 /group/create]
  그룹 멤버 초대 (in-app 친구 / 전화번호 / 공개 링크)
  멤버 2명 이상 → 보증금 결제 (현재 mock_pay_deposit)
  전원 결제 후 리더가 "매칭 큐 진입" → groups.status='ready' + match_pool 진입
  ↓ (여기서 Task F 매칭 엔진이 matches row 생성 ← 성준 영역, 미구현)
[매칭 상세 /match/[id]]
  pending:
    양쪽 리더 모두 confirm (z30 group_a/b_confirmed_at) → confirmed
    한쪽만 → "상대 확정 대기" 노출
  confirmed:
    약속 시간/장소 표시 (match_meetings, venues)
    카운트다운 표시
    핸드폰 자동 공개 패널 — 약속 시간 도달 시 phone 공개 (z36)
    GPS 체크인 (약속 -30분 ~ +2시간, z45)
    약속 +30분 후 "노쇼 처리" 버튼 (출석자만)
      → finalize_no_show → forfeit + 분배 + 구걸 차단
  completed (scheduled_start + 4h 후 lazy 전이, z37):
    이어갈지 선택하기 → /match/[id]/continuation
    만남 평가 작성 → /match/[id]/review
  cancelled:
    groups.status=ready 복귀 (z38 트리거) → 큐 재진입 가능

[지속 의사 /match/[id]/continuation] (z42 + z47 갱신)
  my_choice 선택 전:
    "이어갈래요 💜" (continue) / "한 번이면 충분" (end)
    규칙 안내: 양쪽 continue → 구걸 UX 진입, 한 명이라도 end → 자동 전액 환불
  양쪽 모두 continue (both_continue):
    → 구걸 UX 진입 안내 + /refund 링크 (결정 8-26, z47)
    ← 결정 8-22 의 "자동 전액 환불" 폐기됨
  누구라도 end (any_end):
    → 자동 전액 환불 처리 + 리뷰 안내 (결정 8-26, z47)
    ← 기존 /refund 진입 흐름 폐기됨
  노쇼 발생 시: continuation/refund 진입 자체 차단 (z42+z45 가드)

[보증금 환불 /match/[id]/refund] (both_continue 시에만 진입 가능, z47)
  ★ 앱에게 줄 금액(app_fee_amount) 선택 UX
  select 단계: "20,000원 중 앱에게 얼마를 줄거냐?" + 슬라이더 0~20,000원 + 퀵버튼 0/1000/2000/3000/5000/10000원
  3,000원 이상 선택 시 → 그대로 정산, 상대에게 금액 알림 없음
  3,000원 미만 선택 시 → "3,000원만 주면 안돼?!?" 애교/구걸 모달
  1,000원/2,000원 확정 전 → "3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다" 안내
  0원 확정 전 → "그래도 0원 주겠습니까?" 재확인 + 상대에게 0원 알림이 간다는 최종 경고
  0원 경고 화면 → 사용자 성별 기준으로 상대가 삐진 반응 만화 컷 표시
  앱 수익 = app_fee_amount
  환불액 = deposit(20,000) - app_fee_amount
  노쇼 발생 시: "no_show_cannot_refund" 에러로 차단

[만남 평가 /match/[id]/review] (z33)
  5-star + 이슈 chip + 코멘트
  이슈: no_show / profile_mismatch / inappropriate_behavior / good_match
  UNIQUE(match_id, reviewer_user_id, target_group_id) — 멱등

[알림 /notifications] (z39)
  최신순 목록, 미읽음 강조
  클릭 시 자동 mark + kind별 라우팅
  "모두 읽음" 일괄 처리
```

---

## 7. 완료된 기능 체크리스트

### ✅ 완료 (코드 + 마이그 모두)

- [x] 프로필 7단계 (display_name + 나이 범위 포함)
- [x] 이상형 월드컵 (16강, preferred_axis 벡터)
- [x] 사진 업로드 + AI self_appearance_score (외모 AI 서버 별도)
- [x] Big5 성격 검사
- [x] 가능 시간대 (available_timeslots JSONB)
- [x] 매칭 가중치 슬라이더 + 선호 나이 ±N살 (결정 8-13)
- [x] 친구 요청 / 수락 / 거절 / 만료 (z23, z31)
- [x] 그룹 만들기 + 멤버 초대 (in-app / phone / 공개 링크, z20)
- [x] 보증금 mock 결제 + 전체 현황 표시 (z24, z25)
- [x] 매칭 큐 진입/취소 (z16)
- [x] 매칭 양방향 confirm (z30, group_a/b_confirmed_at)
- [x] 매칭 자동 완료 lazy (z37, scheduled_start + 4h)
- [x] 그룹 status 동기화 트리거 (z38)
- [x] 그룹 떠나기 / 해체 / 리더 위임 (z27, z32)
- [x] 친구 요청 자동 만료 (z31, 14일)
- [x] 만남 평가 (z33, 5-star + 이슈 + 코멘트)
- [x] 핸드폰 자동공개 (z36, 약속 시간 도달 시, 결정 8-18)
- [x] match_meetings 정보 노출 RPC (z37, get_match_detail)
- [x] in-app 알림 시스템 (z39, notifications 테이블 + 트리거 + 페이지)
- [x] 친구 요청 알림 + 약속 리마인더 (z40)
- [x] 노쇼 분배 RPC (z41, distribute_no_show_penalty)
- [x] 구걸 UX 환불 백엔드 (z42, match_continuation_choices + deposit_refund_requests)
- [x] 구걸 트리거 + 7일/14일 만료 (z43)
- [x] 운영자 권한 인프라 (z44, admins + is_admin() + RLS bypass + revenue view)
- [x] GPS 체크인 + 노쇼 자동 확정 (z45, checkin_attendance + finalize_no_show)
- [x] Codex 리뷰 결함 수정 (z46, 5개 수정)
- [x] 구걸 UX 정책 반전 SQL (z47, 미커밋 — both_continue→구걸, any_end→자동환불)
- [x] 산지니 캐릭터 구걸 UX (SanjiCharacter.tsx, 미커밋)
- [x] continuation 페이지 z47 UX 반영 (미커밋)
- [x] refund 페이지 산지니 구걸 (미커밋)

### ❌ 미완성 (v1 차단)

- [ ] **Task F — Python 헝가리안 매칭 엔진** (성준 영역)
- [ ] **토스페이먼츠 실결제** (sandbox 키 필요)
- [ ] **Fresh DB Apply 실 검증** (staging 환경 필요)

### 🌿 v1.1 백로그

- [ ] /admin/* 페이지 (대시보드, 사용자 검색, 점수 보정, 강제 매칭 등)
- [ ] SMS / push 외부 알림 통합 (in-app은 완료, 외부는 v1.1)
- [ ] previously_matched 자동 등록 트리거 (match 완료 시 excluded_pairs 자동)
- [ ] Forced Match RPC (force_match_pair, 결정 8-8 정책)
- [ ] excluded_pairs 운영자 관리 UI
- [ ] pg_cron 등록 (expire_*, enqueue_meeting_reminders, batch_finalize_no_shows)

---

## 8. 데이터 모델 (테이블 전체)

### 사용자/프로필 (충현 소유)

```sql
public.users           -- phone, email, created_at
profiles               -- user_id PK, display_name, gender, age, height,
                       -- body_type, hair_density, school, department, year,
                       -- appearance_type, appearance_score_normalized(0-1),
                       -- big5_*, available_timeslots(jsonb), preference_weights(jsonb),
                       -- preferred_age_min, preferred_age_max, is_profile_complete
appearance_scores      -- score_raw(0-100) ← 절대 외부 노출 금지
photos                 -- user_id, url, storage_path, is_primary
```

### 친구

```sql
friend_requests  -- sender/receiver_user_id, receiver_phone(미가입용), token,
                 -- status(pending/accepted/declined/cancelled/expired), expires_at
friendships      -- 정규화(user_a < user_b), status(active/blocked)
```

### 그룹/매칭 (성준 소유, 충현이 마이그 인수)

```sql
groups           -- leader_user_id, size(2-3), gender,
                 -- status(forming/ready/in_pool/matched/completed/disbanded)
group_members    -- group_id+user_id PK, role, joined_at, left_at
group_invites    -- invited_phone/user_id, token, status, invite_kind(in_app/phone/link)
match_pool       -- group_id, status(waiting/matched/expired/cancelled/rolled_over),
                 -- rollover_count, batch_id
matches          -- group_a_id < group_b_id (정규화), score, score_breakdown(jsonb),
                 -- status(pending/confirmed/completed/cancelled),
                 -- matched_at, confirmed_at, completed_at,
                 -- group_a_confirmed_at, group_b_confirmed_at  ← z30
excluded_pairs   -- 정규화, reason(same_department/previously_matched/manual_block)
```

### 보증금/만남

```sql
deposits         -- user_id+group_id, amount(20000), status(pending/paid/held/refunded/forfeited/compensated),
                 -- toss_payment_key, toss_order_id, distribution_to(노쇼 분배 대상)
attendances      -- match_id, user_id, lat, lng, within_radius, checked_in_at  ← z45
reviews          -- match_id+reviewer+target_group UNIQUE, overall_score(1-5),
                 -- reported_issues[], comment  ← z33
connections      -- 정규화 user_a/b_id, a/b_agreed(무의미, 자동공개 이후),
                 -- contact_revealed_at  ← z36
```

### 구걸/환불 (z42 신규)

```sql
match_continuation_choices  -- match_id+user_id UNIQUE, choice(continue/end)
deposit_refund_requests     -- match_id+user_id UNIQUE, requested_refund_amount,
                            -- zero_refund_reasons[], zero_refund_comment, status(pending/processed)
```

### 알림 (z39 신규)

```sql
notifications    -- user_id, kind(아래 §11 참조), payload(jsonb),
                 -- read_at, created_at
```

### 운영자 (z44 신규)

```sql
admins           -- user_id PK, role(admin/super_admin), granted_by, granted_at, notes
-- view: admin_revenue_summary (security_invoker=on, is_admin() 체크)
```

### 성준 영역 (다른 브랜치)

```sql
venues           -- 카페/식당/바, lat, lng, 영업시간, vibe_tags
match_meetings   -- match_id FK, venue_id FK, scheduled_start, scheduled_end,
                 -- status, checkin_radius_m
```

---

## 9. 마이그레이션 시리즈 (전체, 적용 순서)

> 파일명은 `supabase/migrations/` 기준. 백본 먼저, z 시리즈는 ASCII 정렬로.

```
── 백본 (날짜 prefix) ──────────────────────────────────────────
20260514_profile_create_appearance_tables     외모 테이블
20260514_profile_create_profiles_table        profiles 테이블
20260515_profile_add_self_appearance_score    AI 자기 점수 컬럼
20260515_profile_create_photos_table          photos 테이블
20260521_00_create_public_users_table         D-10: 모든 FK → public.users
20260521_matching_create_core_tables          그룹/매칭 코어 (성준 원본)
20260521_profile_add_preference_vectors       preference_weights JSONB

── z 시리즈 (충현 인수 후 추가) ────────────────────────────────
z10  profiles_public_view_security_invoker     뷰 security_invoker
z11  relax_group_members_unique_to_active      left_at NULL 허용 복합 UK
z12  rls_strict_write_policies                 RLS 강화 (INSERT WITH CHECK)
z13  profile_self_appearance_score_sources     점수 출처 추적
z14  group_invite_token_acceptance             초대 토큰 수락 RPC
z15  match_pool_stats_rpc                      get_match_pool_stats RPC
z16  match_pool_enter_cancel_rpc               enter_match_pool / cancel_match_pool
z17  grant_invite_lookup_to_anon               익명 초대 조회 허용
z18  profile_display_name                      display_name 컬럼 추가
z19  friend_summaries_rpc                      get_friend_summaries
z20  group_invite_kind                         invite_kind(in_app/phone/link) 컬럼
z21  group_member_summaries_rpc                get_group_member_summaries
z22  rpc_bypass_guards                        ★ 모든 SECURITY DEFINER bypass 패턴 통일
z23  friend_request_flow                       accept_friend_request + 자동 미가입 매칭 트리거
z24  deposit_check_in_enter_match_pool         보증금 검증 + 입금 체크
z25  group_deposit_summary_rpc                 get_group_deposit_summary
z26  friend_request_summaries_rpc              get_friend_request_summaries
z27  group_leave_disband_rpc                   leave_group / disband_group
z28  my_matches_rpc                            get_my_matches
z29  match_confirm_rpc                         confirm_match
z30  match_two_sided_confirm                  ★ 양방향 confirm (group_a/b_confirmed_at)
z31  friend_request_lazy_expire               ★ 14일 자동 expired + bulk RPC
z32  transfer_group_leadership                ★ 리더 위임 RPC + Crown UI
z33  review_rpc                               ★ 만남 평가 submit/get (5-star + 이슈)
z34  profile_preferred_age_range              ★ 결정 8-13: preferred_age_min/max + AGE_FIT
z35  connection_rpc                            양방향 동의 (z36 에서 폐기됨)
z36  connection_auto_reveal_on_meeting        ★ 결정 8-18: 약속 시간 도달 시 phone 자동공개
z37  match_meeting_info_and_lazy_complete     ★ 결정 8-20: auto complete + match_meetings 노출
z38  match_status_to_group_status_trigger     ★ matches.status → groups.status 동기화
z39  notifications_system                     ★ 결정 8-21: in-app 알림 테이블 + 트리거
z40  friend_request_and_reminder_notifs        친구 알림 트리거 + 약속 D-1/30분 리마인더
z41  no_show_penalty_distribution             ★ 결정 8-9: distribute_no_show_penalty RPC
z42  continuation_choice_and_refund_request   ★ 결정 8-22: 구걸 UX 백엔드 (테이블 + RPC)
z43  continuation_trigger_update_and_expire   ★ 7일/14일 만료 자동화 + z39 트리거 갱신
z44  admin_role_and_helpers                   ★ 결정 8-23: admins + is_admin() + RLS bypass + revenue view
z45  gps_checkin_and_finalize_no_show         ★ 결정 8-24: GPS 체크인 + 노쇼 자동 확정 + 구걸 차단
z46  review_fixes_status_admin_view_guards    ★ 결정 8-25: Codex 리뷰 반영 5개 수정
z47  invert_beg_policy                        ★ 결정 8-26: both_continue→구걸, any_end→자동환불 (미커밋)
```

**정적 검증 (z46 기준)**: 44 files / 249 defs / 956 refs / **0 issues**
`scripts/verify-migrations.py` 로 확인. cross-branch `match_meetings/venues` 는 dynamic SQL + `to_regclass` 우회.

---

## 10. SECURITY DEFINER + bypass guard 패턴 (필독)

z22 이후 모든 데이터 변경은 SECURITY DEFINER RPC 내에서 한다.

### RLS 정책 형식

```sql
USING (
  current_setting('app.bypass_<table>_guard', TRUE) = 'on'
  OR (기존 사용자 조건)
)
```

### RPC 호출 형식

```sql
PERFORM set_config('app.bypass_<table>_guard', 'on', TRUE);   -- is_local=TRUE
-- INSERT / UPDATE
PERFORM set_config('app.bypass_<table>_guard', 'off', TRUE);
```

`is_local=TRUE` → 트랜잭션 종료 시 자동 reset. **이 패턴 안 따르면 RLS 위반으로 무음 실패.**

### 현재 등록된 bypass guard 전체

| guard key | 적용 테이블 | 추가된 마이그 |
|---|---|---|
| `app.bypass_groups_guard` | groups | z22 |
| `app.bypass_match_pool_guard` | match_pool | z22 |
| `app.bypass_friend_requests_guard` | friend_requests | z22 |
| `app.bypass_friendships_guard` | friendships | z22 |
| `app.bypass_deposits_guard` | deposits | z22 |
| `app.bypass_connections_guard` | connections | z22 |
| `app.bypass_notifications_guard` | notifications | z39 |
| `app.bypass_mcc_guard` | match_continuation_choices | z42 |
| `app.bypass_drr_guard` | deposit_refund_requests | z42 |
| `app.bypass_admins_guard` | admins | z44 |
| `app.bypass_attendances_guard` | attendances | z45 |

---

## 11. 매칭 점수 가중치 (현재 값, 합 = 1.0)

`lib/matching/config.ts` → `SCORE_WEIGHTS`

| 컴포넌트 | 가중치 | 설명 |
|---|---|---|
| APPEARANCE | **0.40** | 외모 양방향 (cosine + asymmetry penalty) |
| PERSONALITY | **0.20** | Big5 양방향 호환성 |
| SCORE_BAND_PROXIMITY | **0.10** | 외모 점수대 근접 (±15 band 내 가점) |
| PREFERENCE_WEIGHT_ALIGN | **0.10** | 두 그룹의 가중치 슬라이더 일치도 |
| AGE_FIT | **0.10** | 결정 8-13: 선호 나이 범위 ±3, 밖이면 5살마다 점수 감소 |
| TIME_FIT | **0.10** | 결정 8-19: available_timeslots 교집합 요일 수 / 7 |

추가 설정:
- Hard filter: `MIN_TIME_OVERLAP_DAYS=1`, `SCORE_BAND_WIDTH=15`
- `THRESHOLD.PAIR_SCORE_MIN=0.45`, `ASYMMETRY_PENALTY=0.30`
- Forced match: `SCORE_MIN=0.30`, `BAND_WIDTH=25`

---

## 12. 알림 종류 (notifications.kind)

| kind | 발송 시점 | 라우팅 |
|---|---|---|
| `match_created` | matches INSERT (z39 트리거) | /match/[id] |
| `match_confirmed` | matches pending→confirmed | /match/[id] |
| `match_completed` | matches confirmed→completed | /match/[id] |
| `phone_revealed` | completed 전이 (z36 get_match_connections 시점) | /match/[id] |
| `continuation_choice_request` | completed 전이 (z43 트리거) | /match/[id]/continuation |
| `both_continue` | 양쪽 모두 continue (z42 트리거, z47 갱신) | /match/[id]/continuation (→refund 링크) |
| `review_request` | 첫 'end' INSERT (z43 트리거) | /match/[id]/review |
| `refund_processed` | submit_refund_request + any_end 자동환불 (z47) | /match/[id] |
| `partner_paid_zero` | 앱 수익 0원 확정 시 상대편 알림 | /match/[id] |
| `friend_request_received` | friend_requests INSERT (z40 트리거) | /friends |
| `meeting_reminder` | enqueue_meeting_reminders() cron (z40) | /match/[id] |
| `attendance_confirmed` | finalize_no_show — 출석자에게 (z45) | /match/[id] |
| `no_show_confirmed` | finalize_no_show — 노쇼에게 (z45) | /match/[id] |

### cron 주기 권장

```sql
-- Supabase pg_cron 활성화 후 등록 필요 (v1 출시 전)
select cron.schedule('5min-reminders',  '*/5 * * * *', 'SELECT public.enqueue_meeting_reminders()');
select cron.schedule('daily-expire',    '0 3 * * *',   'SELECT public.expire_continuation_choices(); SELECT public.expire_refund_requests(); SELECT public.expire_overdue_friend_requests()');
select cron.schedule('daily-no-show',   '0 4 * * *',   'SELECT public.batch_finalize_no_shows()');
```

---

## 13. 사업 모델 — 보증금의 운명

```
deposit 1인 20,000원

CASE A: 양쪽 모두 'continue' (both_continue)            결정 8-26 (z47)
  → /refund 진입 (앱에게 줄 금액 선택 UX)
  → 3,000원 이상 선택 시 그대로 정산, 상대 금액 알림 없음
  → 3,000원 미만 선택 시 3,000원 설득 모달
  → 1,000원/2,000원은 안내 후 확정 가능, 0원은 재확인/상대 알림 경고/삐진 반응 만화 후 확정 가능
  → 앱 수익 = app_fee_amount, 환불액 = 20,000 - app_fee_amount
  ← 앱 수익 발생 가능 (운영비 "자발적 납부" 프레임)

CASE B: 누구라도 'end' (any_end)                         결정 8-26 (z47)
  → 자동 전액 환불 (구걸 UX 없음, 신뢰 보호)
  → 앱 수익 = 0
  ← "별로였는데 돈 떼면 신뢰 파괴"

CASE C: 노쇼 (GPS finalize_no_show 판정, z45)
  → 노쇼자 deposit forfeit → 출석자 균등 분배
  → 구걸 UX 진입 자체 차단 (no_show_cannot_refund 에러)
  → 앱 수익 = 0 (출석자 보험)

CASE D: 7일 무응답 (continuation 미선택, z43)
  → 자동 'end' → CASE B 흐름

CASE E: 14일 무응답 (refund 미선택, z43)
  → 자동 전액 환불 → 앱 수익 = 0
```

---

## 14. 산지니 캐릭터 (SanjiCharacter.tsx) — 신규

구걸 UX에서 등장하는 귀여운 마스코트.

```
components/SanjiCharacter.tsx
  type SanjiMood = 'pleading' | 'desperate' | 'crying' | 'collapsed'

  현재 정책에서는 3,000원 미만 선택 시 1차 설득 모달에 사용한다.
  1,000원/2,000원은 금액 비공개 기준 안내 후 확정 가능하다.
  0원은 별도 삐진 반응 만화 컷 + 상대 알림 경고를 거친다.
```

SVG 디자인:
- 노란 둥근 몸체 (산지니 꿩 스타일)
- 보라색 크레스트 깃털 (부산대 컬러 #7c3aed / #8b5cf6)
- 볼터치, 주황 부리, 주황 날개, 보라 꼬리

CSS 애니메이션 (`globals.css`에 정의):
```css
@keyframes wiggle { 0%,100% { transform: rotate(-7deg) } 25% { transform: rotate(7deg) scale(1.03) } }
@keyframes sway   { 0%,100% { transform: translateX(-7px) rotate(-3deg) } 50% { transform: translateX(7px) rotate(3deg) } }
```

---

## 15. 결정 기록 전체

### D 결정 (앱 컨셉, 2026-05-21)

| ID | 결정 |
|---|---|
| D-01~D-06 | 프로필 7단계 구성 확정 |
| D-02 | self-worldcup 폐기 — 부활 금지 |
| D-09 | 이상형 월드컵 결과 DB 영속화 |
| D-10 | 모든 앱 FK → `public.users(id)` 통일 |
| D-12 | venues + match_meetings = 성준 영역 |

### 8 결정 (운영 정책)

| ID | 결정 | 구현 |
|---|---|---|
| 8-1 | 보증금 1인당 **20,000원** | DEPOSIT_AMOUNT 상수 |
| 8-2 | 매칭 배치 **토요일 14:00** | Python 배치 (성준) |
| 8-3 | 그룹 인원 **2~3명** | groups.size CHECK |
| 8-4 | Forced Match 응답 마감 **16시간** | 정책만, RPC 미작성 |
| 8-5 | 외모 점수대 stratification **±15** | SCORE_BAND_WIDTH |
| 8-6 | PAIR_SCORE_MIN **0.45** | config.ts |
| 8-7 | ASYMMETRY_PENALTY **0.30** | config.ts |
| 8-8 | Forced Match PAIR_SCORE_MIN **0.30**, BAND_WIDTH **25** | config.ts |
| 8-9 | 노쇼 페널티 출석자 **균등 분배** | z41 distribute_no_show_penalty |
| 8-10 | 4주 연속 이월 → 자동 환불 | rollover_count 추적, 트리거 미작성 |
| 8-11 | 거짓말 신고 → operator_review | 신고 수집만, 자동화 불가 |
| 8-12 | 알림 채널 PWA + email | v1.1 |
| 8-13 | AGE_FIT 가중치 **0.10**, 기본 **±3** | z34 |
| 8-14 | 매칭 **양방향 confirm** 필수 | z30 |
| 8-15 | 리더 위임 후 본인 leave 가능 | z32 |
| 8-16 | ~~1:1 connection 양방향 동의~~ | **8-18 로 폐기** |
| 8-17 | review/connection = `status='completed'` 전제 | 코드 가드 |
| 8-18 | **핸드폰 자동공개** — 약속 시간 도달 시 phone reveal, 동의 불필요 | z36 |
| 8-19 | **TIME_FIT 0.10** — APPEARANCE 0.45→0.40, PERSONALITY 0.25→0.20 | config.ts 수정 |
| 8-20 | **매칭 자동 완료** — confirmed + scheduled_start + 4h → completed lazy | z37 |
| 8-21 | **in-app 알림** — notifications 테이블 + 트리거. 외부 SMS는 v1.1 | z39 |
| 8-22 ⭐ | **Continue 정산 UX** — 양쪽 continue → 앱에게 줄 금액 선택. 3,000원 이상은 바로 정산. 3,000원 미만은 설득/안내. 0원은 재확인 + 상대 알림 경고 + 삐진 반응 만화. 누구라도 end → 자동 전액 환불. 수익 = app_fee_amount | z42/z43/z47 |
| 8-23 | **운영자 권한 인프라** — admins 테이블 + is_admin() + RLS bypass + revenue view | z44 |
| 8-24 ⭐ | **GPS 노쇼 자동 확정** — 약속 + 30분 후 finalize_no_show. attendances 없거나 범위 밖 = 노쇼. forfeit + 분배 + 구걸 차단 | z45 |
| 8-25 | **z46 Codex 결함 수정** — (a) distribute_no_show_penalty: confirmed/completed 둘 다 허용 + NULL/admin caller (b) finalize_no_show: confirmed→completed 즉시 전이 (c) finalize_no_show_admin/batch: admin/service_role 가드 (d) admin_revenue_summary: security_invoker + is_admin() (e) get_match_attendance_state: no_show_finalized + caller_is_no_show 노출 | z46 |
| 8-26 ★ | **구걸 UX 정책 반전** — `both_continue` → 구걸 진입 (앱이 "우리 덕분에 잘 됐잖아요" 명분). `any_end` → 자동 전액 환불 (별로였는데 돈 떼면 신뢰 파괴). `no_show` 그대로 forfeit + 차단 | z47 (미커밋) |

---

## 16. v1 출시 차단 (외부 의존 3개)

### 1. Task F — Python 헝가리안 매칭 엔진 (성준 영역)

```
현황: python/matching/ 미작성
차단: 매칭 배치 실행 → matches row 생성 안 됨
      match_pool 에 그룹이 쌓여도 자동으로 매칭되지 않음
진입: docs/product/matching/MATCHING_SYSTEM_PLAN.md + lib/matching/*.ts 인터페이스 참고
```

### 2. 토스페이먼츠 실결제 (충현 영역)

```
현황: mock_pay_deposit RPC 로 보증금 mock 처리 중
차단: 실제 결제 없이 출시 불가
할일: Toss 콘솔 가입 → sandbox 키 발급
      → /api/payments/toss/webhook 라우트 구현
      → 결제 실패/환불 흐름 구현
      → mock_pay_deposit → 실 트리거로 교체
```

### 3. Fresh DB Apply 실 검증 (충현 영역)

```
현황: 정적 검증(verify-migrations.py) PASS, 실 DB 적용 미검증
할일: Supabase CLI 또는 SQL Editor 에서 마이그 순서대로 적용
      → 핵심 RPC 수동 검증 (enter_match_pool, finalize_no_show, submit_refund_request)
```

---

## 17. 인터페이스 계약 (충현/성준 경계)

**자세한 내용**: `docs/engineering/INTERFACE_CONTRACT.md`

### 충현 소유
- `users`, `profiles`, `photos`, `personality_scores`, `appearance_scores`
- `python/appearance/`
- `app/profile/`, `components/profile/`

### 성준 소유
- `groups`, `group_members`, `match_requests`, `matches`, `deposits`
- `attendances`, `reviews`, `connections`, `excluded_pairs`
- `python/matching/`, `venues`, `match_meetings`
- `app/group/`, `app/match/`, `components/matching/`

### 충현이 인수한 성준 영역 마이그
z10~z47 전체. 충현이 작성했지만 성준 테이블을 건드리는 RPC 포함. 변경 시 성준 리뷰 필요.

### 핵심 계약 타입 (`lib/types.ts`)

```typescript
// 이 파일 수정 = PR + 성준 리뷰 필수

type Gender = 'male' | 'female'
type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'
type DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited' | 'compensated'
type MatchStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'

interface AvailableTimeslots {
  slots: Array<{ day: DayOfWeek; start: string; end: string }>
}

interface PreferenceWeights {
  appearance: number; personality: number; height: number
  body_type: number; school: number; hobby: number; time_fit: number
  // 합 = 1.0 보장
}
```

---

## 18. 검증 상태 (z46 커밋 기준)

| 검증 항목 | 결과 |
|---|---|
| TypeScript typecheck (`tsc --noEmit`) | ✅ PASS |
| ESLint | ✅ PASS (0 warnings, 0 errors) |
| 마이그 정적 검증 (`scripts/verify-migrations.py`) | ✅ 44 files / 249 defs / 956 refs / **0 issues** |
| node:test matching 코어 | ✅ 10/10 (ageFit + TIME_FIT 포함) |
| python static | ✅ 11/11 (3 ERROR 는 환경 supabase 모듈 누락, 로직 무관) |

z47 (미커밋) 포함 검증:
- TypeScript typecheck: ✅ PASS (방금 확인)

---

## 19. 주요 UI 파일 (빠른 참조)

```
app/page.tsx                           랜딩 + MatchingPool
app/(auth)/login/page.tsx              OTP 로그인
app/profile/basic/page.tsx             display_name + 성별 + 나이
app/profile/worldcup/page.tsx          이상형 월드컵
app/profile/photos/page.tsx            사진 업로드 + AI 점수
app/profile/survey/page.tsx            Big5
app/profile/schedule/page.tsx          가능 시간대
app/profile/preferences/page.tsx       매칭 가중치 + 선호 나이
app/friends/page.tsx                   친구 요청/수락
app/group/create/page.tsx              그룹 + 초대 + 보증금 + 큐
app/group/invite/[token]/page.tsx      초대 수락
app/match/page.tsx                     매칭 목록
app/match/[id]/page.tsx                매칭 상세 + GPS + 노쇼
app/match/[id]/review/page.tsx         만남 평가
app/match/[id]/continuation/page.tsx   이어갈지 선택 (z47 반영)
app/match/[id]/refund/page.tsx         보증금 환불 + 산지니 구걸 UX
app/notifications/page.tsx             in-app 알림
app/debug/sanji/page.tsx               ⚠️ 임시 캐릭터 프리뷰 (출시 전 삭제)
```

---

## 20. 절대 규칙 (CLAUDE.md + 팀 합의)

1. `lib/types.ts` 수정 → **PR + 성준 리뷰 필수**
2. `supabase/migrations/` 신규 추가 → **상대방 확인 없이 main 머지 금지**
3. `main` 브랜치 직접 push **금지**
4. `docs/engineering/INTERFACE_CONTRACT.md` 정의된 타입/컬럼명 임의 변경 **금지**
5. `appearance_score_raw` 외부 노출 **금지** (appearance_scores 테이블 내부만)
6. 매칭 엔진 내부값 (`score_breakdown`, `batch_id`, `is_forced`) 사용자 노출 **금지**
7. bypass guard 패턴 없이 RLS 테이블 직접 INSERT/UPDATE **금지**

---

## 21. 다음 작업자 체크리스트

### 즉시 해야 할 것 (z47 미커밋 해결)

```bash
# 1. 아래 파일들이 워킹트리에 있음 (이미 작성 완료)
#    supabase/migrations/20260522_z47_invert_beg_policy.sql
#    app/match/[id]/continuation/page.tsx (z47 UX)
#    app/match/[id]/refund/page.tsx (산지니 구걸 UX)
#    app/api/match-pool/stats/route.ts (lib 분리)
#    app/page.tsx (import 수정)
#    lib/match-pool-stats.ts (신규)
#    components/SanjiCharacter.tsx (신규)

# 2. 커밋
git add supabase/migrations/20260522_z47_invert_beg_policy.sql \
        app/match/id/continuation/page.tsx \
        app/match/id/refund/page.tsx \
        app/api/match-pool/stats/route.ts \
        app/page.tsx \
        lib/match-pool-stats.ts \
        components/SanjiCharacter.tsx
git commit -m "feat(refund,ux): 구걸 UX 정책 반전 + 산지니 캐릭터 (z47, 결정 8-26)"

# 3. 임시 프리뷰 페이지 삭제 (출시 전)
# app/debug/sanji/ 는 출시 전 삭제할 것
```

### v1 출시 차단 3개 (§16)

1. **Task F** (성준): Python 헝가리안 매칭 엔진 → matches row 생성
2. **토스 실결제** (충현): 콘솔 가입 → sandbox 키 → webhook 구현
3. **Fresh DB 실 검증** (충현): Supabase CLI 또는 SQL Editor 로 마이그 적용

### v1.1 백로그 우선순위

1. `/admin/*` 페이지 (z44 인프라 위에 구현)
2. pg_cron 등록 (expire_*, enqueue_meeting_reminders, batch_finalize_no_shows)
3. SMS/push 외부 알림 통합
4. previously_matched 자동 excluded_pairs 트리거

---

*이 문서가 진실의 출처(source of truth). 코드와 불일치 발견 시 코드 기준으로 갱신.*

---

## 22. Codex 업데이트 - 소셜 로그인 + 부산대 메일 인증 (2026-05-23)

**작성자: Codex**

### 변경 요약

- 로그인 화면에 Kakao OAuth, Google OAuth 진입 버튼 추가.
- Supabase OAuth 콜백 라우트 추가: `app/auth/callback/route.ts`.
- 학교 구성원 인증 게이트 추가: `app/profile/school/page.tsx`.
- 인증 후 온보딩 순서 변경: 로그인 -> 부산대 메일 인증 -> 기본 정보 -> 기존 프로필 6단계.
- `middleware.ts`에서 `/profile`, `/group`, `/match`, `/friends`, `/notifications` 접근 시 부산대 메일 미인증 사용자를 `/profile/school`로 리다이렉트.
- `public.users`에 학교 인증 필드 추가:
  - `email`
  - `school_email`
  - `school_email_verified_at`
- 신규 인증 코드 테이블 및 RPC 추가:
  - `school_email_verification_codes`
  - `request_school_email_verification`
  - `verify_school_email_code`
- 신규 마이그레이션: `supabase/migrations/20260523_z48_social_login_school_email_verification.sql`.
- 신규 테스트:
  - `tests/auth/school-email.test.ts`
  - `tsconfig.auth-tests.json`
  - `npm run test:auth`

### 인증 정책

- Kakao/Google은 로그인 수단이다.
- 부산대 메일 인증은 과팅 참여 자격 게이트다.
- 카카오/구글 개인 계정으로 로그인해도 `@pusan.ac.kr` 메일 인증 전에는 핵심 기능으로 들어갈 수 없다.

### 로컬 개발 동작

- `/profile/school`에서 `@pusan.ac.kr` 메일 입력 후 인증번호를 요청하면 로컬 개발용 코드가 화면에 표시된다.
- 이 로컬 코드는 실제 메일 발송이 아니라 개발 검증용이다.
- 프로덕션에서는 `SCHOOL_EMAIL_DEV_MODE=true`를 명시하지 않는 한 `/api/school-email/request`가 `email_delivery_not_configured`로 막힌다.
- 로컬 인증번호 저장에는 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`가 필요하다. 이 키는 브라우저에 노출하면 안 된다.
- 실제 배포 전에는 학교 메일 발송 provider 또는 Supabase 이메일 인증 정책을 확정해야 한다.

### Supabase 대시보드 설정 필요

- Authentication Providers에서 Kakao 활성화.
- Authentication Providers에서 Google 활성화.
- Kakao Developers에 Supabase callback URL 등록:
  - `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase Redirect URL allow list에 앱 콜백 등록:
  - Local: `http://localhost:3000/auth/callback`
  - Production: `https://<production-domain>/auth/callback`

### 검증 상태

- `npm run test:auth`: PASS.
- `npm run typecheck`: PASS.

---

## 23. Codex 업데이트 - v2 플랫폼 확장 계획서 (2026-05-23)

**작성자: Codex**

새 계획서: `docs/PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md`

핵심 정정:

- 부산대 메일 인증은 앱 전체 진입 조건이 아니라 **과팅 모드 참여 조건**이다.
- 향후 1:1 소개팅, 커뮤니티, 동아리 모집 기능은 별도 eligibility 정책을 가져야 한다.
- 현재 구현된 전역 학교 인증 리다이렉트는 v2 계획 기준으로 수정 대상이다.

v2 주요 축:

- 모드 기반 앱 구조: `group_blind_date`, `one_on_one_date`, `community`, `club_recruiting`, `battle_mode`.
- 모든 데이팅/만남/배틀 기능은 20세 이상만 허용.
- completed 후속 흐름은 `Continue` 정산과 `End` 알림으로 분리하고, 재매칭 중독을 막는 cooldown을 둔다.
- 키/성격/외모를 결합한 `perceivedImpressionVector`를 도입해 실제 인상에 가까운 매칭 점수를 만든다.
- 장소 후보 3개 추천을 매칭 결과에 붙인다.
- 술배틀은 실제 음주량 경쟁이 아니라 안전한 술자리 게임/팀 배틀 모드로 설계한다.

### 2026-05-23 상세화 추가

**작성자: Codex**

`docs/PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md`에 구현 상세 섹션을 추가했다.

추가된 핵심:

- 내 이해도 점검: 앱 정체성, 인증 정책, 과팅 UX, 인상 벡터, 배틀 모드 해석.
- 구현 아키텍처: `mode`, `eligibility`, `verification`, `matching policy` 중심 구조.
- 파일 책임 분리: `lib/modes/*`, `lib/auth/adult.ts`, `lib/matching/height.ts`, `lib/matching/impression.ts`, `lib/matching/venue-recommendation.ts`, `lib/battle/rating.ts`.
- Phase 0~7 세부 구현 순서와 수정 파일.
- 학교 인증 전역 게이트 제거와 과팅 전용 eligibility 이전을 최우선 구현으로 지정.
- 성인 게이트, Continue 정산/End 알림 후속 흐름, 장소 추천, 키/성격 인상 보정, 배틀 모드 DB/점수 설계.
- 테스트 전략과 구현 전 체크리스트.

### 2026-05-24 사용자 피드백 반영 정정

**작성자: Codex**

`docs/PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md`를 사용자 피드백 기준으로 다시 정정했다.

정정 내용:

- "과팅 라이트 모드"는 Codex가 임의로 넣은 확장 아이디어였으므로 계획서에서 삭제했다.
- `Continue` 제거/비활성화 방향을 폐기했다. `Continue`는 상대가 마음에 들 때 누르는 버튼이고, 누르면 보증금 20,000원 중 앱에게 줄 금액을 0원~20,000원 범위에서 고른다.
- 3,000원 이상은 그대로 정산하고 상대에게 금액 알림을 보내지 않는다.
- 3,000원 미만은 "3,000원만 주면 안돼?!?" 설득 모달을 거친다.
- 1,000원/2,000원은 "3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다" 안내 후 확정할 수 있다.
- 0원은 "그래도 0원 주겠습니까?" 재확인과 "상대방에게 매칭비로 0원을 지불했다는 사실이 알림으로 갑니다" 경고 후, 확정 시 상대 그룹에게 알림을 보낸다.
- 0원 경고 화면에는 사용자 성별 기준으로 상대가 삐진 반응 만화 컷을 보여준다.
- `End`는 이번 만남을 끝내는 선택이며 상대에게 중립적인 종료 알림을 보낸다.
- 앱이 일직선 온보딩으로 굳지 않도록, 사진 업데이트/AI 재평가/이상형 월드컵 재실행/성격 재실행을 프로필 편집 루프로 추가했다.
- 남성 20~39세 키 기준은 Size Korea 제8차 한국인 인체치수조사 기준 `mean=174.6cm`, `stdDev=약 5.7cm`로 잡았다. 190cm는 20대 표본 기준 P99에 가깝거나 그 이상이므로 하드코딩된 "98점"이 아니라 실제 percentile table 우선으로 계산한다.
- 술자리 게임 배틀 모드는 참여 전 위험 고지/책임 제한/20세 이상 확인 서약을 받는다. 단, 서약서가 앱의 법적 의무나 안전 조치 의무를 없애는 것은 아니라고 명시했다.

### 2026-05-24 성준 성격 벡터 통합

**작성자: Codex**

성준 자료 확인:

- `git fetch origin`으로 원격을 갱신했다.
- 성준 성격 설계는 현재 브랜치의 `docs/handoff/active/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`에 들어와 있다.
- `origin/main`, `origin/matching/group-engine`에는 해당 handoff 파일이 없고, 현재 작업 브랜치 `profile/post-worldcup-decisions-2026-05-21`에 포함된 상태다.

코드 반영:

- 신규 파일: `lib/matching/personality-preference.ts`
- 신규 테스트: `tests/matching/personality-preference.test.ts`
- 성준 방식의 `preferred_personality_vector`, `typeWeights`, primary/secondary 성격 유형 계산을 순수 함수로 추가했다.
- `emotional_stability = 1 - neuroticism`으로 공개 표현을 정리했다.
- 사용자 방식도 같이 반영했다. Big5 본인 성격에서 `cute`, `pure`, `chic`, `warm`, `stylish`, `healthy` 인상 prior를 만들 수 있게 했다.
- 즉, 성격은 두 갈래로 쓰인다.
  - 내가 끌리는 상대 성격: `preferred_personality_vector`
  - 내 성격이 남기는 실제 인상: `personalityImpressionPriorFromBig5`

검증:

- `npm run test:matching`: PASS, 14/14.

### 2026-05-24 앱 복구 및 Continue 정산 흐름 정정

**작성자: Codex**

복구/정정 내용:

- 학교 이메일 인증 게이트를 과팅 관련 경로(`/group`, `/match`)에만 적용하도록 수정했다. 1:1 소개팅, 커뮤니티, 프로필 편집까지 부산대 메일 인증으로 막지 않는다.
- 로컬 `.env.local`에 Supabase placeholder 값이 남아 있어 클라이언트 페이지가 터지던 문제를 수정했다. 개발 환경에서는 placeholder client로 UI를 띄우고, 프로덕션에서는 여전히 실제 환경변수 없으면 실패하게 둔다.
- `Continue` 후 정산 기준을 환불액이 아니라 `app_fee_amount`(앱에게 줄 금액)로 바로잡았다.
- 3,000원 이상은 그대로 정산하고 상대에게 금액 알림을 보내지 않는다.
- 3,000원 미만은 먼저 "3,000원만 주면 안돼?!?" 설득 모달을 보여준다.
- 1,000원/2,000원은 3,000원부터 금액 알림이 숨겨진다는 안내 후 확정할 수 있다.
- 0원은 재확인, 상대 0원 알림 경고, 삐진 반응 만화 컷을 거친 뒤 확정한다.
- `submit_refund_request` 쪽도 앱 수익 0원 확정 시 상대에게 `partner_paid_zero` 알림이 가도록 보강했다.

수정 파일:

- `middleware.ts`
- `lib/auth/school-email.ts`
- `lib/supabase.ts`
- `lib/refund/fee-flow.ts`
- `app/api/matches/[id]/refund/route.ts`
- `app/match/[id]/refund/page.tsx`
- `app/match/[id]/continuation/page.tsx`
- `supabase/migrations/20260522_z47_invert_beg_policy.sql`
- `tests/auth/school-email.test.ts`
- `tests/config/refund-fee-flow.test.ts`
- `tsconfig.config-tests.json`

검증:

- `npm run test:auth`: PASS, 4/4.
- `npm run test:config`: PASS, 8/8.
- `npm run test:matching`: PASS, 14/14.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.

### 2026-05-25 상대 성격 선호 벡터 UI 통합

**작성자: Codex**

성준 설계 통합 범위:

- 성준의 `preferred_personality_vector` 계산 로직을 실제 프로필 플로우 화면에 연결했다.
- 새 화면: `/profile/personality-preference`
- 기존 `/profile/survey`는 본인 Big5 성격 테스트로 유지하고, 완료 후 `/profile/personality-preference`로 이동한다.
- 새 화면은 "내 성격"이 아니라 "내가 끌리는 상대 성격"을 묻는다.
- 저장 payload는 성준 계약에 맞춰 아래 컬럼 구조로 만든다.
  - `preferred_personality_vector`
  - `preferred_personality_delta_vector`
  - `preferred_personality_type_weights`
  - `preferred_personality_primary_type`
  - `preferred_personality_secondary_type`
  - `personality_preference_answer_logs`
  - `personality_preference_confidence`
  - `personality_preference_completed_at`
- `preferred_personality_delta_vector`는 `preferred - self` 기준으로 계산한다. 본인 Big5가 없으면 중립값 0.5 기준을 사용한다.
- 결과 화면은 raw vector를 그대로 보여주지 않고, 사용자에게는 `primary/secondary` 성격 타입과 짧은 설명만 보여준다.
- 프로필 수정 화면에 `상대 성격 취향` 카드를 추가했다.
- 온보딩 진행바에 `상대성격` 단계를 추가했다.

수정 파일:

- `app/profile/personality-preference/page.tsx`
- `components/profile/PersonalityPreferenceSurvey.tsx`
- `components/profile/PersonalityPreferenceResult.tsx`
- `app/profile/survey/page.tsx`
- `app/profile/edit/page.tsx`
- `app/profile/complete/page.tsx`
- `components/profile/StepProgress.tsx`
- `lib/matching/personality-preference.ts`
- `lib/types.ts`
- `supabase/migrations/20260525_z49_preferred_personality_vector.sql`
- `tests/matching/personality-preference.test.ts`

검증:

- `npm run test:matching`: PASS, 15/15.
- `npm run typecheck`: PASS.
- HTTP 확인: `/profile/personality-preference`, `/profile/survey`, `/profile/edit` 모두 200.

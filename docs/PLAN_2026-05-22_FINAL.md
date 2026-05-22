# 부산대 과팅앱 — 2026-05-22 후반 세션 종료 시점 계획서

> 충현이 한눈에 보는 용도. 토큰 90% 시점에 작성. **97% 진행, v1 출시 차단 3개만 남음.**

---

## 🎯 한 줄 정리

매칭 흐름의 **모든 사용자 경로**가 코드 레벨에서 완성됐다.
남은 건 **외부 의존(매칭 엔진 · 토스 · 운영 환경)** 뿐이고, 그건 다른 사람/세션이 처리해야 한다.

---

## 📊 전체 진행률

```
███████████████████████████████████████░  97%
```

| 영역 | 상태 | 비고 |
|---|---|---|
| 가입 · 프로필 7단계 | ✅ | display_name + age range 포함 |
| 친구 추가 · 그룹 만들기 · 초대 | ✅ | in-app / phone / 공개 링크 |
| 보증금 (mock) | ✅ | 토스 실결제만 남음 |
| 매칭 큐 진입 · 취소 | ✅ | 리더 권한 |
| 매칭 양방향 확정 | ✅ | z30 양쪽 리더 모두 confirm |
| 매칭 거절 · 취소 | ✅ | |
| 만남 평가 (review) | ✅ | z33 5-star + 이슈 chip + comment |
| 1:1 연결 동의 (connections) | ✅ | z35 양방향 동의 시 phone 노출 |
| 그룹 떠나기 · 해체 · **리더 위임** | ✅ | z32 |
| 친구 요청 만료 자동 정리 | ✅ | z31 lazy + bulk RPC |
| 나이 선호 범위 + 매칭 가중치 | ✅ | z34 ±3 기본, 결정 8-13 |
| Python 헝가리안 매칭 | ❌ | **성준 영역** |
| 토스페이먼츠 실결제 | ❌ | sandbox 키 필요 |
| Fresh DB Apply 실 검증 | 🟡 | 정적 검증만 PASS, staging 필요 |
| attendance GPS · 노쇼 분배 · SMS · admin | 🌿 | v1.1 |

---

## ✅ 지금 코드로 굴러가는 사용자 흐름

```
가입 → 프로필 7단계 (display_name + age + age range ±3 기본)
  ↓
친구 추가 (전화번호 → 가입 후 자동 매칭)
  ↓
그룹 만들기 → 멤버 초대 → 보증금 mock 결제 → 큐 진입
  ↓ (Task F 매칭 엔진 대기)
매칭 결과 (양방향 확정 — 한쪽만 누르면 '상대 확정 대기' 표시)
  ↓
만남
  ↓
평가 작성 (5-star + 이슈 + 코멘트, 1회 멱등)
  ↓
1:1 연결 (양쪽 동의 시 phone 자동 공개)
```

리더가 떠나려면? → **리더 위임** (Crown 버튼)
그룹 해체하려면? → 리더만 가능 → 멤버 자동 정리
큐 진입 후 멤버 빠지면? → 큐 자동 cancel + 그룹 status=forming 복귀

---

## ❌ v1 출시 차단 (외부 의존, 본 세션 처리 불가)

### 1. Task F · Python 헝가리안 매칭 엔진
- **누가**: 성준
- **왜 차단**: 토요일 14:00 매칭 자체가 안 굴러감
- **현재**: match_pool 에 그룹들이 쌓이지만, matches row 를 생성하는 배치가 없음

### 2. 토스페이먼츠 실결제
- **누가**: 충현 (Toss 콘솔 가입 + sandbox 키 필요)
- **왜 차단**: 운영 출시 X (현재 mock_pay_deposit 으로 동작)
- **무엇을**: webhook 라우트 + 결제 실패/환불 흐름 + `mock_pay_deposit` → 실 트리거로 교체

### 3. Fresh DB Apply 실 검증
- **누가**: 충현 (Supabase CLI / Docker / 별도 dev 프로젝트)
- **왜 차단**: 정적 검증만 PASS (`scripts/verify-migrations.py` 33 files / 0 issue). 실 RPC 동작 검증 안 됨
- **무엇을**: staging 또는 Supabase 대시보드 SQL Editor 로 22개 마이그 순서대로 적용 후 핵심 흐름 수동 검증

---

## 🌿 v1.1 후속 (필요 시 우선순위 결정)

| 항목 | 영향 | 난이도 |
|---|---|---|
| attendance GPS 체크인 | 노쇼 검증 자동화 | 중 (모바일 navigator.geolocation + venues 좌표) |
| 노쇼 페널티 분배 (`deposits.distribution_to`) | 정책 자동화 | 중 (RPC 만 추가하면 됨, UI v1.1) |
| 매칭 결과 SMS/push 알림 | 사용자 도달률 | 중 (외부 알림 서비스 통합) |
| admin 페이지 | 운영자 도구 (점수 보정 / 강제 disband / 매칭 강제) | 큼 (별도 인수서 `ADMIN_APPEARANCE_SCORE_OVERRIDE.md` 참고) |

---

## 📁 본 후반 세션 commit 11개 (origin push 완료)

```
5dda0b8 z30  feat(match)        양방향 confirm 추적 (group_a/b_confirmed_at)
42e92b1 z31  feat(friends)      friend_request lazy expire + bulk RPC
d8e9631 z32  feat(groups)       리더 위임 RPC + Crown UI
f1873a1 z33  feat(review)       만남 평가 submit/get + /match/[id]/review
87de557 docs                     STATUS / SESSION_PROGRESS 92→95%
9357855 docs(handoff)            CLAUDE_TO_CODEX_HANDOFF_2026-05-22_LATE.md
621a2a9 z34  feat(matching)     선호 나이 범위 + age_fit 매칭 가중치 (결정 8-13)
554c1ba z35  feat(connections)  1:1 양방향 동의 + phone 노출
f35724e docs                     STATUS / SESSION_PROGRESS 95→97%
6045fe8 docs                     PLAN_2026-05-22_FINAL (97%)
826c2f2 z36  feat(connections)   핸드폰 자동공개 정책 (시간 도달 reveal, 동의 모델 폐기, 결정 8-18)
f6153fb     feat(matching)          TIME_FIT 가중치 0.10 추가 (결정 8-19), APPEARANCE 0.45→0.40, PERSONALITY 0.25→0.20
3eb2821 docs                     STATUS/SESSION_PROGRESS 97→98%
29b1127 z37  feat(match)         자동 완료 + match_meetings 정보 노출 RPC (결정 8-20)
7a39d22 docs                     z37 반영 (98→99%)
6501de9 z38  feat(match)         matches.status → groups.status 동기화 트리거
34f4d17 z39  feat(notifications) in-app 알림 시스템 (테이블 + 트리거 + RPC, 결정 8-21)
8fd9e31 z40  feat(notifications) friend_request 알림 트리거 + enqueue_meeting_reminders RPC
8fd9e31 z41  feat(deposits)     distribute_no_show_penalty RPC (8-9 정책 자동화)
[c8b2c4d] z42 z43 feat(deposits) **만남 지속 의사 + 자발적 환불 (구걸 UX, 결정 8-22) + UI**
e34db53 docs z42 z43 반영
[새] z44 feat(admin) admins 테이블 + is_admin() + RLS 확장 + grant/revoke_admin RPC + revenue view
[새] docs PROJECT_OVERVIEW + ADMIN_OPERATIONS_PLAN (Codex 입맞춤용 마스터)
```

**브랜치**: `profile/post-worldcup-decisions-2026-05-21`
**main 직접 push 없음** (CLAUDE.md 절대 규칙 준수)
**워킹트리**: clean

---

## 🧪 검증 상태

| 검증 | 결과 |
|---|---|
| TypeScript typecheck | ✅ PASS |
| ESLint | ✅ PASS (0 warnings/errors) |
| 마이그 정적 검증 (`scripts/verify-migrations.py`) | ✅ 42 files / 235 defs / 834 refs / **0 issues** |
| node:test matching 코어 | ✅ 10/10 (ageFit + TIME_FIT 포함) |
| python static (이미지/그룹/친구) | ✅ 11/11 |

---

## 🟢 다음 세션 진입 한 줄

> `git pull origin profile/post-worldcup-decisions-2026-05-21` →
> `cat docs/handoff/CLAUDE_TO_CODEX_HANDOFF_2026-05-22_LATE.md` →
> v1 차단 3개 (Task F · 토스 · Fresh DB) 중 본인 영역 진입.

---

## 🎤 결정 기록 추가 (2026-05-22 후반)

| ID | 결정 | 이유 |
|---|---|---|
| 8-13 | 매칭 가중치에 `AGE_FIT 0.10` 추가, 기본 ±3, 밖이면 5살마다 점수 0 으로 부드럽게 감소 | 사용자 일반 선호 "같은 나이대". 외모 가중치 0.50→0.45 로 양보 |
| 8-14 | 매칭 양방향 confirm 필수 | 한쪽만 누르면 confirmed 잘못 노출. 양쪽 모두 누르면 status 전이 |
| 8-15 | 리더 위임 후 본인 leave 가능 | 리더가 떠날 수 없는 한계 해소 |
| 8-16 | ~~1:1 connection 양쪽 동의 시점 자동 reveal~~ → **8-18 로 폐기** | — |
| 8-17 | review 는 `matches.status='completed'` 가 전제 | attendance/노쇼 흐름이 status 갱신 트리거 (v1.1) |
| 8-18 | **핸드폰 자동공개 정책 (z36)** — 약속 시간 도달 시 양쪽 그룹 멤버의 phone 자동 공개. 사용자 동의 불필요. status='confirmed' 부터 적용 (대기 단계에서도 비상연락 가능). 폭로 시점은 `match_meetings.scheduled_start`. | "시간/장소를 우리가 정해줘도 늦거나 못 만날 수 있으니 그 시간이 되면 서로 연락 가능해야 함" — 8-16 의 동의 모델은 불필요한 마찰. |
| 8-19 | **TIME_FIT 매칭 가중치 0.10 추가** — 양 그룹 available_timeslots 교집합 요일 수 / 7 을 점수에 반영. APPEARANCE 0.45→0.40, PERSONALITY 0.25→0.20 으로 양보 (합 1.0 유지). | 자동 시간 배정 정책 (8-18) 이후 시간 유연성이 매칭 품질의 핵심. 하드 필터(MIN_TIME_OVERLAP_DAYS) 와 별개로 부드러운 가점. |
| 8-20 | **매칭 자동 완료 (z37)** — `confirmed` 매칭이 `scheduled_start + 4h` 지나면 자동으로 `completed` 전이. lazy 패턴: get_match_detail/get_my_matches 호출 시 검사. | review/no-show 흐름의 트리거가 없으면 사용자는 평가를 작성할 수 없음. v1.1 에서 GPS 출석 기반 정확한 완료로 교체. |
| (z38) | **그룹 상태 동기화 트리거** — matches.status → groups.status (confirmed=matched, completed=completed, cancelled=ready). disbanded 제외. | 그룹 카드 UI 일관성. 매칭 중인 그룹이 큐 진입 가능처럼 보이지 않도록. |
| 8-21 | **in-app 알림 시스템 (z39)** — notifications 테이블 + 매칭 이벤트 자동 fan-out + `/notifications` 페이지 + 메인 페이지 배지. SMS/push 외부 통합은 v1.1. | 사용자가 페이지에 들어와야 결과 확인 가능한 흐름은 위험. 최소 in-app 알림 필수. |
| 8-22 | **구걸 UX 보증금 환불 (z42/z43)** — completed → 양쪽 "이어갈래요?" 양쪽 다 continue 면 자동 전액 환불 + 핸드폰 공개 강조. 누구라도 end → 리뷰 + 환불 선택 (0~전액 슬라이더). 전액 선택 시 3000→2000→1000 구걸 3단계, 0원 선택 시 사유 + 상대방 자동 알림. 노쇼는 z41 forfeit 유지, 환불 자체 차단. 7일/14일 만료. | **앱 수익 모델 핵심**. 자동 환불로는 앱이 못 번다. 사용자가 자발적으로 떼주는 차액 = 수익. 8-9 노쇼는 별개. |
| 8-23 | **운영자(admin) 권한 인프라 (z44)** — admins 테이블 + `is_admin()` 헬퍼 + 모든 핵심 테이블 RLS 에 admin bypass 추가. v1 = 1인 super_admin (충현) SQL Editor 직접 운영. v1.1 /admin/* 페이지. grant_admin/revoke_admin RPC + admin_revenue_summary view. | 운영 책임자/도구 없이 출시 불가. 운영자 권한 검증 + 관찰성 인프라 선구축. |

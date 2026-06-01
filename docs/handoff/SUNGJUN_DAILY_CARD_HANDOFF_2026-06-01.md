# 성준 인수인계서 — 데일리카드 (Daily Card) 매칭 연동

> **작성일**: 2026-06-01 · 작성자: 충현 (Claude Code 세션)
> **받는 사람**: 성준 (그룹/매칭 엔진 + 매칭 풀 흐름 담당)
> **목적**: 데일리카드 기능이 **성준 영역(매칭 풀 진입 / 매칭 confirm / match_meetings)** 과 만나는 지점을 합의하기 위한 인수서.
> **상태**: 스펙 초안만 존재, **코드 0줄**. 이 문서로 경계를 먼저 합의한 뒤 z50 마이그 착수.
> **원본 스펙**: `docs/DAILY_CARD_SPEC_2026-05-28.md` (전체 설계 — 먼저 통독 권장)

---

## 0. 30초 요약

매칭 확정일 ~ 만남일 사이 **5~7일 공백**을 "기대감 빌드업 구간"으로 바꾸는 기능.
대화는 여전히 차단(프로필 비공개 원칙 유지)하되, **시스템이 큐레이션한 취향 카드를 매일 09:00 한 장씩 단방향 공개**한다.

- 트랙 1: **취향 카드** (D-6~D-2, 풀에서 5장 랜덤) → D-1 이상형 카드(클라이맥스) → D-0 장소/시간
- 트랙 2: **협동 활동** (매칭당 1개, MVP는 ⚖️ 밸런스 게임 단독)

**충현이 만들 것** = 카드 콘텐츠/공개/협동 활동 (프로필 부속).
**성준에게 필요한 것** = 이 기능이 네 매칭 흐름 3곳에 훅을 건다. 그 3곳을 합의하자. (§2)

---

## 1. 이 문서를 왜 받았나

데일리카드의 **데이터 생애주기 전체가 매칭 타임라인에 매달려 있다**:

```
[그룹 매칭 풀 진입]  ──→  카드 콘텐츠 강제 입력 게이트가 여기 붙는다  (성준: 보증금/ready 흐름)
        ↓
[매칭 confirm 토 21:00] ─→ assign_daily_cards() / assign_coop_activity() 트리거  (성준: confirm 시점)
        ↓
[D-6 ~ D-0 매일 09:00] ─→ reveal cron + 푸시          (충현: 독립)
        ↓
[D-0 = 만남일]        ──→ reveal 시각 계산이 match_meetings.scheduled_start 기준  (성준: 약속 시간)
```

→ **성준 영역을 건드리지 않고는 못 만든다.** 그래서 합의가 선행.

---

## 2. 성준 영역과 만나는 3개 접점 (핵심)

### 접점 A — 매칭 풀 진입 시 "카드 콘텐츠 강제 입력 게이트"

데일리카드 스펙 §4 결정: **매칭 풀에 들어가기 직전(= 보증금 결제 단계)에 카드 콘텐츠 전부 강제 입력.**
누락 시 그룹 `ready` 진입 불가 = 매칭 자체가 안 됨.

- 현재 흐름(CODEX_MASTER §6): `group/create` → 전원 보증금 결제 → 리더가 "매칭 큐 진입" → `groups.status='ready'` + `enter_match_pool` RPC
- **충현 제안**: `enter_match_pool` RPC 내부(또는 그 앞단 클라이언트 가드)에 "카드 콘텐츠 완료 여부" 체크 추가
- **성준 결정 필요**:
  - (a) 체크를 `enter_match_pool` RPC 안에 넣을까(서버 강제), 아니면 (b) 진입 버튼 활성화 조건(클라 가드)으로만 둘까?
  - 충현 권장 = **(a) 서버 강제** (클라 우회 방지). 이 경우 충현이 `user_daily_card_content` 채움 여부를 검사하는 헬퍼 함수를 제공하고, 성준은 `enter_match_pool`에서 그걸 호출만 하면 됨.
  - 강제 입력 항목: 풀 A 4장 전부 + 풀 B 최소 4장 (스펙 §4)

### 접점 B — 매칭 confirm 시 카드/활동 추첨 트리거

매칭이 `pending → confirmed`(양방향 confirm 완료, z30) 되는 순간 두 RPC를 호출해야 함:

- `assign_daily_cards(match_id)` — 풀 A 3 + 풀 B 2 추첨 → `match_daily_card_schedule` 7행 INSERT
- `assign_coop_activity(match_id)` — 활동 1개 균등 추첨 → `match_coop_activity` 1행 INSERT

- **충현이 작성** = 이 두 RPC 본체.
- **성준 결정 필요**: 호출 위치. 두 가지 안:
  - (a) 충현이 `matches.status` confirmed 전이 트리거(z30/z38 라인)에 `assign_*` 호출을 **얹는다** → 성준 코드 수정 최소, 단 성준 트리거를 충현이 건드림 (리뷰 필요)
  - (b) 성준의 `confirm_match` RPC 말미에서 충현 RPC를 호출 → 명시적, 성준이 한 줄 추가
  - 충현 권장 = **(a)**, 단 트리거 변경이므로 성준 리뷰 필수 (CLAUDE.md 절대규칙). z38이 이미 `matches.status → groups.status` 동기화 트리거라 같은 자리에 얹기 깔끔.

### 접점 C — reveal 시각 계산이 match_meetings에 의존

스펙 §5: `reveal_at = meeting.scheduled_start - day_offset*1d` (09:00 정렬).

- D-day = `match_meetings.scheduled_start` 의 날짜.
- **즉 데일리카드는 `match_meetings.scheduled_start`가 confirm 시점에 이미 확정돼 있어야 함.**
- **성준 확인 필요**: 현재 흐름에서 `match_meetings` row(= 약속 시간/장소)는 **언제 생성**되나?
  - confirm **이전**(매칭 배치가 venue/time까지 같이 잡음)이면 → 문제 없음, 접점 B에서 바로 스케줄 INSERT 가능.
  - confirm **이후**(나중에 따로 venue 배정)이면 → `assign_daily_cards`를 venue 확정 시점으로 미뤄야 함. 이 경우 추첨 트리거를 confirm이 아니라 **meeting 생성 시점**으로 옮겨야 한다. ← 이게 제일 중요한 확인 포인트.

> CODEX_MASTER §8 기준 `match_meetings(match_id, venue_id, scheduled_start, ...)` 는 성준 영역(다른 브랜치 `origin/matching/group-engine`). 충현은 z37에서 `to_regclass` 동적 SQL로 우회 참조만 하고 있음. 데일리카드는 이걸 **필수 의존**으로 쓰므로 스키마/생성시점을 성준이 확정해줘야 함.

---

## 3. 성준이 결정/확인해줘야 할 것 (체크리스트)

| # | 항목 | 누구 영역 | 충현 권장 |
|---|---|---|---|
| 1 | 강제 입력 게이트를 `enter_match_pool` 서버 강제로 넣을지 | 성준 RPC | ✅ 서버 강제 (a) |
| 2 | 추첨 트리거를 confirm 트리거에 얹을지 / `confirm_match` 말미 호출인지 | 성준 트리거/RPC | ✅ confirm 트리거에 얹기 (a) |
| 3 | **`match_meetings.scheduled_start`가 confirm 시점에 확정돼 있나?** | 성준 | 확정돼 있어야 함. 아니면 트리거 시점 변경 |
| 4 | 노쇼 finalize(z45) 이후 잔여 카드 reveal 중단 — 충현이 처리하되, 노쇼 상태 플래그를 어디서 읽을지 | 공유 | `finalize_no_show`가 남기는 status 재사용 |
| 5 | 카드/활동 추첨 가중치 운영 조정을 admin(z44)에서 할지 | 공유 | v1.1로 미룸, MVP는 하드코딩 균등 |

---

## 4. 충현이 만들 것 (성준 영역 침범 없음, 참고용)

성준이 손댈 필요 **없는** 부분. 경계 확인용으로만.

- 새 마이그 `z50_daily_cards` — 테이블 4개:
  - `user_daily_card_content` (프로필 부속, key-value)
  - `match_daily_card_schedule` (매칭당 7행, 멱등 reveal)
  - `match_coop_activity` (매칭당 1행)
  - `match_coop_contribution` (일별 기여 로그)
  - + `balance_question_pool` (밸런스 게임 문항, admin 큐레이션)
- API: `/api/profile/daily-card`, `/api/match/[id]/daily-cards`, `/api/match/[id]/coop/*`
- UI: `/match/[id]` 페이지 안 카드 캐러셀 영역, 결제 직전 카드 작성 모달
- D-1 이상형 카드: 이미 모은 `preferred_bucket_weights`(z49)만 가공, raw vector 비노출
- reveal cron `reveal_due_daily_cards` + 푸시
- 자유입력 금칙어 필터 (전화번호/카톡ID/`@pusan.ac.kr`/학과명/SNS핸들 차단)

> 단, 위 테이블들이 `matches`, `match_meetings`, `auth.users`를 FK로 참조하고 RLS bypass guard 패턴(CODEX_MASTER §10)을 새로 추가하므로, **마이그 PR은 성준 리뷰 받고 머지** (CLAUDE.md 절대규칙 2).

---

## 5. MVP 범위 합의 제안

스펙 §10 Open Question 기준, 충현 제안 = **1차 출시는 다음만**:

- ✅ 취향 카드 트랙 전체 (D-6~D-2 랜덤 + D-1 이상형 + D-0 장소)
- ✅ 협동 활동 = **⚖️ 밸런스 게임 단독** (구현 부담 최저 + 한국적 후크 최강 + 식별누출 0)
  - 비동기 디폴트 + 양쪽 온라인 시 LIVE 모드 자동 전환(Supabase Realtime presence)
- ⏸ 나머지 활동 5종(스케치/별자리/플레이리스트/씨앗/이모지빙고) = 2차, 밸런스 게임 데이터 보고 확장
- ⏸ 추첨 가중치 admin 조정 = v1.1

성준 동의하면 충현이 z50을 **밸런스 게임 + 취향 카드만** 범위로 좁혀서 작성.

---

## 6. 의존성 — 데일리카드 착수 전 선행 조건

1. **z47~z49 워킹트리 미커밋 정리** (현재 18개 파일 커밋 대기, CODEX_MASTER §21). 데일리카드는 z49 `preferred_bucket_weights`를 D-1 카드에서 재활용하므로 z49가 머지돼 있어야 함.
2. **접점 C 확인** (§2-C): `match_meetings` 생성 시점. 이게 안 풀리면 추첨 트리거 위치를 못 정함.
3. 위 §3 체크리스트 1~3번 성준 회신.

---

## 7. 성준 회신 요청 (이 3개만 답해주면 충현이 z50 착수)

1. **`match_meetings.scheduled_start`는 매칭 confirm 시점에 이미 확정돼 있나?** (Yes/No, No면 언제 확정되나)
2. **강제 입력 게이트를 `enter_match_pool` RPC 서버 강제로 넣어도 되나?** (충현이 검사 헬퍼 제공)
3. **confirm 트리거에 `assign_daily_cards`/`assign_coop_activity` 호출을 얹어도 되나?** (트리거 변경 → 너 리뷰 받음)

---

## 8. 참조 문서

| 문서 | 용도 |
|---|---|
| `docs/DAILY_CARD_SPEC_2026-05-28.md` | 데일리카드 전체 설계 (이 인수서의 원본) |
| `docs/CODEX_MASTER_2026-05-23.md` | 프로젝트 전체 마스터 (§3 진행률, §8 데이터모델, §10 bypass guard, §17 인터페이스 계약) |
| `docs/INTERFACE_CONTRACT.md` | 충현/성준 경계 (필독) |
| `lib/types.ts` L41~66 | `PreferredAppearance`/`PreferredPersonality` — D-1 카드 데이터 출처 |
| `supabase/migrations/20260525_z49_preferred_personality_vector.sql` | z49 — D-1 카드가 재활용하는 선호 벡터 |

---

*경계 합의 문서. 코드 착수 전 §7 3문항 회신이 게이트.*

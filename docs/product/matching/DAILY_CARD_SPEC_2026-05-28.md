# 데일리카드 (Daily Card) — 매칭 후 ~ 만남 전 공백기 설계

> 2026-06-12 결정: 이 문서의 `매일 09:00 자동 공개` 기준은 오래된 초안이다. 현재 기준은 `16:00-20:00 사이 사용자가 직접 하루 카드 한 장을 뽑는 방식`이다. 구현 기준은 `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`과 `docs/plans/2026-06-12-thread-context-consolidated-audit.md`를 따른다.

> **작성일**: 2026-05-28 · 작성자: 충현 (Claude Code 세션)
> **상태**: 스펙 초안 (코드 미작성). 후속 마이그 후보 = `z50_daily_cards`
> **읽기 전 권장**: `docs/CODEX_MASTER_2026-05-23.md` §3 (현재 진행률), `lib/types.ts` L41~66 (`PreferredAppearance` / `PreferredPersonality`)

---

## 1. 풀려는 문제

매칭 확정일과 실제 만남일 사이가 **5~7일 비어 있다**.

```
[토] 매칭 확정 ─ 일 ─ 월 ─ 화 ─ 수 ─ [목/금] 만남
       ↑                                  ↑
       흥분 정점                          정 식어서 노쇼/잠수 리스크
```

이 공백 동안 두 그룹은 **대화를 못 한다** (프로필 비공개 원칙 유지).
결과적으로:

- 매칭 직후의 기대감이 7일 동안 자연 감쇠
- 앱에 들어올 이유가 없음 → 리텐션 끊김
- 만남 직전 "이거 진짜 가는 거 맞나" 회의감 → 노쇼/잠수 증가
- 보증금 락인은 있지만 **감정적 락인이 없다**

## 2. 해결 컨셉

**매일 한 장씩, 상대 그룹에 대한 "취향 카드" 공개.**

- 대화는 여전히 차단 (프로필 비공개 원칙 깨지 않음)
- 정보는 **시스템이 큐레이션해서 단방향 공개** → 사용자가 메시지를 만들 여지 0
- 가벼운 것 → 진한 것으로 점층, **D-1은 클라이맥스 카드**
- 매일 푸시 알림 → 앱 재방문 트리거
- 두 그룹 모두 매일 카드 받음 (대칭)

핵심 효과 = **공백을 "기대감 빌드업 구간"으로 전환**. 매일 들어오는 이유가 생긴다.

## 3. 카드 순서 (D-6 → D-1)

만남일을 D-day로, 매칭 확정 다음 날부터 D-1까지 매일 09:00에 새 카드 1장이 열린다.

**카드 트랙은 두 줄로 평행 진행된다**:
- **취향 카드 트랙** — 풀에서 랜덤 N장 선정 (매칭마다 조합이 다름)
- **협동 활동 트랙** — D-6~D-1 매일 한 번씩 함께 한 액션을 추가하는 **하나의 활동**

### 3.1 취향 카드 풀 (랜덤 선정)

전체 매칭이 동일한 카드 순서를 받으면 재미가 없다 → **매칭마다 풀에서 무작위로 5장 추첨**.
같은 매칭 안의 두 그룹은 동일한 카드 순서를 본다 (대칭).

| 카드 | 입력 방식 | 식별 위험 | 풀 분류 |
|---|---|---|---|
| 🎵 좋아하는 노래 3곡 | 자유 입력 (제목+아티스트) | 낮음 | **풀 A (고정 후보, 인기 카드)** |
| 🍜 좋아하는 음식 3개 | 시스템 선택지 (한식/일식/양식/...) | 없음 | 풀 A |
| 🎬 인생 영화 1편 | 자유 입력 (제목) | 낮음 | 풀 A |
| 💬 MBTI + 한 줄 소개 | MBTI 선택 + 자유 50자 | 중간 (검열) | 풀 A |
| 🍰 인생 디저트 | 자유 입력 (이름) | 낮음 | 풀 B (보조) |
| ✈️ 가장 기억나는 여행지 | 자유 입력 (지역명) | 낮음 | 풀 B |
| 🐶 좋아하는 동물 | 시스템 선택지 | 없음 | 풀 B |
| 🌸 가장 좋아하는 계절 + 이유 한 줄 | 선택지 + 자유 30자 | 낮음 | 풀 B |
| 🥤 카페에서 시키는 단골 음료 | 자유 입력 (음료명) | 없음 | 풀 B |
| 🎮 요즘 빠진 거 한 가지 | 자유 입력 (취미·게임·드라마 등) | 낮음 | 풀 B |

선정 규칙 초안:
- **풀 A에서 3장 + 풀 B에서 2장** 고정 추첨 (총 5장)
- **D-1은 항상 이상형 카드** (아래 §3.2)
- 추첨된 카드는 D-6~D-2 자리에 무작위 배정 (날짜 슬롯 자체도 셔플)
- 사용자가 입력하지 않은 풀 B 카드는 추첨 후보에서 제외

> 카페 분위기 카드는 풀에서 제외했음 (사용자 피드백). 카페 관련은 "단골 음료"로 대체.

### 3.2 D-1 / D-0 (고정)

| 일차 | 카드 | 출처 데이터 | 식별 위험 |
|---|---|---|---|
| **D-1** | 💘 **상대가 고른 이상형 타입** | `preferred_bucket_weights` 상위 1~2 + MI풀 대표 이미지 | 없음 |
| **D-0** | 🗺️ 만남 장소/시간 확정 안내 | 기존 `match_meetings` | — |

**D-1 카드가 클라이맥스.** 이미 z49까지 모은 이상형 월드컵 결과 (`preferred_appearance_vector`, `preferred_bucket_weights`) 를 그대로 재활용.

- 표시 예: *"상대 그룹의 OO 님은 **부드러운 분위기 (52%) / 시원한 분위기 (28%)** 를 선호해요"* + MI풀에서 해당 버킷 대표 이미지 1~2장
- raw vector는 절대 노출 안 함 — `preferred_bucket_weights` 만 사용 (lib/types.ts L51 "노출 가능" 마크 근거)
- 본인 외모와 상대 이상형의 일치도는 **표시하지 않는다** (자기검열·자기비하 유발 우려)

### 3.3 협동 활동 트랙 (매칭마다 1개 랜덤 배정)

> "대화는 못 하지만 같이 뭔가 한다"가 핵심. 메시지 채널을 절대 열지 않는다.

매칭 확정 시 활동 풀에서 **1개를 무작위 선정**해 7일 내내 진행. 매일 양쪽이 한 액션씩 기여하면 진행도가 차오르고, 만남 D-day에 완성물이 공개된다.

| 활동 | 매일의 액션 | 완성물 |
|---|---|---|
| 🎨 **공동 스케치** | 한 캔버스에 한 획씩 (그릴 영역은 도구 제약: 색·굵기 제한) | 7일 누적 그림 |
| ⭐ **별자리 만들기** | 매일 별 1개 좌표 찍기 → D-1에 선 자동 연결 | 우리 둘의 별자리 |
| 🎵 **공동 플레이리스트** | 매일 한 곡씩 추가 | 7곡 플레이리스트 (만남 당일 동시 재생 버튼) |
| 🌱 **씨앗 키우기** | 양쪽 모두 출석해야 단계 진행 | 만남일에 핀 꽃 (양쪽 출석률 = 꽃 등급) |
| ⚖️ **밸런스 게임 (실시간 모드 포함)** ⭐ | 매일 1~3문제, 둘 다 선택 후 동시 공개. 양쪽 온라인이면 LIVE 모드 자동 전환 | 7일 누적 일치율 + 결정적 순간 N개 |
| 🎯 **이모지 빙고** | 매일 오늘 기분 이모지 5개 선택 | 겹친 칸만 공개되는 빙고판 |

**선정 가중치**: 모두 균등 1/N 추첨 (운영 초반). 활동별 노쇼율/완주율 데이터 쌓이면 가중치 조정.

**비대화 보장**:
- 텍스트 입력 가능한 활동(스케치 제목, 플레이리스트 곡명 등)은 **풀 A 카드와 같은 금칙어 필터** 통과 필수
- 자유텍스트 게시 불가 — 좌표·선택·이모지 위주
- 한쪽이 미참여하면 진행도가 멈춤 → "상대가 오늘 별을 찍지 않았어요" 노출 (메시지 아님, 사실 노출)

**노쇼 방지 효과**: 완성물에 매일 본인 흔적이 누적될수록 만남에 가는 비용이 심리적으로 커진다 — 보증금 락인 + 감정 락인 + **공동 작품 락인** 삼중.

### 3.4 ⚖️ 밸런스 게임 상세 (MVP 1순위)

> 사용자 피드백 기반 핵심 후크: *"짜장 vs 짬뽕 / 부먹 vs 찍먹 같은 거를 실시간으로 같이 고르는 느낌"*

가장 한국적이고 가장 쉽게 통하는 활동. 운영 비용도 낮고 (문항 큐레이션만 하면 됨), 식별 누출 위험은 0 (옵션이 시스템 사전 정의 enum).

#### 메커니즘 — 비동기 디폴트 + LIVE 모드 자동 전환

```
[기본: 비동기 모드]
  매일 09:00 새 문제 1세트 (1~3문항) 오픈
  → 각자 시간 될 때 풀기
  → 한 명이 먼저 풀면 답은 봉인 ("상대 대기중")
  → 두 명 모두 풀면 동시 공개 + 일치 여부 애니메이션
  → 일치/불일치만 보여줌 (상대 선택 자체는 상대 그룹 모든 멤버 답 통계로만 노출)

[LIVE 모드: 양쪽 다 온라인]
  Supabase Realtime presence 채널이 양 그룹 멤버 동시 접속 감지
  → 화면 상단에 "지금 상대도 보고 있어요!" 배너 + LIVE 버튼
  → 누르면 3·2·1 카운트다운 → 동시 풀기 → 동시 공개
  → 일치 시 화면 폭죽 / 불일치 시 깜찍한 디스 ("어 이건 좀 의외인데")
```

비동기는 항상 가능, LIVE는 보너스. 양쪽 다 동시 접속해야만 작동하는 게 아니라 **운 좋게 만나면 보너스 경험**이 되는 구조. 동시 접속 의존 0.

#### 문항 풀 구조

```
카테고리 5개 × 일일 1~3문항 = 7일간 7~21문항
```

| 카테고리 | 예시 문항 |
|---|---|
| 🍜 **음식 클래식** | 짜장 vs 짬뽕 / 부먹 vs 찍먹 / 민초 vs 반민초 / 물복 vs 딱복 / 단탕수 vs 쌉탕수 |
| 🌊 **부산 로컬** | 광안리 vs 해운대 / 밀면 vs 돼지국밥 / 오리지널 부산어묵 vs 삼진어묵 / 송도 케이블카 vs 황령산 야경 |
| 💕 **데이트 취향** | 영화관 vs 카페 / 바다 vs 산 / 야경 vs 일출 / 한강 피크닉 vs 호캉스 |
| 🌙 **라이프스타일** | 아침형 vs 저녁형 / 강아지 vs 고양이 / 약속 5분 전 vs 정시 정각 / 계획형 vs 즉흥형 |
| 🎭 **약간 매운맛** | 결혼식 1차 vs 2차 / 첫데이트 풀코스 vs 가볍게 / 톡 빨리 vs 천천히 / 30분 늦은 사과 vs 안 늦은 무뚝뚝 |

운영자가 `admin` (z44 인프라) 에서 문항 큐레이션 + 비활성화 가능. A/B 테스트로 일치율 분포 보고 너무 한쪽으로 쏠리는 문항(예: 90% 동일 답) 제거.

문항 추첨 가중치 = `(카테고리 균등 분포) × (사용자가 최근 30일 안 본 문항 우선)`.

#### 결과 공개 디자인

- 매일 결과 카드: *"오늘 일치율 2/3 (67%)"* + 각 문항별 일치/불일치 아이콘
- 7일 누적 카드 (D-0 만남 직전 등장): *"우리 일치율 14/21 = 67%! '결정적 순간' 3개"*
  - **결정적 순간** = 일치율 50%에서 정확히 갈렸거나 (50/50 문항에서 동의), 한쪽 90% 우세 문항에서 둘 다 비주류 선택 → "둘만의 특이 취향" 강조
- 일치하지 않은 문항은 "상대 그룹 평균 답"만 공개 (개인 특정 X) → 식별 안전성 유지

#### DB / API 추가

`match_coop_activity.activity_kind='balance'` 인 경우 `state` 스키마:

```json
{
  "questions_by_day": {
    "-6": ["q_jjajang_jjamppong", "q_buk_jjik", "q_mincho"],
    "-5": ["q_morning_night", ...]
  },
  "answers": {
    "<user_id>": { "q_jjajang_jjamppong": "jjajang", ... }
  },
  "revealed_pairs": ["q_jjajang_jjamppong-(-6)", ...],
  "live_sessions": [
    { "day_offset": -4, "started_at": "...", "ended_at": "...", "questions_count": 3 }
  ]
}
```

새 테이블 `public.balance_question_pool` (운영자 큐레이션):

```sql
CREATE TABLE public.balance_question_pool (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL,         -- 'food_classic' | 'busan_local' | 'date' | 'lifestyle' | 'spicy'
  option_a    text NOT NULL,
  option_b    text NOT NULL,
  active      boolean DEFAULT true,
  created_by  uuid REFERENCES auth.users(id), -- admin
  created_at  timestamptz DEFAULT now()
);
```

API:
- `POST /api/match/[id]/coop/balance/answer` `{ question_id, choice: 'a'|'b' }` — 비동기 답변
- `GET /api/match/[id]/coop/balance` — 오늘 문항 + 내 답 + (양쪽 다 풀었으면) 공개 결과
- Realtime 채널: `match:{match_id}:balance` — presence + answered 이벤트 브로드캐스트 (LIVE 트리거)

#### 비대화 보장 — 이 활동 한정 추가 가드

- 자유텍스트 입력 0 (옵션은 전부 enum)
- LIVE 카운트다운/공개 시 표시되는 멘트는 시스템 고정 (사용자 입력 X)
- 일치 여부 외에 상대 개인을 특정할 수 있는 정보 노출 금지 — 결과 카드는 "상대 그룹의 N명 중 M명이 짜장" 형태로만

## 4. 강제 입력 게이트

> 결정: "매칭 확정 시 전부 강제 입력"

- 시점: 그룹이 매칭 풀에 들어가기 **직전** (보증금 결제 화면과 동일 단계)
- 누락 시 그룹 `ready` 상태 진입 불가 = 매칭 자체가 안 됨
- **풀 A 4장 전부 + 풀 B 중 최소 4장** 입력 강제 (= 추첨에 5장 들어갈 풀이 항상 확보됨)
- D-1·D-0 카드와 협동 활동 트랙은 시스템 자동
- 입력 시간 예상: 3~4분
- 이미 입력해둔 사용자는 **이전 매칭 카드를 재사용할지** 묻고 그대로 통과 가능 (UX 마찰 감소)
- 다만 매칭마다 추첨 결과는 다르므로 **사용자도 어떤 카드가 뽑힐지 미리 모름** → 재미 유지

## 5. DB 스키마 초안 (z50 후보)

```sql
-- 사용자별 카드 콘텐츠 (매칭과 무관, 프로필 부속)
-- key-value 형태로 카드 풀 확장 시 마이그 없이 추가 가능
CREATE TABLE public.user_daily_card_content (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  card_key   text,   -- 'songs' | 'food' | 'movie' | 'mbti_intro' | 'dessert' | 'travel' | 'animal' | 'season' | 'cafe_drink' | 'hobby'
  payload    jsonb,  -- 카드별 스키마 (별도 §A 참조)
  filled_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, card_key)
);

-- 매칭별 카드 공개 스케줄 (멱등 reveal). 매 매칭마다 row 7개 생성
CREATE TABLE public.match_daily_card_schedule (
  match_id    uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  day_offset  smallint,    -- -6 ~ 0
  card_key    text,        -- §3.1 풀 키 또는 'ideal' | 'venue'
  reveal_at   timestamptz, -- meeting.scheduled_start - day_offset*1d (09:00 정렬)
  revealed    boolean DEFAULT false,
  PRIMARY KEY (match_id, day_offset)
);

-- 협동 활동 (매칭당 1개)
CREATE TABLE public.match_coop_activity (
  match_id      uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  activity_kind text NOT NULL,  -- 'sketch' | 'constellation' | 'playlist' | 'seed' | 'balance' | 'emoji_bingo'
  state         jsonb NOT NULL, -- 활동별 누적 상태 (좌표·선택·곡 등)
  created_at    timestamptz DEFAULT now()
);

-- 협동 활동 일별 기여 로그 (멱등성·검증·노쇼 판정용)
CREATE TABLE public.match_coop_contribution (
  match_id    uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  day_offset  smallint,        -- -6 ~ -1
  action      jsonb NOT NULL,  -- 그날 그 사람이 한 단일 액션
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (match_id, user_id, day_offset)
);
```

**카드 추첨 RPC** = `public.assign_daily_cards(match_id)`. 매칭 confirm 트리거에서 호출.
- 풀 A에서 3장 + 풀 B에서 2장 무작위 선정
- 양쪽 그룹 모든 멤버가 해당 카드를 입력해 둔 경우만 후보 (입력 없는 카드는 자동 제외)
- 결과를 `match_daily_card_schedule` 에 INSERT (day_offset -6~-2)
- D-1(`ideal`), D-0(`venue`) 는 항상 동일

**활동 추첨 RPC** = `public.assign_coop_activity(match_id)`. 균등 1/N 추첨.

- 카드 공개는 **별도 cron job** (`reveal_due_daily_cards`) 가 `revealed=false AND reveal_at<=now()` 를 잡아 처리 + 푸시 발송
- RLS: 본인이 속한 매칭의 row + `revealed=true` 인 카드만 SELECT 가능
- 노쇼 finalize 이후 (`forfeited` / `no_show_finalized`) → 잔여 카드 reveal 중단

## 6. API 엔드포인트 초안

| 경로 | 메소드 | 용도 |
|---|---|---|
| `/api/profile/daily-card` | GET/PUT | 본인 카드 콘텐츠 (key 단위) 작성/수정 |
| `/api/match/[id]/daily-cards` | GET | 해당 매칭에서 공개된 카드 목록 (revealed=true 만) |
| `/api/match/[id]/daily-cards/[day_offset]` | GET | 단일 카드 상세 (D-1 이상형 카드는 상대 `preferred_bucket_weights` 가공) |
| `/api/match/[id]/coop` | GET | 협동 활동 상태 + 오늘 내가 액션 했는지 |
| `/api/match/[id]/coop/contribute` | POST | 오늘의 액션 1회 기록 (멱등, 하루 1회 한정) |

내부 RPC: `get_revealed_daily_cards(match_id)`, `mark_daily_card_revealed(match_id, day_offset)`, `contribute_coop(match_id, action)`.

## 7. UI 흐름

```
[그룹 결제 직전] → 데일리카드 작성 모달 (5장, 스텝 progress)
        ↓
[매칭 확정 토 21:00] → "내일 첫 카드가 열려요" 푸시
        ↓
[D-6 일 09:00] → "오늘의 카드: 🎵 좋아하는 노래" 푸시 → 앱 진입
        ↓ ... 매일 ...
[D-1 09:00] → "오늘의 카드: 💘 상대가 고른 이상형" 푸시 → 클라이맥스
        ↓
[D-0 09:00] → 장소·시간 확정 카드
```

- `/match/[id]` 페이지 안에 **카드 캐러셀** 영역 추가
- 잠긴 카드는 흐릿 + 자물쇠 + "D-3일 후 공개" 카운트다운
- 이미 공개된 카드 다시 보기 가능

## 8. 식별정보 누출 방지

- 자유 입력 필드 3개 (노래, 미디어 제목, 한 줄)는 **금칙어/패턴 필터** 통과 필수
  - 휴대폰 번호 패턴, 카톡 ID 패턴, `@pusan.ac.kr` 도메인, 학과명 ("경영학과"...), 학번 패턴
  - SNS 핸들 (`@xxx`, `instagram.com/...`), "DM 줘", "찾아봐" 등
- 위반 시 입력 거부 + 사유 표시 (사용자 학습)
- D-1 이상형 카드는 본인 사진 X, 이상형 카드 표시 이미지는 MI풀 (라이선스 정리 완료) 만 사용

## 9. 메트릭

이 기능이 효과 있는지 본다 = **공백기 리텐션 + 노쇼율**.

- 매칭 확정 ~ 만남일 사이 일평균 앱 진입률 (목표: 70%+)
- 카드 노출 → 30분 내 진입 비율
- 노쇼율 변화 (z45 GPS 노쇼 기준 데이터와 비교)
- D-1 이상형 카드 본 그룹의 만남 출석률

## 10. 추후 검토 (Open Questions)

- 카드를 **그룹 단위 공개**인지 **개인 단위 공개**인지: 현재 안은 그룹의 각 멤버 카드를 모두 공개 (1:1 매핑 X → 누가 누군지 매칭 불가 유지). 멤버 4명이면 카드도 4장 묶음.
- 한 줄 자기소개 50자가 너무 많다 / 적다 — 검열 부담과 표현력 trade-off
- 협동 활동도 **그룹 vs 개인** 단위 — 4명이 한 캔버스에 그리는지, 1:1 짝을 시스템이 임의로 묶는지. 후자면 짝 정보가 노출돼 위험 → **그룹 vs 그룹 단위** 가 안전
- 활동 6종 중 **첫 출시는 몇 개?** — 데이터 없이 출시하면 다 만들 비용. **MVP 1차는 ⚖️ 밸런스 게임 단독**으로 출시 권장 (구현 부담 가장 낮음 + 한국적 후크 가장 강함 + 데이터 쌓기 좋음). 1차 데이터 보고 2차에 별자리·플레이리스트 확장
- LIVE 모드 카운트다운 시간 — 3초가 적당한가 5초가 적당한가. 너무 짧으면 한쪽이 못 따라옴, 너무 길면 김 빠짐
- LIVE 일치 시 폭죽 vs 불일치 시 "어 의외인데" 멘트가 데이팅 톤에서 부담스럽지 않은지 사용자 테스트 필요
- 노쇼 finalize 이후 잔여 카드를 **이미 본 상대 입장에서는** 어떻게 회수할지 (UX 만 vs 데이터 hide)
- 매칭 풀에 다시 들어가는 사용자는 카드 재사용 vs 재작성 — §4 마지막 단락 참조
- 카드 추첨 시 **같은 카드 키가 매번 뽑힐 확률** — 한 사용자가 여러 번 매칭되면 매번 비슷한 카드만 뽑힐 수 있음. 가중치를 "최근 매칭에서 안 뽑힌 카드" 가산 방식으로 보정 검토
- 데이팅앱 본질을 해치지 않는지: "정보가 너무 많이 공개되어 만남이 김 빠진다" 리스크. → MBTI·이상형까지는 OK, 사진·실명은 절대 X. 만남 당일까지 **사진은 봉인** 원칙은 깨지 않는다.

## 11. 다음 단계 (코드 진입 전)

1. 위 카드 종류·순서·강제 입력 정책을 성준과 합의 (그가 매칭 풀 흐름 담당)
2. 자유 입력 검열 규칙 구체화 (테스트 케이스 10개 정도 미리 적기)
3. `preferred_bucket_weights` 버킷 이름 → 한국어 표시 매핑 테이블 정의 (D-1 카드 카피)
4. z50 마이그 작성 + `/api/profile/daily-card` PUT부터 구현
5. **그 전에 z47~z49 워킹트리 18개 미커밋 먼저 정리 권장** (`docs/CODEX_MASTER_2026-05-23.md` §3)

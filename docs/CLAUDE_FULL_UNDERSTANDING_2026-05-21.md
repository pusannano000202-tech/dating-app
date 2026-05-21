# Claude 가 이해하는 부산대 과팅앱 (Destiny) — 전체 정보

> 작성자: Claude (충현 세션)
> 작성일: 2026-05-21
> 목적: Codex 와 비교하여 두 AI 가 이 프로젝트를 동일하게 이해하고 있는지 점검
> 비교 대상: `docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md` (Codex 가 같은 형식으로 작성)
>
> 사용 방식: 동일 섹션 번호로 항목 매칭 → 다른 곳은 토론 → 합의된 항목은 SOURCE OF TRUTH 로 격상

---

## 0. 문서 사용 규칙

1. 이 문서는 **Claude (충현 세션) 가 알고 있는 모든 것** 을 적는다. 추측은 명시.
2. 섹션 번호는 절대 변경 금지. Codex 와 1:1 매칭용.
3. 사실 + 의견을 구분해서 적는다. 의견은 `※ 의견:` 으로 표기.
4. 모르는 것은 "모름" 또는 "추정"으로 정직하게 표기.

---

## 1. 프로젝트 정체성

### 1-1. 한 줄 정의

부산대학교에서 시작하는 **대학생 그룹미팅 매칭 앱**.

사용자가 친구와 그룹(2~3명)을 만들고 보증금을 걸면, 시스템이 상대 그룹·시간·장소를 자동 확정해 만남까지 이어준다. **프로필 비공개 자동확정 과팅 앱**.

### 1-2. 핵심 차별점 (다른 데이팅앱 대비)

| 일반 데이팅앱 | Destiny |
|---|---|
| 1:1 매칭 | 그룹 매칭 (친구끼리) |
| 무한 스와이프, 결정은 사용자 | 자동 확정, 사용자는 그룹과 보증금만 |
| 프로필 공개 | 만남 전까지 상대 비공개 |
| 무료 + 결제 유도 | 보증금 필수 (노쇼 페널티) |
| 매칭 즉시 | 주 1회 토요일 일괄 매칭 |
| 외모 점수 노출 | 모든 raw 값 비공개 |

### 1-3. 브랜드 아이덴티티

- **공식 명칭**: Destiny (운명)
- **컨셉**: Cosmic Fate & Red Thread (우주적 운명 + 동양의 붉은 실 설화)
- **타깃 사용자**: 부산대 20대 초반 학부생 (확장 시 부산권 대학가)

### 1-4. 비즈니스 모델

- 보증금 1인 2만원
- 노쇼/거짓말 시 보증금 → 출석자에게 균등 분배
- 만남 성공 시 보증금 환불
- ※ 의견: 운영 수익원이 명확하지 않음. 1차 출시는 사용자 확보 우선, 수익화는 향후 결정.

---

## 2. 팀 구성과 협업

### 2-1. 인간

| 이름 | 역할 |
|---|---|
| **충현** (사용자) | 프로필/외모 평가 모듈 담당. 이번에 매칭 시스템까지 인수. Claude Code 사용. |
| **성준** | 원래 그룹/매칭 엔진 담당. 현재는 venues/맛집 DB 에 집중. Codex + Claude Code 사용. Git author: `sj4505 <ansungjun1610@gmail.com>` |

### 2-2. AI

| 도구 | 역할 |
|---|---|
| **Claude (이 세션)** | 충현 영역 코딩 + 매칭 시스템 인수 작업 |
| **Codex** | 이미지 생성 (자기유사 64장, 이상형 128장), 다른 노트북에서 병렬 작업 |
| **Manus** | 디자인 시스템 (Cosmic Fate, Soul Orbs, 컬러 팔레트) |

### 2-3. 협업 채널

- `docs/handoff/CLAUDE_CODEX_BRIDGE.md` — Claude ↔ Codex 메시지 브리지
- `docs/handoff/CODEX_*.md` — Codex 에게 주는 인수인계 프롬프트들
- `docs/handoff/CLAUDE_*.md` — Claude 에게 주는 인수인계 프롬프트들
- `docs/COLLABORATION.md` — 협업 규칙 (충/성준)
- `docs/INTERFACE_CONTRACT.md` — 충/성준 영역 경계와 계약

### 2-4. 현재 분담 (2026-05-21 변경)

| 영역 | 담당 |
|---|---|
| `python/appearance/` (외모 AI) | 충현 |
| `python/matching/` (헝가리안 엔진) | **충현 (성준→충현 인수)** |
| `app/profile/`, `components/profile/` | 충현 |
| `app/group/`, `app/match/`, `components/matching/` | **충현 (인수)** |
| 매칭 핵심 테이블 (groups, matches, deposits 등) | **충현 (인수)** |
| `venues`, `match_meetings`, 부산대 맛집 seed | 성준 |
| 토스페이먼츠 결제 연동 | 충현 |
| 이미지 생성 (FI01~FI64, MI01~MI64) | Codex |
| 디자인 시스템 (Manus 가이드) | Manus → 충현 구현 |

---

## 3. 버전 히스토리

| 버전 | 일자 | 핵심 변경 |
|---|---|---|
| v1.0 | 2026-05 초 | 성준 원안: Big5 AI 인터뷰 기반 1:1 매칭 |
| v1.1 | 2026-05-13 | 외모 AI 도입, 보증금 시스템, 이상형 월드컵 |
| v1.2 | 2026-05-14 | 그룹미팅 중심으로 전환, INTERFACE_CONTRACT 체결 |
| v1.3 | 2026-05-15 | 실제 구현 현황 추적, 프론트 플로우 완성 확인 |
| v1.4 | 2026-05-15 | **앱명 Destiny 확정**, Soul Orbs 시각화, Manus 디자인 시스템 |
| v1.5 | 2026-05-18 | v1.1~v1.4 종합 정의서 |
| (작업 중) | 2026-05-21 | **매칭 시스템 충현 인수**, 주 1회 토요일 매칭 확정 |

기획 문서: `부산대_과팅앱_v1.5_정의서.md` (루트)

---

## 4. 브랜드 / 디자인

### 4-1. 컬러 팔레트

| 역할 | 이름 | HEX |
|---|---|---|
| 배경 | Midnight Deep | `#060612` |
| 주색 (바이올렛) | Royal Violet | `#7C3AED` |
| 보조색 (로즈) | Deep Rose | `#BE185D` |
| 강조 (골드) | Amber Gold | `#F59E0B` |
| 여성 오브 | Rose Light | `#F472B6` |
| 남성 오브 | Violet Light | `#A78BFA` |

### 4-2. 타이포그래피

- **브랜드 타이틀**: Playfair Display (serif) — `.font-destiny` 클래스
- **본문**: Pretendard Variable + 시스템 sans
- **그라디언트 텍스트**: `.gradient-fate-text` (rose → fuchsia → violet)

### 4-3. UI 컴포넌트

- **글래스모피즘**: `.glass`, `.glass-strong`, `.glass-card`
- **그라디언트 버튼**: `.btn-gradient` (violet → fuchsia)
- **Soul Orbs** (랜딩): 10개 오브(여 5 + 남 5), 레이더 필드, 카운터, 실시간 뱃지
- **Lucide 아이콘**: 이모지 사용 금지. Palette / ClipboardCheck / Zap / Heart / Waves 등
- **DestinyLogo SVG**: 버터플라이 오빗 + 4각별 + 그라디언트

### 4-4. 카피 톤

- "당신의 인연이 여기서 시작됩니다"
- "어떤 사람이 더 끌려?" (월드컵)
- "직관적으로 골라봐"
- "당신의 인연이 완성되었습니다"

---

## 5. 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Vercel 배포 예정 |
| UI | Tailwind CSS + Lucide React | |
| 폰트 | Playfair Display + Pretendard Variable | |
| Auth | Supabase Auth | 휴대폰 OTP |
| DB | Supabase Postgres | RLS 적용 |
| Storage | Supabase Storage (photos 버킷) | public read |
| 외모 AI | **GPT Vision API** (v1.5 전환) | 기존 ResNet50+SCUT-FBP5500 은 deprecated 의심 |
| 매칭 엔진 | Python + scipy `linear_sum_assignment` | python/matching/ 미구현 |
| 결제 | 토스페이먼츠 | 미연동 |
| 이미지 생성 | Codex (GPT-image / DALL-E 등) | 외부 도구 |
| 디자인 | Manus | 외부 도구 |
| 배포 | Vercel (Next.js) + 별도 Python 서버 | |
| 알림 | PWA Push + 이메일 | 8-12 결정 |

---

## 6. 사용자 흐름

### 6-1. 신규 사용자 가입 → 첫 매칭까지

```
1. /login                       (휴대폰 OTP)
2. /profile/worldcup            (이상형 월드컵, 이성 64강) ← measured 기반
3. /profile/self-worldcup       (자기유사 월드컵, 동성 8강) → self_appearance_score
4. /profile/basic               (성별/나이/키/체형/머리숱/학교/학과/학년)
5. /profile/photos              (사진 3장 업로드, GPT Vision 분석)
6. /profile/survey              (Big5 성격 테스트, 5트레이트 × 2질문)
7. /profile/schedule            (요일별 가능 토글)
8. /profile/preferences         (이상형 가중치 슬라이더, 합 100%)
9. /profile/complete            (완료, 카운트다운)
10. /group/create               (그룹 생성)
11. 친구 초대 (전화번호/링크)
12. 멤버 전원 보증금 결제
13. 매칭 풀 진입
14. (대기) 토요일 14:00 매칭 발표
15. 매칭 성사 시 /match/[id]    (시간/장소 비공개 카드)
16. 만남 당일 GPS 체크인
17. 만남 후 리뷰 + 연결 동의
```

### 6-2. 매칭 실패 흐름 (토요일)

```
[토 14:00 매칭 실패 알림]
   ├─ 옵션 1: Forced Match (threshold 0.30 으로 재시도)
   │   └─ [토 저녁 즉시 헝가리안 재실행]
   ├─ 옵션 2: 다음 주 매칭 풀로 이월
   │   └─ [일 00:00 자동 재진입, 보증금 hold 유지]
   └─ 옵션 3: 매칭 중단 + 보증금 환불

[일 06:00 응답 마감]
   └─ 미응답자는 자동 옵션 2 (이월)

[4주 연속 이월 시]
   └─ 자동 환불 + 매칭 풀 떠남
```

---

## 7. 외모 분석 시스템

### 7-1. 외모 절대점수 정의 — Source of Truth

**`public/appearance-self/SCORE_GUIDE.md` 가 single source of truth.** Codex 가 정한 백분위 정의:

| 점수 | 백분위 위치 |
|---:|---|
| 90~100 | 상위 0~10% |
| 80~89 | 상위 10~20% |
| 70~79 | 상위 20~30% |
| 60~69 | 상위 30~40% |
| 50~59 | 평균 (40~50번째) |
| 40~49 | 하위 40~50% |
| 30~39 | 하위 30~40% |
| 20~29 | 하위 20~30% |
| 10~19 | 하위 10~20% |
| 0~9 | 하위 0~10% |

**40점 = "나쁘지 않다" 가 아니라 모집단 하위 40% 지점.** 호감도가 아닌 백분위.

### 7-2. 벡터 축

**여자 13축**: 귀여움, 청순함, 시크함, 따뜻함, 스타일리시함, 건강함, 성숙함, 지적단정함, 눈큼, 부드러운인상, 날카로운인상, 자연스러움, 화려함

**남자 12축**: 훈훈함, 댄디함, 시크함, 소년미, 건강함, 지적단정함, 남성미, 스타일리시함, 부드러운인상, 날카로운인상, 체형탄탄함, 자연스러움

각 값 0.0 ~ 1.0 실수. 부드러운인상 + 날카로운인상 합은 보통 0.9~1.1.

### 7-3. 8 버킷 (유형)

**여자**: 귀여운/동안형, 청순/자연형, 시크/도도형, 따뜻한/부드러운형, 스타일리시/화려형, 건강/활동형, 성숙/분위기형, 지적/단정형

**남자**: 훈훈/부드러운형, 댄디/단정형, 시크/날카로운형, 소년미/귀여운형, 운동/건강형, 지적/안경형, 강한 인상/남성미형, 스타일리시/개성형

벡터 축에서 버킷 점수로 변환하는 공식은 `docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md` 5, 6절. 코드: `lib/appearance/vector.ts:computeFemaleBucketScores`, `computeMaleBucketScores`.

### 7-4. GPT Vision 분석 프롬프트

`docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md` 에 정의된 system prompt 를 GPT Vision API (gpt-4o 등) 의 system 메시지로 사용. 사용자 사진을 함께 보내고 JSON 한 개만 받는다.

**핵심 가드레일**:

1. 점수는 백분위 정의로 매김 (50 미만 부여를 망설이지 않기)
2. 하위권 과대평가 절대 금지 (LLM 의 회피 경향 차단)
3. 실존 인물 닮음, 인종, 민족, 건강, 성격, 직업 추정 금지
4. 미성년자 의심 시 점수화 거부
5. 보정/필터 의심 시 효과 제외하고 5~10점 더 깎음
6. 사진 품질 불량 시 confidence 낮춤
7. JSON 외 텍스트 출력 금지

### 7-5. JSON Schema

`docs/APPEARANCE_ANALYSIS_SCHEMA.md`. 핵심 필드:

```json
{
  "subject_gender": "female" | "male",
  "appearance_score_normalized": 0-100,   // 백분위, 사용자 노출 금지
  "score_confidence": 0.0-1.0,
  "primary_type": "<8 버킷 중 1>",
  "secondary_types": ["<버킷>", "<버킷>"],
  "appearance_vector": { /* 13축 또는 12축 */ },
  "visible_features": { face_shape, eye_impression, hair_style,
                         makeup_or_grooming, clothing_style, overall_mood },
  "photo_quality": { single_person, face_visible, lighting_ok,
                      blurred, heavy_filter_suspected, face_occluded, confidence },
  "internal_notes": "<검수용, 노출 금지>"
}
```

### 7-6. 보정 / 회귀 테스트

`docs/APPEARANCE_VECTOR_CALIBRATION.md` 에 회귀 테스트셋:

```
python/appearance/eval/
├── eval_female_low/    백분위 10~40  10장
├── eval_female_mid/    백분위 40~70  10장
├── eval_female_high/   백분위 70~95  10장
├── eval_male_low/      "
├── eval_male_mid/      "
└── eval_male_high/     "
```

합격 기준:

- 폴더별 평균 점수 ±5 안
- `low` 폴더 평균 < 50 (50 이상이면 과대평가 편향)
- 같은 사진 3회 표준편차 ≤ 3
- 벡터 코사인 유사도 ≥ 0.95

### 7-7. ResNet50 + SCUT-FBP5500 (deprecated 의심)

- `python/appearance/main.py`, `model.py` 존재
- 단일 점수만 산출 (벡터 X)
- v1.5 에서 GPT Vision 으로 전환됨 (커밋 `6dc2ca3` "GPT Vision 전환 결정 기록")
- ※ 의견: 폐기 또는 fallback 결정 필요

---

## 8. 이상형 월드컵 (이성 풀)

### 8-1. 핵심 원칙: target ≠ measured

| 개념 | 의미 |
|---|---|
| `target_type`, `target_score` | 이미지 생성 의도 |
| `measured_*` (GPT 재분석) | 실제 이미지가 풍기는 인상 |
| `final_bucket` | 최종 버킷 = measured 기준 |
| **매칭 입력값** | **반드시 `measured.appearance_vector` 만 사용** |

`docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md` 17절: **"생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다."**

### 8-2. 풀 구조

- 여자 64장: `public/appearance-ideal/female-64/FI01.jpg ~ FI64.jpg`
- 남자 64장: `public/appearance-ideal/male-64/MI01.jpg ~ MI64.jpg`
- 총 128장
- 점수 분포 (measured 기준):
  - 60~69: 12장
  - 70~79: 28장
  - 80~89: 20장
  - 90~94: 4장

8 버킷 × 8 = 64. 각 버킷 8장.

### 8-3. METADATA.json 구조

`public/appearance-ideal/METADATA.json` 에 모든 이미지의 target/measured/bucket_scores/visual_review/review 정보. Codex 가 채움.

```json
{
  "_meta": { ... },
  "female_pool_mean_vector": null | {...},
  "male_pool_mean_vector": null | {...},
  "items": [
    {
      "id": "FI06",
      "gender": "female",
      "file": "public/appearance-ideal/female-64/FI06.jpg",
      "status": "active" | "candidate" | "rejected" | "regenerate",
      "generation_round": 2,
      "target": { score, type, subtype, prompt },
      "measured": { appearance_score_normalized, score_confidence,
                     primary_type, secondary_types, appearance_vector },
      "bucket_scores": { /* 8 버킷 점수 */ },
      "final_bucket": "성숙/분위기형",
      "matching_vector_source": "measured.appearance_vector",
      "visual_review": { duplicate_risk, similar_to, difference_notes },
      "review": { target_measured_mismatch, decision, accepted_reason, rejection_reason }
    },
    ...
  ]
}
```

### 8-4. 토너먼트 진행

- 64강 → 32강 → 16강 → 8강 → 4강 → 결승 (총 63 매치)
- 같은 final_bucket 끼리 1라운드부터 만나지 않게 `pairUpBucketAware` 사용 (변별력 확보)

### 8-5. 라운드 가중치

| 라운드 | weight |
|---|---:|
| 64강 | 1.00 |
| 32강 | 1.15 |
| 16강 | 1.35 |
| 8강 | 1.60 |
| 4강 | 1.90 |
| 결승 | 2.30 |
| 최종우승 | 2.80 (별도 가중치) |

### 8-6. 산출물 (PreferenceResult)

```ts
{
  preferred_appearance_vector,         // winner 벡터 가중 평균
  preferred_appearance_delta_vector,   // - pool_mean (절대값 보정)
  preferred_choice_delta_vector,       // winner-loser delta 가중 평균
  preferred_axis_percentile_vector,    // 풀 분포 내 위치 0~100 ★ 청순 쏠림 보정
  preferred_axis_z_vector,             // z-score ★ 청순 쏠림 보정
  preferred_score_range,               // {mean, min, max}
  preferred_bucket_weights,            // 정규화된 버킷 빈도
  worldcup_pool_mean_vector,
  pool_axis_stats,                     // 풀 축별 통계 (검수용)
  choice_logs,                         // 모든 라운드 선택 로그
  meta: { total_choices, final_winner_id, gender }
}
```

### 8-7. 청순 쏠림 보정

여자 AI 이미지는 청순/자연/부드러움으로 몰리기 쉬움.

- `preferred_appearance_delta_vector` = preferred - pool_mean (절대값 차이)
- `preferred_axis_z_vector` = (preferred - pool_mean) / pool_std (풀 spread 반영)
- `preferred_axis_percentile_vector` = 풀 분포 내 위치

핵심: **풀이 청순 0.69 로 좁게 몰려 있어도 사용자가 0.78 골랐다면 z-score 는 강한 신호.**

### 8-8. 사용자 UI 노출 정책

- 점수, 유형명 (target_type, measured_type), 키워드 화면 표시 금지
- 카드 위 텍스트 오버레이 금지
- 사용자는 사진 자체만 보고 선택
- 결과 화면은 `preferred_bucket_weights` 상위 2개만 노출 (예: "당신은 청순/자연형을 가장 좋아하는 편이에요")

---

## 9. 자기유사 월드컵 (동성 풀)

### 9-1. 목적

사용자가 자기와 비슷한 사람을 골라 `self_appearance_score` (백분위 0~100) 산출.

### 9-2. 구조

- 동성 이미지 8장 (32장 풀 중 stratified sampling)
- 점수대: 여자 {20, 30, 40, 50, 60, 68, 76, 86}, 남자 {20, 30, 40, 50, 60, 68, 76, 82}
- 8강 토너먼트 (7번 클릭)
- 시딩: 점수 상하위가 초반에 맞붙음

### 9-3. 산출물

- `profiles.self_appearance_score` (FLOAT 0~100)
- 사용자 노출 절대 금지

### 9-4. 파일 위치

- `public/appearance-self/female/female_self_XX.jpg`
- `public/appearance-self/male/male_self_XX.jpg`
- `public/appearance-self/SCORE_GUIDE.md` ← single source of truth

Codex 완료. 32장 × 2 성별 = 64장.

---

## 10. 매칭 시스템

### 10-1. 매칭 주기

**주 1회, 토요일 14:00 일괄 매칭.**

```
[월~금]     사용자가 그룹 생성 / 풀 진입 / 보증금 결제
[토 14:00]  매칭 풀 마감 + 1차 헝가리안 → 알림 발송
[토 저녁]   Forced Match (옵션 1 선택자) 실행
[일 06:00]  Forced Match 응답 마감 → 이월/취소 처리
[일~금]     매칭 확정 그룹 만남
```

### 10-2. 그룹 인원

**2:2 ~ 3:3** (8-3 결정). 같은 인원수끼리만 매칭.

### 10-3. Hard Filter (점수 처리 X, 매칭 후보 제외)

| 조건 | 처리 |
|---|---|
| 시간대 교집합 (요일) = 0 | 매칭 불가 |
| 그룹 인원수 다름 | 다른 풀 |
| 같은 학과 | 매칭 불가 (excluded_pairs) |
| 이전 매칭 페어 | 매칭 불가 (excluded_pairs) |
| 보증금 미납 | 매칭 풀 진입 자체 차단 |

### 10-4. Stratified Pool (외모 점수대 분리)

`self_appearance_score` ±15 안에서만 같은 풀.

예: 사용자 70점 → 풀 = 점수 55~85 사용자만 후보.

### 10-5. 시간대 입력 방식

사용자가 분 단위 슬라이더 아닌 **요일별 가능/불가능 토글**.

- 7 요일 각각 ⭕ / ❌
- 가능 요일의 시간대는 시스템이 18:00~24:00 으로 가정
- 만남 시각은 매칭 성사 후 venues 영업시간 + 양 그룹 가능 요일에서 자동 선택

### 10-6. 페어 점수 공식

```
appearanceFit_AB = cosine(A.preferred_z_vector, normalize(B.appearance_vector))
appearanceFit_BA = cosine(B.preferred_z_vector, normalize(A.appearance_vector))
personalityFit  = 1 - big5_distance(A.big5, B.big5)
scoreBandFit   = 1 - |A.self_score - B.self_score| / 15
weightAlign    = preferenceWeightAlignment(A.members, B.members)

base =
   0.50 × (appearanceFit_AB + appearanceFit_BA) / 2
 + 0.25 × personalityFit
 + 0.15 × scoreBandFit
 + 0.10 × weightAlign

asymmetryGap = |appearanceFit_AB - appearanceFit_BA|

pair_score = base - 0.30 × asymmetryGap
```

### 10-7. Threshold

- 일반 매칭: `pair_score < 0.45` → cost = +∞ (매칭 거부)
- Forced Match: `pair_score < 0.30` + 점수대 ±25

### 10-8. 헝가리안 알고리즘

`scipy.optimize.linear_sum_assignment` 사용. 최소 비용 = 최대 점수.

- 비용 행렬 = -pair_score (또는 +∞)
- 같은 (size, gender) 풀 안에서만 매칭
- 남녀 그룹 수 다를 때 더미 행/열로 정사각 만들기
- inf 셀이 잡힌 매칭은 거부 → 다음 배치 미룸

### 10-9. 공리주의 적용 범위

| 단위 | 적용 |
|---|---|
| 그룹 내 (3:3 한 자리) | ⭕ 합 최대. 한 명 95점 + 두 명 50점 OK |
| 시스템 전체 (100명 매칭) | ❌ 한 명만 95점은 안 됨. 매칭 받은 모든 그룹이 일정 수준 이상 (threshold 0.45) |

### 10-10. 매칭 못 받은 사용자

- **점수 보정 절대 금지** (연속 미매칭 보너스 등 X)
- 같은 풀에 사람 모일 때까지 다음 배치 대기
- 보증금 hold 유지
- 4주 연속 이월 → 자동 환불

### 10-11. Forced Match

토요일 1차 매칭 실패한 그룹에게 3가지 옵션 제시:

1. **Forced Match** — threshold 0.30, 점수대 ±25 로 즉시 재시도
2. **다음 주 이월** — 보증금 hold 유지
3. **매칭 중단** — 보증금 환불

응답 마감 일요일 06:00. 미응답은 자동 옵션 2.

### 10-12. 매칭 결과

사용자에게 보여주는 것:

- 상대 그룹 인원수 (예: "여자 3명")
- 만남 시간 (요일 + 시각)
- 만남 장소 (venues 정보)
- 비공개: 상대 사진, 이름, 점수, 학과

만남 자리에서 처음으로 서로 봄.

---

## 11. 보증금 시스템

### 11-1. 금액

**1인 2만원** (8-1 결정).

### 11-2. 결제 흐름

```
1. 멤버 전원이 토스페이먼츠로 각자 결제
2. 모든 멤버 paid 상태 확인 → 매칭 풀 진입 가능
3. 매칭 성사 → status = 'held'
4. 만남 완료 + 출석 인증 → status = 'refunded' (전액 환불)
5. 노쇼 → status = 'forfeited' → 출석자에게 균등 분배
6. 거짓말 신고 인정 → status = 'compensated' → 신고 그룹에 보상
```

### 11-3. 노쇼 페널티 배분

**출석자 균등 분배** (8-9 결정).

예: 3:3 매칭에서 1명 노쇼 → 그 2만원을 출석자 5명에게 4000원씩.

### 11-4. 거짓말 / 프로필 불일치 신고

**운영자 검토 후 결정** (8-11). 양측 의견 + 증거 검토.

### 11-5. 환불

- 매칭 중단 옵션 선택 → 즉시 환불
- 4주 연속 이월 → 자동 환불
- 만남 완료 → 전액 환불

---

## 12. 만남 / 출석 / 리뷰

### 12-1. GPS 체크인

- 만남 30분 전 알림 → 체크인 가능
- 기본 반경 50m (venues.checkin_radius_m 우선)
- 그룹 상호 인증 필요 (`peer_confirmed`)

### 12-2. 리뷰

만남 후 양 그룹이 리뷰 작성:

- `overall_score` 1~5
- `reported_issues`: 'no_show', 'profile_mismatch', 'inappropriate_behavior', 'good_match'
- `comment` 자유 텍스트

### 12-3. 연결 (1:1)

만남 후 개인 단위 연결 동의:

- A 와 B 둘 다 ✅ → 연락처(카카오톡 등) 공개
- 한쪽만 ✅ → 비공개 유지

### 12-4. 사후 처리

매칭 완료 시 자동:

- `excluded_pairs` 에 두 그룹 추가 (같은 페어 재매칭 방지)
- 보증금 환불 트리거
- 리뷰 입력 알림

---

## 13. 장소 시스템 (성준 영역)

### 13-1. venues 테이블

성준이 설계한 마스터 테이블 (`origin/matching/group-engine` 브랜치, main 미머지).

핵심 필드:

- `name`, `category` (cafe/restaurant/bar/other), `address`, `lat`, `lng`
- `min_group_size`, `max_group_size`
- `price_level` (1-4), `noise_level` (1-5), `privacy_level` (1-5)
- `vibe_tags` (Big5 extraversion 연결: 조용함/활기참 등)
- `opening_hours`, `available_timeslots` (JSONB)
- `checkin_radius_m` (기본 50)
- `status` (active/inactive/hidden)
- `admin_priority`, `quality_score`

### 13-2. match_meetings 테이블

매칭 확정 후 실제 시간/장소 고정.

- `match_id REFERENCES matches(id)` ← **충현의 matches 테이블 의존**
- `venue_id`
- `scheduled_start`, `scheduled_end`
- `checkin_radius_m` (venues 값 복사 — 장소 변경에도 만남 영향 X)
- `assignment_reason` JSONB (디버깅)

### 13-3. MVP Venue 선택 규칙

```
1. status = 'active'
2. suitable_for_group_meeting = true
3. min/max_group_size 인원 범위
4. available_timeslots 가 매칭 시간과 겹침
5. area / nearest_school 로 후보 제한
6. venue_score 정렬 (admin_priority + quality + privacy - noise)
```

### 13-4. Seed Data

부산대 앞 30~50개 (카페 15-20, 식당 10-15, 술집 10-15). 성준 작성.

---

## 14. 알림 시스템

### 14-1. 채널

**PWA 푸시 + 이메일** (8-12 결정).

### 14-2. 알림 종류

| 이벤트 | 트리거 시각 |
|---|---|
| 매칭 성사 | 토 14:00 발표 직후 |
| 매칭 실패 + 옵션 화면 링크 | 토 14:00 발표 직후 |
| Forced Match 결과 | 토 저녁 |
| 다음 주 이월 알림 | 일 06:00 |
| 자동 환불 | 4주 연속 이월 시 |
| 만남 D-1 리마인더 | 만남 24h 전 |
| GPS 체크인 가능 | 만남 30분 전 |

---

## 15. 데이터 모델 — 전체 테이블

### 15-1. 충현 영역 (프로필 + 외모)

| 테이블 | 상태 |
|---|---|
| `users` | Supabase Auth 기본 (auth.users) |
| `profiles` | ⭕ main, **이번 세션 preferred_* 9컬럼 추가** |
| `photos` | ⭕ main |
| `appearance_scores` | ⭕ main (raw 점수 보관) |
| `personality_scores` | 추정 (별도 마이그레이션은 못 봄) |
| `worldcup_choice_logs` | ⭕ **이번 세션 신규** |

### 15-2. 충현 인수 영역 (매칭, 이번 세션 신규)

| 테이블 | 상태 |
|---|---|
| `friend_requests` | ⭕ working tree (린터/사용자 수정으로 추가) |
| `friendships` | ⭕ working tree (린터/사용자 수정으로 추가) |
| `groups` | ⭕ working tree |
| `group_members` | ⭕ (user 당 1 그룹 제약, 단순 unique index) |
| `group_invites` | ⭕ (invited_by_user_id 컬럼 추가됨) |
| `match_pool` | ⭕ |
| `matches` | ⭕ |
| `deposits` | ⭕ |
| `attendances` | ⭕ |
| `reviews` | ⭕ |
| `connections` | ⭕ |
| `excluded_pairs` | ⭕ |

**친구 관계 모델 (린터/사용자 수정으로 추가)**:

- `friend_requests`: 친구 추가 요청. sender → receiver, token 기반, 상태 pending/accepted/declined/cancelled/expired.
- `friendships`: 수락된 친구. `user_id < friend_user_id` 로 정규화. 그룹 초대보다 먼저 처리하는 흐름.
- **그룹 초대 흐름이 변경됨**: "친구 추가 → 친구 관계 형성 → 그룹 초대" 로 추정. 모르는 사람을 그룹에 직접 못 넣는 안전장치.
- `group_invites.invited_by_user_id` 추가로 "누가 초대했는지" 추적 가능.

### 15-2-1. 친구 관계 → 그룹 → 매칭 흐름 (변경된 그림)

```
[기존] 사용자 → 그룹 생성 → 폰번호로 친구 초대 → 그룹 매칭 풀 진입

[변경 후 추정]
  1. 친구 추가 요청 (friend_requests)
  2. 수락 (friendships 생성)
  3. 그룹 생성 후 친구 중에서 그룹 초대 (group_invites)
  4. 멤버 전원 모이면 매칭 풀 진입
```

※ 의견: 안전성과 사용자 경험 모두 좋은 방향. 모르는 사람과 갑자기 그룹원 되는 것 방지.

### 15-3. 성준 영역 (장소)

| 테이블 | 상태 |
|---|---|
| `venues` | 🟡 matching/group-engine 브랜치, main 미머지 |
| `match_meetings` | 🟡 같음, matches FK 의존성 이번에 해결 |

### 15-4. profiles 컬럼 (계약)

INTERFACE_CONTRACT.md 기준:

```sql
user_id, gender, age, height, body_type, hair_density,
school, department, year,
appearance_type (cute/pure/chic/warm/stylish/healthy),
appearance_score_normalized FLOAT 0~1,
big5_openness, big5_conscientiousness, big5_extraversion,
big5_agreeableness, big5_neuroticism,
available_timeslots JSONB,
preference_weights JSONB,
is_profile_complete BOOL,
updated_at,
-- 자기유사 월드컵
self_appearance_score FLOAT 0~100,
-- 이번 세션 추가 (PR 필요)
preferred_appearance_vector JSONB,
preferred_appearance_delta_vector JSONB,
preferred_choice_delta_vector JSONB,
preferred_axis_percentile_vector JSONB,
preferred_axis_z_vector JSONB,
preferred_score_range JSONB,
preferred_bucket_weights JSONB,
worldcup_pool_mean_vector JSONB,
worldcup_pool_axis_stats JSONB,
worldcup_completed_at TIMESTAMPTZ
```

### 15-5. JSONB 형식

**`available_timeslots`**:

```json
{ "slots": [{ "day": "friday", "start": "18:00", "end": "22:00" }, ...] }
```

**`preference_weights`** (합 1.0):

```json
{ "appearance": 0.30, "personality": 0.25, "height": 0.10,
  "body_type": 0.10, "school": 0.10, "hobby": 0.10, "time_fit": 0.05 }
```

---

## 16. 협업 규칙

### 16-1. 절대 규칙 (CLAUDE.md)

1. `lib/types.ts` 수정 시 → PR + 성준 리뷰 필수
2. `supabase/migrations/` 신규 시 → 상대방 확인 없이 main 머지 금지
3. `main` 브랜치 직접 push 금지 (※ 실제로는 종종 위반, 사용자 허락)
4. INTERFACE_CONTRACT.md 컬럼/타입 임의 변경 금지

### 16-2. 노출 정책 (보안)

- `appearance_score_normalized`, `score_raw`, `self_appearance_score` UI 노출 금지
- 모든 `appearance_vector`, `preferred_*` raw 값 노출 금지
- `internal_notes` 노출 금지
- 만남 전 상대 프로필/사진 비공개
- 노출 가능: `primary_type`, `secondary_types`, `visible_features` 일부, `preferred_bucket_weights`

### 16-3. 영역 침범 금지 (원래 규칙)

- 충현 → 성준 영역: `python/matching/`, `app/group/`, `app/match/`, `components/matching/` 금지
- 성준 → 충현 영역: `python/appearance/`, `app/profile/`, `components/profile/` 금지
- **2026-05-21: 충현이 매칭 인수로 일부 우회 합의됨**

### 16-4. handoff 문서

- `docs/handoff/CLAUDE_CODEX_BRIDGE.md` — 세션 메시지 누적
- `docs/handoff/CODEX_*.md` — Codex 에게 작업 인수인계
- `docs/handoff/CLAUDE_*.md` — Claude 에게 작업 인수인계

---

## 17. 현재 진행 상황 (2026-05-21)

| 영역 | 진척도 | 비고 |
|---:|---|---|
| Supabase 마이그레이션 | 80% | 9개 작성, 실 키 미연동 |
| 인증 UI | 80% | OTP 화면 완성, Supabase 미연동 |
| 프로필 입력 UI | 95% | 7단계 모두 완성 |
| 이상형 월드컵 (measured) | 90% | UI 완성, 이미지 풀 부족 |
| 자기유사 월드컵 | 100% | Codex 64장 완성 |
| 외모 분석 GPT 프롬프트 | 100% | 운영 코드는 미작성 |
| 사용자 사진 GPT Vision 분석 파이프라인 | **0%** | ⚠️ Critical 누락 |
| 매칭 시스템 (lib/matching) | 5% | config.ts 만 |
| 헝가리안 엔진 (python/matching) | 0% | |
| 그룹/매칭 UI | 0% | placeholder만 |
| 보증금 결제 | 0% | |
| 출석/리뷰 | 0% | |
| 알림 시스템 | 0% | |
| venues / 맛집 DB (성준) | 10% | 설계만, main 미머지 |
| Codex 여자 이미지 | 31% | FI01~FI20 (목표 64) |
| Codex 남자 이미지 | 0% | 미시작 |
| 디자인 (Manus) | 100% | 적용 완료 |

---

## 18. Git 브랜치 상태

```
main (활성, 직접 push 자주)
├─ 775d703 feat: 이상형 월드컵 measured vector 시스템 + Codex 여자 64장 작업물 (Claude)
├─ bd81d86 docs: v1.5 종합 정의서
├─ 2eb1858 chore: 기획/디자인 자료 전체 업로드
└─ 8f390ec docs: v1.4 정의서

기타 브랜치:
- profile/appearance-ai (충현)
- profile/worldcup-ui (충현)
- dev
- matching/group-engine (성준, 1 커밋, main 미머지)
- feature/claude/clip-classifier (실험)
- feature/claude/gpt-scorer (실험)
- feature/claude/v1.5-protocol
- feature/codex/images-128 (Codex)
```

---

## 19. 결정된 운영 정책 (8-X)

| ID | 항목 | 결정값 |
|---|---|---|
| 8-1 | 보증금 1인 금액 | 2만원 |
| 8-2 | 토요일 매칭 발표 시각 | 14:00 |
| 8-3 | 그룹 인원 범위 | 2:2 ~ 3:3 |
| 8-4 | Forced Match 응답 마감 | 일요일 06:00 |
| 8-5 | 외모 점수대 폭 | ±15 |
| 8-6 | 페어 점수 threshold | 0.45 (튜닝 가능) |
| 8-7 | 양방향 비대칭 페널티 계수 | 0.3 |
| 8-8 | Forced Match 완화 | threshold 0.30, 점수대 ±25 |
| 8-9 | 노쇼 페널티 배분 | 출석자 균등 분배 |
| 8-10 | 자동 환불 시점 | 4주 연속 이월 |
| 8-11 | 거짓말/프로필 불일치 신고 | 운영자 검토 후 결정 |
| 8-12 | 알림 채널 | PWA + 이메일 |

모든 알고리즘 파라미터는 `lib/matching/config.ts` 한 파일에서 관리. `makeSimConfig()` 헬퍼로 시뮬레이션 가능.

---

## 20. 위험 / 미해결 이슈

### 20-1. Critical

1. **사용자 사진 GPT Vision 분석 파이프라인 누락** — 매칭의 절반(자기 외모 벡터)이 빠진 상태
2. **lib/types.ts MatchingProfile 확장 PR 필요** — preferred_* 필드 정의 합의
3. **`matches` 마이그레이션과 성준 `match_meetings` 머지 순서**

### 20-2. High

4. sessionStorage → DB 저장 교체 (`/profile/worldcup` 결과)
5. python/appearance/ deprecated 결정
6. Codex 의 FI21~FI64, MI01~MI64 이미지 완성
7. Cold start 풀 부족 시 stratification 폭 조정 정책

### 20-3. Medium

8. `IdealWorldcup.tsx` 후반 라운드 bucket pairing 검토
9. `vector.ts:meanVector` gender 인자 명시화
10. `valuePercentile` tie handling
11. `config.ts` weight sum check 를 fail-fast 로

### 20-4. Low

12. `bucket-to-legacy.ts` 제거 (appearance_type deprecated 후)
13. 풀 크기 < 16 시 가드
14. shuffle seed crypto 화

### 20-5. 사업 / 정책 미결

- 출시 일정
- 부산대 외 지역 확장 시점
- 인앱 결제 vs 외부 결제
- 약관 / 개인정보 처리방침
- 신원 인증 (학생증 확인 등)
- 미성년자 차단
- 동성애 / 트랜스젠더 매칭 정책

---

## 21. 사용자 (충현) 가치관 / 디자인 의도

이 항목은 **사용자가 명시적으로 표현한 것** 만 기록.

### 21-1. 매칭 철학

- **공리주의 (그룹 내 한정)**: 한 명이 95점, 두 명이 50점이어도 그룹 단위 합 최대면 OK.
- **시스템 전체 공리주의는 거부**: 100명 중 1명만 행복은 잘못. 매칭받은 사람들이 골고루 만족해야 함.
- **점수 보정 절대 금지**: 매칭 못 받은 사용자 점수 올려서 억지로 매칭은 본질 어긋남.
- **정직한 점수 부여 우선**: 사용자 보호 = 정직한 매칭. 점수 부풀려서 도와주는 게 사기에 가까움.
- **시간 안 맞으면 매칭 불가는 hard filter**: 점수 깎기 X.

### 21-2. 사용자 보호 / 노출 정책

- 점수/벡터 raw 값은 절대 사용자에게 노출하지 않음.
- 만남 전까지 상대 정보 비공개 (외모로 거절하는 흐름 차단).
- 외모 평가가 매칭 입력값으로만 쓰임을 사용자에게 안내.

### 21-3. 운영 원칙

- 주 1회 토요일 일괄 매칭으로 예측 가능성 확보.
- 보증금 시스템으로 노쇼 차단.
- 매칭 실패 시 사용자에게 옵션 제공 (자율).

### 21-4. 기술 의도

- 가상 데이터로 실험하면서 파라미터 튜닝 가능한 구조 (`lib/matching/config.ts`).
- 알고리즘 결정은 가능한 한 명시적 (heuristic > black box).
- 협업 충돌 최소화를 위해 인터페이스 계약 명시.

---

## 22. 모르는 것 (Codex 가 알려줄 수 있는 것)

### 22-1. Codex 작업

- FI21~FI64 진행 일정
- MI01~MI64 시작 시점
- `ANALYSIS_RAW_FEMALE.json` 작성 여부
- `METADATA.json` 실 분석값 교체 일정
- 이미지 생성 모델 (GPT-image, DALL-E 3, Midjourney 등)
- 청순 쏠림 검수 결과
- AI 티 강한 이미지 발견 여부

### 22-2. 운영 / 사업

- Supabase 프로젝트 URL / ANON_KEY (성준이 줘야 함)
- 토스페이먼츠 테스트 키
- 출시 목표 일자
- 부산대 외 확장 시점
- 마케팅 채널 (학교 커뮤니티 / SNS / 입소문)

### 22-3. 디자인 (Manus)

- 추가 화면 디자인 가이드 (매칭 결과 / 보증금 / 출석 / 리뷰)
- 알림 메시지 톤
- 일러스트레이션 / 일러스트 시스템

---

## 23. Appendix — 핵심 파일 경로

### 23-1. 정의서 / 계획서

```
부산대_과팅앱_v1.5_정의서.md
docs/MATCHING_SYSTEM_PLAN.md
docs/INTERFACE_CONTRACT.md
docs/COLLABORATION.md
docs/IDEAL_WORLDCUP_64_DESIGN.md
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
docs/VENUE_DB_DESIGN.md          (성준, main 미머지)
docs/CODE_REVIEW_2026-05-21.md
docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md  ← 이 문서
public/appearance-self/SCORE_GUIDE.md  ← 점수 정의 single source of truth
```

### 23-2. handoff

```
docs/handoff/CLAUDE_CODEX_BRIDGE.md
docs/handoff/CHUNGHYUN_SESSION_STATE.md
docs/handoff/CODEX_HANDOFF_PHOTOS.md
docs/handoff/CODEX_PROMPT_CHUNGHYUN.md
docs/handoff/CLAUDE_IDEAL_WORLDCUP_MEASURED_VECTOR_PROMPT.md
docs/handoff/CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md
docs/handoff/MANUS_FEMALE_64_IMAGE_GENERATION_HANDOFF.md
```

### 23-3. 코드 (Next.js)

```
app/(auth)/login/page.tsx
app/profile/worldcup/page.tsx      (이상형 월드컵 — measured 기반)
app/profile/self-worldcup/page.tsx (자기유사)
app/profile/basic/page.tsx
app/profile/photos/page.tsx
app/profile/survey/page.tsx        (Big5)
app/profile/schedule/page.tsx
app/profile/preferences/page.tsx
app/profile/complete/page.tsx
app/profile/edit/page.tsx
app/group/create/page.tsx          (placeholder)
app/api/score/route.ts             (AI 서버 프록시)

components/profile/IdealWorldcup.tsx
components/profile/IdealWorldcupResult.tsx
components/profile/AppearanceSelfWorldcup.tsx
components/profile/SelfWorldcupResult.tsx
components/profile/Big5Survey.tsx
components/profile/Big5Result.tsx
components/profile/BasicInfoForm.tsx
components/profile/PhotoUpload.tsx
components/profile/PreferenceSliders.tsx
components/profile/SchedulePicker.tsx
components/profile/StepProgress.tsx
components/MatchingPool.tsx        (Soul Orbs)
```

### 23-4. lib

```
lib/types.ts            (공용 타입, PR 필수)
lib/constants.ts        (공용 상수)
lib/supabase.ts         (클라이언트)
lib/utils.ts            (isSupabaseConfigured 등)
lib/pnu-departments.ts  (부산대 학과 enum)

lib/appearance/vector.ts        (벡터 수학, axis stats)
lib/appearance/metadata.ts      (METADATA.json 로더)
lib/appearance/preference.ts    (PreferenceResult 계산)
lib/appearance/bucket-to-legacy.ts (임시 호환)

lib/matching/config.ts          (매칭 튜닝 파라미터, 이번 세션 신규)
```

### 23-5. Python

```
python/appearance/main.py           (FastAPI 서버)
python/appearance/model.py          (ResNet50)
python/appearance/supabase_client.py
python/appearance/Dockerfile
python/appearance/tests/

python/matching/                    (폴더 자체 없음 — 미시작)
```

### 23-6. Supabase 마이그레이션

```
supabase/migrations/20260514_profile_create_appearance_tables.sql
supabase/migrations/20260514_profile_create_profiles_table.sql
supabase/migrations/20260515_profile_add_self_appearance_score.sql
supabase/migrations/20260515_profile_create_photos_table.sql
supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql  (성준, 미머지)
supabase/migrations/20260521_matching_create_core_tables.sql             (충현, 이번 세션)
supabase/migrations/20260521_profile_add_preference_vectors.sql          (충현, 이번 세션)
```

### 23-7. Public 자산

```
public/appearance-ideal/female-64/FI01.jpg ~ FI20.jpg  (Codex, 진행 중)
public/appearance-ideal/male-64/                       (비어있음)
public/appearance-ideal/METADATA.json                  (fixture)
public/appearance-ideal/prompt_FI01.txt ~ FI24.txt     (Codex 사용 프롬프트)
public/appearance-ideal/CONTACT_SHEET_*.jpg

public/appearance-self/female/female_self_*.jpg        (Codex 완료)
public/appearance-self/male/male_self_*.jpg            (Codex 완료)
public/appearance-self/SCORE_GUIDE.md                   (백분위 정의 출처)
public/appearance-self/female-64/                      (Codex 추후 확장)

public/appearance-types/cute.jpg, pure.jpg, ...        (deprecated 의심, 6 enum)
```

---

## 24. 마지막 점검 — Codex 가 확인해 줄 것

이 문서를 Codex 가 같은 형식 (`docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md`) 으로 작성한 후, 양 문서를 비교:

### 24-1. 일치하면 좋은 항목 (사실)

- 섹션 1 (프로젝트 정체성)
- 섹션 3 (버전 히스토리)
- 섹션 7 (외모 점수 정의 — Codex SCORE_GUIDE.md 기반이라 무조건 일치해야 함)
- 섹션 15 (데이터 모델)
- 섹션 19 (8-X 결정값)

### 24-2. 다를 수 있는 항목 (이해 차이)

- 섹션 6 (사용자 흐름) — 단계 순서 인식 차이
- 섹션 8-1 (target ≠ measured 원칙) — Codex 가 가장 강조한 부분
- 섹션 10 (매칭 시스템) — 충현 인수 이후라 Codex 가 모를 수 있음
- 섹션 17 (진행 상황) — Codex 의 실제 작업 진척과 비교 필요
- 섹션 22 (모르는 것) — Codex 가 알려줄 수 있는 영역

### 24-3. 의견 차이가 있어도 무방한 항목

- 섹션 21 (사용자 가치관) — 두 AI 의 해석 차이 자연스러움
- 섹션 20 (위험 / 이슈) — 우선순위 다를 수 있음

### 24-4. Codex 가 추가해 줄 수 있는 영역

- 이미지 생성 작업의 구체적 진행률
- METADATA 실 분석값 작성 일정
- 청순 쏠림 등 시각적 검수 결과
- Codex 가 외부 작업에서 본 다른 시도들 (CLIP, etc.)

---

## 끝

이 문서는 Claude (충현 세션) 가 2026-05-21 기준으로 알고 있는 모든 것이다. 누락된 것은 정직하게 "모름" 으로 표기.

비교 후 충돌 항목이 발견되면:

1. 두 AI 간 토론 → 사실 기반으로 정정
2. 사용자가 결정자 — 디자인 / 가치관 / 운영 정책
3. 합의된 항목은 다음 단계에서 SOURCE OF TRUTH 로 격상

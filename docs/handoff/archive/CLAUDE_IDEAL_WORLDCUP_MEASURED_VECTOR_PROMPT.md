# Claude Code 인수인계 프롬프트: 이상형 월드컵 measured vector 구조 반영

아래 내용을 Claude Code에 그대로 붙여넣어라.

---

너는 데이팅앱 프로젝트에서 "상대방 이상형 월드컵 64강"의 UI, 데이터 구조, 선호 벡터 계산 로직을 구현/정비한다.

중요:
Codex는 이미지 생성 작업을 별도로 진행한다. 너는 이미지를 생성하지 않는다.
너의 작업 범위는 월드컵 기능, 메타데이터 구조, 선택 로그, 선호 벡터 계산, 매칭 입력값 정리다.

반드시 먼저 읽어라:

```text
docs/IDEAL_WORLDCUP_64_DESIGN.md
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
```

가장 중요한 원칙:

```text
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

절대 하면 안 되는 것:

- `target_type`을 사용자의 선호로 저장하지 마라.
- `target_type`을 매칭 알고리즘에 직접 넣지 마라.
- 이미지 파일명 범위(FI01~FI64, MI01~MI64)만 보고 유형을 추정하지 마라.
- "FI01~FI08은 귀여운/동안형" 같은 설계표 라벨을 매칭에 쓰지 마라.
- 사용자 화면에 외모 점수, 내부 유형명, 내부 벡터 값을 노출하지 마라.
- 월드컵 카드 위에 "귀여움", "청순함", "80점" 같은 라벨을 보여주지 마라. 사용자의 선택이 오염된다.
- 자기유사 월드컵 폴더인 `public/appearance-self/`는 건드리지 마라.
- 대표 타입 이미지 폴더인 `public/appearance-types/`와 섞지 마라.

왜 이렇게 해야 하는가:

이미지 생성 의도와 실제 사용자가 보는 인상은 다를 수 있다.
예를 들어 FI06을 귀여운/동안형으로 만들려고 했더라도 GPT 재분석 결과가 성숙/분위기형, 청순/자연형, 지적/단정형이면 사용자가 FI06을 고른 의미는 "귀여움 선호"가 아니라 "성숙함/청순함/지적단정함 선호"에 가깝다.

따라서 월드컵 선택 결과는 반드시 실제 이미지 분석값인 `measured.appearance_vector`로 계산해야 한다.

---

## 1. 데이터 모델 방향

최종 메타데이터는 아래 구조를 기준으로 맞춰라.

파일 위치:

```text
public/appearance-ideal/METADATA.json
```

각 이미지 항목 구조:

```json
{
  "id": "FI06",
  "gender": "female",
  "file": "public/appearance-ideal/female-64/FI06.jpg",
  "status": "active",
  "generation_round": 2,
  "target": {
    "score": 80,
    "type": "귀여운/동안형",
    "subtype": "단정한 귀여움",
    "prompt": "실제로 사용한 생성 프롬프트"
  },
  "measured": {
    "subject_gender": "female",
    "appearance_score_normalized": 80,
    "score_confidence": 0.66,
    "primary_type": "성숙/분위기형",
    "secondary_types": ["청순/자연형", "지적/단정형"],
    "appearance_vector": {
      "귀여움": 0.43,
      "청순함": 0.76,
      "시크함": 0.37,
      "따뜻함": 0.55,
      "스타일리시함": 0.63,
      "건강함": 0.55,
      "성숙함": 0.73,
      "지적단정함": 0.72,
      "눈큼": 0.60,
      "부드러운인상": 0.61,
      "날카로운인상": 0.39,
      "자연스러움": 0.73,
      "화려함": 0.34
    }
  },
  "bucket_scores": {
    "귀여운/동안형": 0.52,
    "청순/자연형": 0.74,
    "시크/도도형": 0.40,
    "따뜻한/부드러운형": 0.58,
    "스타일리시/화려형": 0.49,
    "건강/활동형": 0.57,
    "성숙/분위기형": 0.75,
    "지적/단정형": 0.73
  },
  "final_bucket": "성숙/분위기형",
  "matching_vector_source": "measured.appearance_vector",
  "review": {
    "target_measured_mismatch": true,
    "accepted_reason": "귀여운 슬롯에서는 제외하지만 성숙/청순/지적 선호 측정용으로 유효함",
    "rejection_reason": ""
  }
}
```

`status`는 아래 값만 사용한다.

```text
active
candidate
rejected
regenerate
```

월드컵에는 `status === "active"`인 이미지만 사용한다.

---

## 2. 청순 쏠림 방지 원칙

여자 AI 프로필 이미지는 기본적으로 아래 방향으로 수렴하기 쉽다.

```text
청순함 높음
자연스러움 높음
부드러운인상 높음
흰/크림 상의
긴 생머리
자연광
작은 타원형 얼굴
부드러운 미소
```

이 상태에서 사용자가 청순한 이미지를 고른다고 해서 바로 "청순 선호"라고 해석하면 안 된다.
왜냐하면 전체 이미지 풀이 이미 청순 쪽으로 치우쳐 있을 수 있기 때문이다.

따라서 선택 결과는 두 단계로 계산한다.

```text
selected_mean_vector = 사용자가 고른 이미지들의 measured_vector 평균
pool_mean_vector = 월드컵 전체 active 이미지들의 measured_vector 평균
preferred_appearance_delta_vector = selected_mean_vector - pool_mean_vector
```

예시:

```text
전체 풀 평균 청순함 = 0.69
사용자 선택 평균 청순함 = 0.72
delta 청순함 = +0.03
=> 청순 선호는 약함
```

반대로:

```text
전체 풀 평균 시크함 = 0.34
사용자 선택 평균 시크함 = 0.62
delta 시크함 = +0.28
=> 시크 선호는 강함
```

즉 사용자 취향의 핵심 신호는 단순 평균이 아니라 `delta_vector`다.

단, 이 보정은 청순함을 지워버리기 위한 장치가 아니다.

중요한 구현 원칙:

- `preferred_appearance_vector`는 사용자가 실제로 기대하는 절대 외모 느낌이다.
- `preferred_appearance_delta_vector`는 전체 풀 대비 더 강하게 고른 축을 찾는 보정 신호다.
- 청순함처럼 전체 풀 평균이 높은 축은 `preferred_axis_percentile_vector`와 `preferred_axis_z_vector`를 함께 계산해야 한다.
- 사용자가 청순 상위 이미지를 반복 선택했다면, delta가 작더라도 매칭에서 청순한 상대를 기대할 수 있어야 한다.
- 델타가 작다는 이유만으로 청순 축을 무시하거나 0에 가깝게 만들면 안 된다.

추가 저장 필드:

```json
{
  "preferred_axis_z_vector": {},
  "preferred_axis_percentile_vector": {},
  "worldcup_pool_axis_stats": {}
}
```

축별 pool stats는 최소한 아래 값을 가진다.

```json
{
  "청순함": {
    "mean": 0.71,
    "std": 0.09,
    "p10": 0.55,
    "p50": 0.72,
    "p90": 0.84
  }
}
```

---

## 3. 선택 로그 계산 규칙

월드컵은 단순히 최종 우승 이미지만 저장하면 안 된다.
모든 라운드의 winner/loser를 저장해야 한다.

각 선택 로그 구조:

```json
{
  "round": 64,
  "match_index": 1,
  "winner_id": "FI06",
  "loser_id": "FI01",
  "winner_vector": {},
  "loser_vector": {},
  "choice_delta_vector": {},
  "weight": 1.0,
  "created_at": "ISO_DATE_STRING"
}
```

`choice_delta_vector` 계산:

```text
choice_delta_vector = winner.measured.appearance_vector - loser.measured.appearance_vector
```

예시:

```text
FI06 성숙함 0.73 - FI01 성숙함 0.28 = +0.45
FI06 귀여움 0.43 - FI01 귀여움 0.80 = -0.37
```

이 선택은 "성숙함 선호, 귀여움 비선호" 신호로 봐야 한다.

다만 winner와 loser의 measured_score 차이가 크면 유형 취향 신호가 약해질 수 있다.
예를 들어 85점 이미지를 65점 이미지보다 고른 것은 유형보다 외모 수준 선택일 수 있다.

따라서 choice log에는 아래 값도 저장해라.

```json
{
  "score_gap": 6,
  "vector_distance": 0.32,
  "type_signal_weight": 0.91
}
```

규칙:

```text
score_gap <= 5  => score_gap_penalty 1.00
score_gap <= 10 => score_gap_penalty 0.80
score_gap <= 15 => score_gap_penalty 0.60
score_gap > 15  => score_gap_penalty 0.40

type_signal_weight =
  score_gap_penalty * clamp(vector_distance / 0.35, 0.50, 1.20)
```

`preferred_choice_delta_vector`를 계산할 때 라운드 weight와 `type_signal_weight`를 모두 곱해라.

라운드별 가중치:

| 라운드 | weight |
|---|---:|
| 64강 | 1.00 |
| 32강 | 1.15 |
| 16강 | 1.35 |
| 8강 | 1.60 |
| 4강 | 1.90 |
| 결승 | 2.30 |
| 최종 우승 이미지 | 2.80 |

---

## 4. 최종 선호 결과 구조

월드컵 종료 후 저장할 결과:

```json
{
  "preferred_appearance_vector": {},
  "preferred_appearance_delta_vector": {},
  "preferred_axis_z_vector": {},
  "preferred_axis_percentile_vector": {},
  "preferred_choice_delta_vector": {},
  "preferred_score_range": {
    "mean": 0,
    "min": 0,
    "max": 0,
    "std": 0
  },
  "preferred_bucket_weights": {},
  "worldcup_pool_mean_vector": {},
  "worldcup_pool_axis_stats": {},
  "choice_logs": []
}
```

계산 기준:

```text
preferred_appearance_vector
= 사용자가 선택한 winner 이미지들의 measured_vector 가중 평균

preferred_appearance_delta_vector
= preferred_appearance_vector - worldcup_pool_mean_vector

preferred_axis_z_vector
= (preferred_appearance_vector - worldcup_pool_mean_vector) / max(worldcup_pool_axis_stats.std, 0.05)

preferred_axis_percentile_vector
= preferred_appearance_vector가 해당 축의 active 풀 분포에서 몇 분위인지 계산한 값

preferred_choice_delta_vector
= 모든 choice_delta_vector의 가중 평균

preferred_bucket_weights
= 사용자가 선택한 winner 이미지들의 final_bucket 빈도 + 라운드 가중치
```

std가 0.05보다 작으면 그 축은 이미지 풀에서 구분력이 부족한 것이다.
이 경우 z-score를 과신하지 말고, 검수 결과에 축 커버리지 부족으로 남겨라.

매칭 알고리즘에는 아래 두 값을 우선 사용한다.

```text
preferred_appearance_vector
preferred_appearance_delta_vector
```

`preferred_choice_delta_vector`, `preferred_axis_z_vector`, `preferred_axis_percentile_vector`는 보조 신호로 저장한다.

매칭에서 중요한 해석:

```text
preferred_appearance_vector = 사용자가 기대하는 절대 인상
delta/z/percentile/choice_delta = 어떤 축을 더 중요하게 봐야 하는지 정하는 보조 신호
```

절대 `preferred_appearance_delta_vector`만으로 최종 취향을 판단하지 마라.
특히 청순/자연/부드러움은 풀 평균이 높아 delta가 작게 나와도, absolute와 percentile이 높으면 매칭에서 유지해야 한다.

---

## 5. UI 원칙

사용자 화면:

- 두 장의 사진 카드만 보여준다.
- 점수 표시 금지.
- 내부 유형명 표시 금지.
- "귀여움", "청순함", "성숙함" 같은 키워드 표시 금지.
- 이미지 위 텍스트 오버레이 금지.
- 사용자가 사진 자체만 보고 선택하게 한다.

허용되는 UI:

- 좌우 또는 상하 카드 비교
- 선택 애니메이션
- 진행률 표시: 예) 64강 3/32
- 다시 선택/이전 선택 버튼
- 로딩/이미지 누락 fallback

이미지 누락 fallback:

- 이미지가 아직 없으면 회색/그라디언트 placeholder를 보여줄 수 있다.
- 하지만 placeholder로 실제 취향 계산을 하면 안 된다.
- placeholder 선택 로그는 `invalid_for_matching=true`로 저장하거나 월드컵 시작 자체를 막는다.

---

## 6. 브래킷 생성 원칙

월드컵 대진은 랜덤으로만 만들면 안 된다.
잘못된 대진은 사용자가 유형이 아니라 외모 점수만 보고 선택하게 만든다.

64강 첫 라운드 권장 규칙:

- 같은 `final_bucket`끼리 붙이지 마라.
- 가능하면 measured_score 차이가 8점 이하인 이미지끼리 붙여라.
- measured_vector distance가 0.20 이상인 이미지끼리 붙여라.
- 90점대 이미지를 한쪽 브래킷에 몰지 마라.
- 같은 헤어/옷/배경/표정의 이미지가 연속해서 나오지 않게 해라.

대진 생성이 완벽히 맞지 않을 경우 우선순위:

1. 같은 final_bucket끼리 붙이지 않기
2. measured_score 차이 줄이기
3. vector_distance 확보하기
4. 시각적 반복 줄이기

각 choice log에는 `score_gap`, `vector_distance`, `type_signal_weight`를 저장한다.

---

## 7. 현재 이미지 생성 상태와 병렬 작업

Codex가 이미지 생성을 계속 진행할 수 있다.
Claude Code는 이미지 완성을 기다리지 말고 아래 작업을 먼저 구현해라.

선행 구현 가능 작업:

1. `METADATA.json` 로딩 구조
2. active 이미지 필터링
3. 성별별 pool 선택
4. 월드컵 bracket 생성
5. 선택 로그 저장
6. vector 평균 계산 유틸
7. pool mean 계산
8. selected mean 계산
9. delta vector 계산
10. axis z-score/percentile 계산
11. winner-loser choice delta 계산
12. score_gap/type_signal_weight 계산
13. 결과 저장 구조
14. 사용자 UI에서 내부 라벨 숨김
15. 브래킷 생성 규칙 반영

이미지나 measured 분석값이 아직 없는 경우:

- 임시 mock metadata를 코드 내부에 하드코딩하지 마라.
- 테스트용 fixture 파일을 따로 만들 수는 있다.
- 실제 앱 로직은 반드시 `public/appearance-ideal/METADATA.json`을 기준으로 동작해야 한다.

---

## 8. 구현 시 반드시 확인할 것

작업 완료 전에 아래를 직접 확인해라.

- [ ] `target.type`을 선호 계산에 사용하지 않았는가?
- [ ] `measured.appearance_vector`를 기준으로 계산하는가?
- [ ] `pool_mean_vector`를 빼서 청순 쏠림을 보정하는가?
- [ ] `preferred_axis_z_vector`와 `preferred_axis_percentile_vector`를 계산하는가?
- [ ] 청순 delta가 작아도 absolute/percentile이 높으면 청순 기대값을 유지하는가?
- [ ] winner-loser delta를 저장하는가?
- [ ] score_gap과 type_signal_weight를 저장하는가?
- [ ] measured_score 차이가 큰 선택을 유형 취향으로 과대해석하지 않는가?
- [ ] 64강 첫 라운드에서 같은 final_bucket끼리 붙이지 않는가?
- [ ] 사용자 UI에 점수/유형/키워드가 노출되지 않는가?
- [ ] placeholder 이미지를 실제 취향 계산에 넣지 않는가?
- [ ] 여자/남자 벡터 축이 다를 때 안전하게 처리하는가?
- [ ] 자기유사 월드컵 폴더를 건드리지 않았는가?

---

## 9. 산출물

작업 완료 후 아래 내용을 보고해라.

```text
1. 수정한 파일 목록
2. 월드컵 UI가 읽는 데이터 소스
3. 선택 로그 저장 구조
4. preferred_appearance_vector 계산 방식
5. preferred_appearance_delta_vector 계산 방식
6. preferred_axis_z_vector / percentile 계산 방식
7. choice_delta에 score_gap/type_signal_weight를 반영했는지
8. 브래킷 생성 규칙 반영 여부
9. target_type을 매칭에 쓰지 않는다는 확인
10. 테스트 또는 수동 검수 결과
```

커밋은 사용자가 요청하기 전까지 하지 마라.

---

## 10. 가장 중요한 한 줄

```text
사용자가 고른 이미지를 우리가 의도한 라벨로 해석하지 말고, 실제 GPT 분석 measured_vector로 해석해라.
```

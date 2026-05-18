# 이상형 월드컵 측정 벡터 운영 계획서

이 문서는 `docs/IDEAL_WORLDCUP_64_DESIGN.md`로 생성한 이상형 월드컵 이미지가 실제로 어떤 외모/스타일로 인식되는지 다시 분석하고, 그 결과를 매칭 알고리즘에 안전하게 반영하기 위한 운영 계획서다.

핵심 문제는 단순하다.

```text
생성 의도: FI06 = 귀여운/동안형
실제 분석: FI06 = 성숙/분위기형 + 청순/자연형 + 지적/단정형
```

이 상태에서 생성 의도 라벨만 믿고 매칭하면 사용자가 FI06을 골랐을 때 "귀여운 사람을 좋아한다"로 잘못 해석된다. 실제로는 "청순함, 성숙함, 지적단정함이 강한 사람에게 반응했다"로 해석해야 한다.

따라서 이 프로젝트에서는 아래 원칙을 따른다.

```text
target_type / target_vector = 이미지 생성용 목표값
measured_type / measured_vector = 실제 이미지 분석값
final_bucket = 최종 월드컵 풀에서 이 이미지가 담당하는 유형
matching_vector = 매칭 계산에 사용하는 실제 벡터
```

매칭에는 `target_type`을 직접 쓰지 않는다. 매칭에는 반드시 실제 생성 이미지를 GPT 분석기로 다시 평가한 `measured_vector`를 사용한다.

---

## 1. 목표

### 1-1. 데이터 목표

성별별 최종 이미지 풀은 아래 균형을 만족해야 한다.

```text
여자 이상형 월드컵: 64장
남자 이상형 월드컵: 64장
총 128장
```

각 성별별 최종 풀은 measured 기준으로 8유형 x 8장을 맞춘다.

여자 최종 버킷:

| final_bucket | 수량 |
|---|---:|
| 귀여운/동안형 | 8 |
| 청순/자연형 | 8 |
| 시크/도도형 | 8 |
| 따뜻한/부드러운형 | 8 |
| 스타일리시/화려형 | 8 |
| 건강/활동형 | 8 |
| 성숙/분위기형 | 8 |
| 지적/단정형 | 8 |

남자 최종 버킷:

| final_bucket | 수량 |
|---|---:|
| 훈훈/부드러운형 | 8 |
| 댄디/단정형 | 8 |
| 시크/날카로운형 | 8 |
| 소년미/귀여운형 | 8 |
| 운동/건강형 | 8 |
| 지적/안경형 | 8 |
| 강한 인상/남성미형 | 8 |
| 스타일리시/개성형 | 8 |

중요한 점:

- 이 수량은 `target_type` 기준이 아니다.
- 이 수량은 GPT 재분석 후의 `measured_vector`와 `final_bucket` 기준이다.
- 생성 의도와 실제 분석이 다르면 실제 분석을 우선한다.

### 1-2. 매칭 목표

사용자가 월드컵에서 이미지를 고르면 다음 값을 만든다.

```text
preferred_appearance_vector
preferred_appearance_delta_vector
preferred_axis_z_vector
preferred_axis_percentile_vector
preferred_choice_delta_vector
preferred_score_range
preferred_bucket_weights
```

이 값은 이후 매칭에서 아래처럼 사용한다.

```text
A의 선호 벡터 vs B의 실제 외모 벡터
B의 선호 벡터 vs A의 실제 외모 벡터
```

양방향 점수를 따로 계산한 뒤 최종 외모 궁합 점수에 반영한다.

---

## 2. 핵심 개념

### 2-1. target 값

`target`은 이미지를 만들기 위한 기획 의도다.

예시:

```json
{
  "id": "FI06",
  "target_type": "귀여운/동안형",
  "target_score": 80,
  "target_prompt": "단정하고 안정적인 상위권 귀여움"
}
```

이 값은 다음 용도로만 쓴다.

- 이미지 생성 프롬프트 작성
- 생성 결과가 원래 의도와 얼마나 어긋났는지 검수
- 부족한 유형을 재생성할 때 원인 분석

이 값은 매칭 계산에 직접 넣지 않는다.

### 2-2. measured 값

`measured`는 실제 생성 이미지를 GPT 분석기로 다시 평가한 값이다.

예시:

```json
{
  "id": "FI06",
  "measured_type": "성숙/분위기형",
  "measured_score": 80,
  "measured_vector": {
    "귀여움": 0.43,
    "청순함": 0.76,
    "성숙함": 0.73,
    "지적단정함": 0.72
  }
}
```

이 값은 다음 용도로 쓴다.

- 최종 버킷 배치
- 월드컵 선택 결과 계산
- 매칭 알고리즘 입력
- 이미지 풀 쏠림 검수

### 2-3. final_bucket

`final_bucket`은 이미지가 최종 월드컵 풀에서 담당하는 유형이다.

```json
{
  "id": "FI06",
  "target_type": "귀여운/동안형",
  "measured_type": "성숙/분위기형",
  "final_bucket": "성숙/분위기형"
}
```

`final_bucket`은 사람이 임의로 붙이는 라벨이 아니라 measured vector를 기준으로 계산하고, 최종 접촉 시트 검수에서 사람이 확인한다.

---

## 3. 전체 파이프라인

```text
1. 설계표 작성
2. target 기준 이미지 후보 생성
3. 생성 이미지 GPT 재분석
4. measured_vector 저장
5. final_bucket 자동 후보 산정
6. 버킷별 수량/쏠림 검수
7. 과잉 버킷은 후보 제외
8. 부족 버킷은 재생성
9. 최종 64장 확정
10. 사용자 월드컵 진행
11. 선택 로그로 preferred vector 계산
12. 매칭 알고리즘에 반영
```

---

## 4. 최종 메타데이터 구조

최종 파일은 아래 위치에 둔다.

```text
public/appearance-ideal/METADATA.json
```

각 이미지 항목은 target, measured, final 값을 모두 가진다.

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

`status` 값:

| status | 의미 |
|---|---|
| active | 최종 월드컵에 사용 |
| candidate | 후보 풀에는 있지만 최종 64장에는 미포함 |
| rejected | 품질/중복/점수/유형 문제로 폐기 |
| regenerate | 같은 슬롯 재생성 필요 |

---

## 5. 여자 버킷 점수 계산

여자 이미지는 13축 measured vector를 8개 final bucket 점수로 변환한다.

계산값은 0.0~1.0이다. 아래 수식은 1차 기준이며, 실제 운영 중 GPT 평가 결과를 보고 보정한다.

### 5-1. 귀여운/동안형

```text
귀여운/동안형 =
  귀여움 * 0.45
+ 눈큼 * 0.20
+ 부드러운인상 * 0.15
+ 따뜻함 * 0.10
+ (1 - 성숙함) * 0.10
```

### 5-2. 청순/자연형

```text
청순/자연형 =
  청순함 * 0.45
+ 자연스러움 * 0.25
+ 부드러운인상 * 0.15
+ 지적단정함 * 0.10
+ (1 - 화려함) * 0.05
```

### 5-3. 시크/도도형

```text
시크/도도형 =
  시크함 * 0.40
+ 날카로운인상 * 0.30
+ 스타일리시함 * 0.15
+ 성숙함 * 0.10
+ (1 - 따뜻함) * 0.05
```

### 5-4. 따뜻한/부드러운형

```text
따뜻한/부드러운형 =
  따뜻함 * 0.40
+ 부드러운인상 * 0.30
+ 자연스러움 * 0.15
+ 청순함 * 0.10
+ (1 - 날카로운인상) * 0.05
```

### 5-5. 스타일리시/화려형

```text
스타일리시/화려형 =
  스타일리시함 * 0.40
+ 화려함 * 0.30
+ 시크함 * 0.15
+ 성숙함 * 0.10
+ 건강함 * 0.05
```

### 5-6. 건강/활동형

```text
건강/활동형 =
  건강함 * 0.50
+ 자연스러움 * 0.20
+ 스타일리시함 * 0.10
+ 따뜻함 * 0.10
+ (1 - 화려함) * 0.10
```

### 5-7. 성숙/분위기형

```text
성숙/분위기형 =
  성숙함 * 0.40
+ 청순함 * 0.15
+ 시크함 * 0.15
+ 지적단정함 * 0.15
+ 화려함 * 0.10
+ (1 - 귀여움) * 0.05
```

### 5-8. 지적/단정형

```text
지적/단정형 =
  지적단정함 * 0.45
+ 청순함 * 0.15
+ 자연스러움 * 0.15
+ 스타일리시함 * 0.10
+ 부드러운인상 * 0.10
+ (1 - 화려함) * 0.05
```

---

## 6. 남자 버킷 점수 계산

남자 이미지는 12축 measured vector를 8개 final bucket 점수로 변환한다.

### 6-1. 훈훈/부드러운형

```text
훈훈/부드러운형 =
  훈훈함 * 0.35
+ 부드러운인상 * 0.30
+ 자연스러움 * 0.15
+ 소년미 * 0.10
+ (1 - 날카로운인상) * 0.10
```

### 6-2. 댄디/단정형

```text
댄디/단정형 =
  댄디함 * 0.40
+ 지적단정함 * 0.25
+ 스타일리시함 * 0.15
+ 자연스러움 * 0.10
+ 훈훈함 * 0.10
```

### 6-3. 시크/날카로운형

```text
시크/날카로운형 =
  시크함 * 0.40
+ 날카로운인상 * 0.30
+ 스타일리시함 * 0.15
+ 남성미 * 0.10
+ (1 - 부드러운인상) * 0.05
```

### 6-4. 소년미/귀여운형

```text
소년미/귀여운형 =
  소년미 * 0.45
+ 훈훈함 * 0.20
+ 부드러운인상 * 0.15
+ 자연스러움 * 0.10
+ (1 - 남성미) * 0.10
```

### 6-5. 운동/건강형

```text
운동/건강형 =
  건강함 * 0.40
+ 체형탄탄함 * 0.30
+ 자연스러움 * 0.10
+ 남성미 * 0.10
+ 스타일리시함 * 0.10
```

### 6-6. 지적/안경형

```text
지적/안경형 =
  지적단정함 * 0.45
+ 댄디함 * 0.20
+ 자연스러움 * 0.10
+ 부드러운인상 * 0.10
+ 시크함 * 0.10
+ 스타일리시함 * 0.05
```

### 6-7. 강한 인상/남성미형

```text
강한 인상/남성미형 =
  남성미 * 0.35
+ 날카로운인상 * 0.20
+ 체형탄탄함 * 0.20
+ 건강함 * 0.15
+ 시크함 * 0.10
```

### 6-8. 스타일리시/개성형

```text
스타일리시/개성형 =
  스타일리시함 * 0.45
+ 시크함 * 0.15
+ 댄디함 * 0.15
+ 자연스러움 * 0.10
+ 날카로운인상 * 0.10
+ 남성미 * 0.05
```

---

## 7. final_bucket 배정 규칙

각 이미지마다 모든 버킷 점수를 계산한다.

```text
top_bucket = 점수가 가장 높은 버킷
second_bucket = 점수가 두 번째로 높은 버킷
gap = top_bucket_score - second_bucket_score
```

1차 자동 배정:

| 조건 | 처리 |
|---|---|
| top score >= 0.65, gap >= 0.08 | top_bucket으로 자동 배정 |
| top score >= 0.60, gap < 0.08 | hybrid 후보로 표시하고 사람 검수 |
| top score < 0.60 | 유형 신호 약함. candidate 또는 regenerate |

예시:

```json
{
  "id": "FI06",
  "bucket_scores": {
    "청순/자연형": 0.74,
    "성숙/분위기형": 0.75,
    "지적/단정형": 0.73
  },
  "bucket_gap": 0.01,
  "bucket_decision": "hybrid_review_required"
}
```

위 예시는 자동으로 한 버킷에 박지 않는다. 접촉 시트와 전체 수량을 보고 `성숙/분위기형`, `청순/자연형`, `지적/단정형` 중 부족한 쪽으로 배치할 수 있다.

---

## 8. 버킷 균형 맞추기

### 8-1. 과잉 버킷 처리

예를 들어 여자 이미지 분석 결과가 아래처럼 나오면:

```text
청순/자연형: 18장
귀여운/동안형: 5장
건강/활동형: 3장
시크/도도형: 6장
성숙/분위기형: 10장
...
```

청순/자연형 18장 중 최종 8장만 남긴다.

남기는 우선순위:

1. 청순/자연형 bucket score가 높은 이미지
2. 서로 얼굴형, 헤어, 옷, 배경이 다른 이미지
3. 점수대 분포를 망치지 않는 이미지
4. AI 티가 덜 나는 이미지
5. 다른 부족 버킷에도 강하게 걸치지 않는 이미지

나머지는 `candidate`로 내린다. 품질이 낮거나 중복이 강하면 `rejected`로 둔다.

### 8-2. 부족 버킷 처리

부족한 버킷은 새로 생성한다.

부족 버킷 예시:

```text
건강/활동형 목표 8장, 현재 measured 기준 3장
=> 건강/활동형 후보 5장 이상 재생성 필요
```

재생성할 때는 추상어를 줄이고 시각적 앵커를 강하게 넣는다.

나쁜 프롬프트:

```text
건강하고 활동적인 여성, 밝은 분위기
```

좋은 프롬프트:

```text
햇빛 아래 야외 러닝 후 휴식 중인 듯한 자연스러운 상반신 프로필.
탄탄하지만 과장되지 않은 어깨선, 낮은 포니테일, 민낯에 가까운 피부 표현,
스포츠 집업, 약간 붉어진 피부톤, 이마 잔머리, 활짝 웃지 않는 자연스러운 표정.
흰 블라우스, 긴 생머리, 청순한 카페 배경 금지.
```

### 8-3. 청순 쏠림 방지 규칙

여자 이미지는 기본적으로 청순/자연형으로 몰릴 가능성이 높다. 따라서 아래 유형은 프롬프트에 반대 조건을 명확히 넣는다.

| 목표 버킷 | 반드시 강화할 요소 | 피해야 할 요소 |
|---|---|---|
| 귀여운/동안형 | 둥근 얼굴, 짧은 하관, 장난기, 앞머리/단발/후드 | 긴 생머리, 흰 블라우스, 차분한 미소 |
| 시크/도도형 | 긴 눈매, 낮은 미소, 어두운 톤, 직선 눈썹, 날카로운 턱선 | 둥근 눈, 활짝 웃음, 밝은 니트 |
| 건강/활동형 | 야외광, 스포츠웨어, 묶은 머리, 탄탄한 어깨, 자연 피부톤 | 카페 창가, 흰 상의, 청순 긴 머리 |
| 스타일리시/화려형 | 액세서리, 레이어드 의상, 뚜렷한 스타일링, 도시 배경 | 무난한 니트, 무채색 카페 배경 |
| 성숙/분위기형 | 낮은 채도, 긴 얼굴형, 차분한 표정, 성숙한 헤어 | 동안 볼살, 큰 둥근 눈, 후드 |
| 지적/단정형 | 셔츠/니트, 단정한 헤어, 도서관/실내, 절제된 표정 | 화려한 메이크업, 스포티 배경 |

---

## 9. 점수 분포 재보정

최종 점수 분포도 `target_score`가 아니라 `measured_score` 기준으로 맞춘다.

성별별 64장 권장 분포:

| measured_score 구간 | 수량 |
|---|---:|
| 60~69 | 12 |
| 70~79 | 28 |
| 80~89 | 20 |
| 90~94 | 4 |

만약 60점대로 만든 이미지가 분석 결과 72점으로 나오면, 최종 분포에서는 70점대 이미지로 계산한다.

예시:

```text
FI01 target_score = 62
FI01 measured_score = 72
=> 최종 점수 분포에서는 70점대 1장으로 계산
```

이 규칙을 두는 이유:

- 사용자가 보는 것은 target이 아니라 실제 이미지다.
- 매칭과 선호 계산도 실제 이미지에 대한 반응이다.
- target 점수를 고집하면 현실보다 낮은 슬롯으로 착각하게 된다.

---

## 10. 사용자 선호 벡터 계산

월드컵 선택 결과는 단순히 선택한 이미지 평균만 쓰지 않는다. 이미지 풀 전체가 청순/자연형으로 치우쳐 있으면, 선택 평균도 자연스럽게 청순 쪽으로 높아지기 때문이다.

다만 쏠림 보정은 "청순함을 빼버리는 것"이 아니다. 사용자가 정말 청순한 이미지를 반복해서 고르면 매칭에서 청순한 상대를 기대할 수 있어야 한다. 그래서 선호 계산은 아래 신호를 분리해서 저장한다.

```text
preferred_appearance_vector = 사용자가 고른 이미지들의 measured_vector 평균
preferred_appearance_delta_vector = 사용자가 고른 이미지 평균 - 전체 풀 평균
preferred_axis_z_vector = 축별 풀 평균/표준편차 기준 표준화 값
preferred_axis_percentile_vector = 사용자가 고른 평균이 풀 안에서 몇 분위인지
preferred_choice_delta_vector = winner - loser 선택 차이의 가중 평균
preferred_score_range = 사용자가 선호한 외모 점수대
```

역할은 다르다.

| 값 | 의미 | 매칭에서의 역할 |
|---|---|---|
| `preferred_appearance_vector` | 사용자가 실제로 고른 이미지의 절대적 인상 | "어떤 외모를 기대하는가"의 중심값 |
| `preferred_appearance_delta_vector` | 전체 이미지 풀 대비 더 많이 고른 축 | 풀 쏠림을 제거한 취향 차이 |
| `preferred_axis_z_vector` | 축별 분산까지 고려한 상대 위치 | 청순처럼 평균이 높은 축의 미세한 차이 보정 |
| `preferred_axis_percentile_vector` | 선택 평균의 축별 분위 | 사용자가 풀 안에서 상위 청순을 골랐는지 확인 |
| `preferred_choice_delta_vector` | 직접 이긴 이미지와 진 이미지의 차이 | 실제 선택 순간의 방향성 |
| `preferred_score_range` | 선호 점수대 | 유형 취향과 외모 수준 선호를 분리 |

### 10-1. 전체 풀 평균

성별별 최종 64장에 대해 풀 평균과 축별 분포 통계를 계산한다.

```text
female_pool_mean_vector = 여자 64장 measured_vector 평균
male_pool_mean_vector = 남자 64장 measured_vector 평균
pool_axis_stats = 축별 mean, std, p10, p25, p50, p75, p90
```

예시:

```json
{
  "female_pool_mean_vector": {
    "귀여움": 0.58,
    "청순함": 0.69,
    "시크함": 0.34,
    "따뜻함": 0.61,
    "스타일리시함": 0.55,
    "건강함": 0.52,
    "성숙함": 0.50,
    "지적단정함": 0.60,
    "눈큼": 0.62,
    "부드러운인상": 0.66,
    "날카로운인상": 0.34,
    "자연스러움": 0.68,
    "화려함": 0.38
  }
}
```

### 10-2. 선택 평균

사용자가 선택한 이미지의 measured vector를 평균낸다.

```text
selected_mean_vector = 선택된 이미지들의 measured_vector 가중 평균
```

라운드별 가중치:

| 라운드 | 가중치 |
|---|---:|
| 64강 선택 | 1.00 |
| 32강 선택 | 1.15 |
| 16강 선택 | 1.35 |
| 8강 선택 | 1.60 |
| 4강 선택 | 1.90 |
| 결승 선택 | 2.30 |
| 최종 우승 이미지 | 2.80 |

후반 라운드로 갈수록 선택 의도가 강하다고 본다.

### 10-3. 델타 벡터

풀 전체가 이미 청순함 0.69인데 사용자가 고른 평균이 청순함 0.72라면 청순 선호는 약하다.

```text
delta_청순함 = 0.72 - 0.69 = 0.03
```

반대로 풀 평균 시크함이 0.34인데 사용자가 고른 평균 시크함이 0.62라면 시크 선호는 강하다.

```text
delta_시크함 = 0.62 - 0.34 = 0.28
```

이 델타값이 실제 취향 신호다.

하지만 이 값만으로 매칭하면 안 된다.

예를 들어 전체 풀 평균 청순함이 0.76이고 사용자가 고른 평균 청순함이 0.82라면 델타는 +0.06으로 작다. 그래도 풀 안에서 청순함 상위 15% 이미지만 고른 결과라면 "청순 선호가 약하다"고 보면 안 된다. 이 경우에는 아래 값이 함께 올라가야 한다.

```text
preferred_appearance_vector.청순함 = 0.82
preferred_axis_percentile_vector.청순함 = 0.85
preferred_axis_z_vector.청순함 = 양수
```

따라서 `preferred_appearance_delta_vector`는 과잉 해석을 막는 보정값이고, `preferred_appearance_vector`와 `preferred_axis_percentile_vector`는 사용자가 실제로 기대하는 외모 느낌을 보존하는 값이다.

### 10-4. pairwise 승패 신호

각 선택은 winner와 loser의 차이로도 기록한다.

```text
choice_delta = winner.measured_vector - loser.measured_vector
```

예시:

```text
사용자가 FI06을 FI01보다 선택
FI06 = 성숙함 0.73, 청순함 0.76, 귀여움 0.43
FI01 = 성숙함 0.28, 청순함 0.74, 귀여움 0.80

choice_delta:
성숙함 +0.45
귀여움 -0.37
청순함 +0.02
```

이 선택은 "청순함"보다는 "성숙함 선호, 귀여움 비선호" 신호로 더 강하게 해석된다.

최종 선호 계산은 아래 값을 조합한다.

```text
preferred_appearance_vector = selected_mean_vector
preferred_appearance_delta_vector = selected_mean_vector - pool_mean_vector
preferred_choice_delta_vector = weighted_choice_delta 평균
```

`preferred_axis_z_vector`는 아래처럼 계산한다.

```text
preferred_axis_z_vector[axis] =
  (selected_mean_vector[axis] - pool_mean_vector[axis]) / max(pool_axis_stats[axis].std, 0.05)
```

표준편차가 너무 작으면 해당 축은 이미지 풀에서 구분력이 부족하다는 뜻이다. 이 경우 z-score를 과신하지 않고, REVIEW.md에 축 커버리지 부족으로 기록한다.

### 10-5. 청순 선호가 사라지지 않게 하는 규칙

청순/자연스러움/부드러운인상은 여자 이상형 이미지에서 기본값이 높게 나올 가능성이 크다. 그래서 단순히 `selected_mean - pool_mean`만 쓰면 청순한 사람을 좋아하는 사용자도 청순 선호가 약하게 보일 수 있다.

이를 막기 위해 아래 규칙을 적용한다.

| 상황 | 해석 |
|---|---|
| 선택 평균 청순함이 높고, 풀 대비 델타도 높음 | 강한 청순 선호 |
| 선택 평균 청순함이 높고, 델타는 낮지만 percentile이 높음 | 풀 자체가 청순 쪽으로 높으나 사용자는 그 안에서도 청순 상위 이미지를 고름 |
| 선택 평균 청순함이 높지만 percentile이 보통이고 winner-loser 청순 차이가 낮음 | 청순 선호라기보다 이미지 풀 기본값 영향 |
| 선택 평균 청순함은 보통인데 시크/화려/성숙 delta가 높음 | 청순보다 다른 축 선호 |

운영 규칙:

- `preferred_appearance_vector`는 절대 낮추거나 중립화하지 않는다.
- `preferred_appearance_delta_vector`는 "어떤 축을 더 강하게 구분했는가"에만 쓴다.
- 청순처럼 평균이 높은 축은 `preferred_axis_percentile_vector`를 반드시 함께 본다.
- 최종 매칭에서 `preferred_appearance_vector.청순함`이 높으면 청순한 상대에 대한 기대값은 유지한다.
- 델타가 낮다는 이유만으로 청순 축 가중치를 0에 가깝게 만들지 않는다.

### 10-6. 점수 격차와 유형 격차 분리

월드컵에서 사용자가 A를 B보다 골랐다고 해서 항상 유형 취향이 드러난 것은 아니다. A가 B보다 measured_score가 훨씬 높으면, 사용자는 유형이 아니라 외모 수준 때문에 골랐을 수 있다.

따라서 pairwise delta는 아래 보정을 적용한다.

```text
score_gap = abs(winner.measured_score - loser.measured_score)
vector_distance = distance(winner.measured_vector, loser.measured_vector)

score_gap_penalty =
  score_gap <= 5  => 1.00
  score_gap <= 10 => 0.80
  score_gap <= 15 => 0.60
  score_gap > 15  => 0.40

type_signal_weight =
  score_gap_penalty * clamp(vector_distance / 0.35, 0.50, 1.20)
```

의미:

- 점수대가 비슷한 두 이미지 중 하나를 고른 선택은 유형 취향 신호가 강하다.
- 점수 차이가 큰 선택은 `preferred_score_range`에는 강하게 반영하되, 유형 벡터 delta에는 약하게 반영한다.
- vector distance가 너무 낮은 두 이미지는 서로 비슷한 이미지라 취향 신호가 약하다.

### 10-7. 저장 필드 확장

월드컵 종료 후 저장 결과는 아래 필드를 포함한다.

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

---

## 11. 매칭 계산 반영

사용자 A가 여성 이미지를 고른 남성이고, 사용자 B가 여성이라고 가정한다.

```text
A.preferred_appearance_vector
A.preferred_appearance_delta_vector
B.appearance_vector
```

기본 비교는 절대 선호 벡터를 중심으로 한다.

```text
absolute_fit =
  weighted_similarity(
    A.preferred_appearance_vector,
    B.appearance_vector,
    A.axis_preference_weights
  )
```

이 값이 가장 중요하다. 예를 들어 A가 청순함 0.82인 이미지를 많이 골랐다면, 청순함이 높은 B에게 점수가 올라가야 한다. 풀 평균이 높다는 이유로 이 기대값을 없애면 안 된다.

다음으로 취향 차이 신호를 비교한다.

```text
contrast_fit =
  directional_similarity(
    A.preferred_choice_delta_vector,
    B.appearance_vector - population_mean_vector
  )
```

`population_mean_vector`는 초기에는 모든 축 0.5 또는 월드컵 풀 평균으로 둔다. 실제 사용자 사진 분석 데이터가 충분히 쌓이면 성별별 실제 사용자 평균 벡터로 교체한다.

점수대 선호는 별도 신호로 계산한다.

```text
score_fit =
  score_range_fit(
    A.preferred_score_range,
    B.appearance_score_normalized
  )
```

축별 가중치는 아래 신호를 조합한다.

```text
axis_preference_weights[axis] =
  1.00
+ percentile_signal(axis) * 0.25
+ abs(preferred_choice_delta_vector[axis]) * 0.50
+ bucket_signal(axis) * 0.20
```

가중치 범위:

```text
0.75 <= axis_preference_weights[axis] <= 1.75
```

중요:

- `axis_preference_weights`는 어떤 축을 더 중요하게 볼지 정하는 값이다.
- `preferred_appearance_vector` 자체를 깎는 값이 아니다.
- 청순 델타가 작아도 선택 평균과 percentile이 높으면 청순 축 기대값은 유지한다.

최종 외모 선호 적합도:

```text
appearance_preference_fit =
  absolute_fit * 0.60
+ contrast_fit * 0.25
+ score_fit * 0.15
```

이렇게 세 값을 함께 쓰는 이유:

- `absolute_fit`은 사용자가 고른 이미지들의 절대적 느낌을 반영한다.
- `contrast_fit`은 이미지 풀의 기본 쏠림을 제거한 취향 차이를 반영한다.
- `score_fit`은 "유형 취향"과 "외모 수준 선호"를 분리한다.
- 청순형 이미지가 전체적으로 많아도, 사용자가 정말 청순을 선호하는지 보존하면서 과잉 해석은 줄일 수 있다.

---

## 12. 이미지 재평가 기준

이미지 생성 후 검수는 "사진이 괜찮아 보이는가"에서 끝나면 안 된다. 실제 목적은 사용자가 월드컵에서 고른 값이 매칭에 들어갔을 때 취향을 제대로 설명하는지 확인하는 것이다.

따라서 모든 후보 이미지는 아래 기준으로 다시 평가한다.

### 12-1. 시각 중복 평가

접촉 시트에서 각 이미지를 아래 요소별로 비교한다.

| 평가 항목 | 확인 내용 |
|---|---|
| 얼굴형 | 둥근형, 긴형, 계란형, 각진형, 하트형 등이 실제로 구분되는가 |
| 눈 | 눈 크기, 눈꼬리, 쌍꺼풀, 눈 사이 거리, 눈매 선이 반복되지 않는가 |
| 코 | 콧대 높이, 코끝, 코폭이 전부 비슷하지 않은가 |
| 입 | 입 크기, 입술 두께, 입꼬리, 미소 방식이 반복되지 않는가 |
| 귀 | 귀 노출 여부, 귀 크기, 귀 위치가 매번 복붙처럼 보이지 않는가 |
| 헤어 | 길이, 앞머리, 가르마, 묶음 여부, 웨이브, 색감이 충분히 다른가 |
| 체형 실루엣 | 목선, 어깨선, 상반신 핏, 네크라인이 반복되지 않는가 |
| 옷 | 색, 소재, 핏, 스타일이 한 방향으로 몰리지 않는가 |
| 표정 | 활짝 웃음, 낮은 미소, 무표정, 장난기, 차분함이 섞여 있는가 |
| 배경/조명 | 카페/실내/야외/도서관/도시/스튜디오가 충분히 분산되는가 |

중복 의심 등급:

| 등급 | 의미 | 처리 |
|---|---|---|
| A | 같은 사람의 다른 컷처럼 보임 | 둘 중 하나 regenerate 또는 rejected |
| B | 다른 사람이지만 얼굴 공식이 너무 비슷함 | 같은 버킷이면 하나만 active |
| C | 분위기는 비슷하지만 얼굴/헤어/옷이 구분됨 | active 가능 |

메타데이터에는 아래 값을 남긴다.

```json
{
  "visual_review": {
    "duplicate_risk": "A|B|C|pass",
    "similar_to": ["FI03"],
    "difference_notes": "눈매와 코가 비슷하지만 헤어/얼굴형/표정은 구분됨"
  }
}
```

### 12-2. vector 반영 평가

각 이미지는 생성 의도와 실제 분석값을 비교한다.

| 평가 항목 | 기준 |
|---|---|
| target-measured 일치 | target_type과 measured primary/final_bucket이 같은지 |
| 축 반영 | target에서 강화한 핵심 축이 measured_vector에서 실제로 높은지 |
| 반대 축 억제 | 시크형인데 부드러운인상/청순함이 과도하게 높지 않은지 |
| bucket gap | top bucket과 second bucket 차이가 충분한지 |
| 혼합 가치 | gap이 작아도 실제 선택 해석에 쓸 만한 혼합형인지 |

판정:

```text
pass = target과 measured가 대체로 일치하고 final_bucket 후보로 명확함
reassign = target과 다르지만 다른 final_bucket에서 유효함
hybrid = 두세 유형이 강하게 섞여 있어 사람 검수 필요
regenerate = 어떤 축도 명확하지 않거나 목표 축을 전혀 반영하지 못함
reject = AI 티, 중복, 품질 문제로 월드컵에 쓰기 어려움
```

중요한 점:

- target과 measured가 다르다고 무조건 실패가 아니다.
- 실제 매칭에는 measured를 쓰므로, 다른 버킷에서 유용하면 `reassign`한다.
- 하지만 모든 이미지가 청순/자연/부드러움으로만 읽히면 전체 풀 실패다.

### 12-3. 축 커버리지 평가

성별별 64장 active 풀은 각 축의 분포가 충분히 벌어져 있어야 한다. 그래야 사용자가 특정 축을 선호할 때 선택 결과가 실제로 드러난다.

각 축마다 아래 통계를 계산한다.

```text
mean, std, p10, p25, p50, p75, p90, min, max
spread = p90 - p10
```

권장 기준:

| 축 유형 | 최소 spread | 추가 조건 |
|---|---:|---|
| 일반 축 | 0.25 이상 | p90이 0.70 이상인 이미지가 있어야 함 |
| 청순함/자연스러움/부드러운인상 | 0.18 이상 | 평균이 높아도 p75/p90 구분이 가능해야 함 |
| 시크함/날카로운인상/화려함 | 0.30 이상 | 낮은 이미지와 높은 이미지가 명확해야 함 |
| 건강함/체형탄탄함 | 0.25 이상 | 의상만이 아니라 실루엣/분위기에서 구분돼야 함 |

청순 축의 특수 규칙:

```text
청순함 평균이 높아도 실패가 아니다.
실패는 청순함이 전부 0.65~0.78처럼 좁게 몰려서 선택 차이를 측정할 수 없는 상태다.
```

따라서 여자 64장에는 아래가 모두 있어야 한다.

- 청순함이 매우 높은 이미지
- 청순함은 높지만 귀여움/따뜻함과 섞인 이미지
- 청순함은 높지만 성숙/지적단정과 섞인 이미지
- 청순함이 낮고 시크/화려/건강 쪽이 강한 이미지

이렇게 해야 사용자가 청순한 이미지를 고를 때 "청순 선호"도 잡히고, 청순이 아닌 이미지를 고를 때 "청순보다 다른 축 선호"도 잡힌다.

### 12-4. 매칭 유효성 평가

최종 이미지셋은 가상 선택 시나리오로 검증한다.

| 시나리오 | 선택 패턴 | 기대 결과 |
|---|---|---|
| 청순 선호자 | 청순함 percentile 상위 이미지를 반복 선택 | `preferred_appearance_vector.청순함` 높음, percentile 높음 |
| 시크 선호자 | 시크/날카로운 이미지 반복 선택 | 시크함/날카로운인상 delta와 choice_delta가 높음 |
| 귀여움 선호자 | 둥근 얼굴/큰 눈/동안 이미지 반복 선택 | 귀여움/눈큼/부드러운인상 높음 |
| 성숙 선호자 | 성숙/분위기/지적 이미지 반복 선택 | 성숙함/지적단정함 높고 귀여움은 낮음 |
| 점수 우선 선택자 | 유형과 무관하게 높은 measured_score만 선택 | `preferred_score_range.mean` 높고 유형 delta는 약함 |

특히 청순 선호자 시나리오에서 아래처럼 나오면 실패다.

```text
사용자가 청순 상위 이미지만 골랐는데
preferred_appearance_vector.청순함은 높은데
매칭 가중치에서 청순함이 거의 무시됨
```

이 경우 델타 보정이 과하게 작동한 것이므로 `axis_preference_weights` 계산을 수정한다.

### 12-5. 브래킷 품질 평가

월드컵 대진도 취향 측정 품질에 영향을 준다. 64강 첫 라운드에서 점수 차이가 너무 큰 이미지를 붙이면 사용자는 유형이 아니라 외모 수준으로만 고를 가능성이 높다.

첫 라운드 대진 권장 규칙:

- 같은 `final_bucket`끼리 붙이지 않는다.
- measured_score 차이는 가능하면 8점 이하로 맞춘다.
- measured_vector distance는 0.20 이상이 되게 한다.
- 90점대 이미지는 한쪽 브래킷에 몰지 않는다.
- 같은 헤어/옷/배경의 이미지를 연속해서 보여주지 않는다.

선택 로그에는 아래 보조값을 저장한다.

```json
{
  "score_gap": 6,
  "vector_distance": 0.32,
  "type_signal_weight": 0.91
}
```

### 12-6. 최종 통과 기준

성별별 active 64장 기준으로 아래를 통과해야 한다.

- final_bucket 8개가 각 8장씩 존재한다.
- measured_score 분포가 목표 분포와 크게 어긋나지 않는다.
- 각 주요 축의 spread가 기준 이상이다.
- 접촉 시트에서 A등급 중복 의심이 없다.
- 같은 final_bucket 안에서 B등급 중복이 2쌍 이상이면 재생성한다.
- 청순/자연/부드러운 이미지가 많더라도 시크/건강/화려/성숙 축이 충분히 살아 있다.
- 가상 선택 시나리오에서 청순/시크/귀여움/성숙 선호가 서로 다른 결과 벡터로 나온다.

## 13. 이미지 품질 게이트

최종 active 이미지는 아래 조건을 통과해야 한다.

### 13-1. 파일 조건

- 3:4 세로형
- 최소 768x1024 이상
- 파일명과 metadata id 일치
- 글자, 로고, 워터마크 없음
- 실제 인물 사진을 가져온 것이 아님

### 13-2. 분석 조건

| 조건 | 기준 |
|---|---|
| `photo_quality.single_person` | true |
| `photo_quality.face_visible` | true |
| `photo_quality.lighting_ok` | true |
| `photo_quality.blurred` | false |
| `photo_quality.face_occluded` | false |
| `score_confidence` | 0.55 이상 권장 |
| `photo_quality.confidence` | 0.60 이상 권장 |

`heavy_filter_suspected=true`는 즉시 폐기 사유는 아니다. 생성 이미지 특성상 어느 정도 발생할 수 있다. 다만 아래 조건이면 재생성 후보로 둔다.

- `heavy_filter_suspected=true`이고 `photo_quality.confidence < 0.65`
- 내부 메모에 strong retouch, doll skin, plastic skin, celebrity profile 같은 표현이 있음
- 접촉 시트에서 AI 인형 느낌이 강함

### 13-3. 다양성 조건

성별별 64장 기준:

- 최소 122/128장 이상이 서로 다른 인물처럼 보여야 한다.
- 같은 final_bucket 8장 안에서도 최소 7장은 분명히 다른 사람처럼 보여야 한다.
- 한 버킷 안에서 같은 헤어, 같은 옷, 같은 표정, 같은 배경이 4장 이상 반복되면 실패로 본다.
- 여자 이미지는 긴 생머리, 흰 상의, 자연광, 부드러운 미소로 몰리면 실패다.
- 남자 이미지는 짧은 검은 머리, 셔츠, 무표정, 실내 배경으로 몰리면 실패다.

---

## 14. 생성 담당자 작업 순서

### Task 1. 후보 이미지 생성

**파일:**

- 읽기: `docs/IDEAL_WORLDCUP_64_DESIGN.md`
- 생성: `public/appearance-ideal/female-64/FI01.jpg ~ FI64.jpg`
- 생성: `public/appearance-ideal/male-64/MI01.jpg ~ MI64.jpg`

작업:

- [ ] target 설계표 기준으로 이미지 후보를 생성한다.
- [ ] 각 이미지는 실제 사용 프롬프트를 기록한다.
- [ ] 3:4 비율로 정규화한다.
- [ ] 성별별 접촉 시트를 만든다.

### Task 2. GPT 재분석

**파일:**

- 읽기: `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md`
- 읽기: `docs/APPEARANCE_ANALYSIS_SCHEMA.md`
- 읽기: `docs/APPEARANCE_VECTOR_CALIBRATION.md`
- 생성: `public/appearance-ideal/ANALYSIS_RAW.json`

작업:

- [ ] 생성된 모든 이미지를 GPT 분석기에 넣는다.
- [ ] JSON 외 텍스트가 섞인 결과는 실패로 처리한다.
- [ ] 각 이미지별 measured score, measured type, measured vector를 저장한다.
- [ ] 분석 실패 이미지는 재분석하거나 regenerate 상태로 둔다.

### Task 3. 버킷 점수 계산

**파일:**

- 생성 또는 수정: `public/appearance-ideal/METADATA.json`

작업:

- [ ] 각 이미지의 measured vector로 bucket_scores를 계산한다.
- [ ] top bucket, second bucket, gap을 계산한다.
- [ ] 자동 배정 가능한 이미지는 final_bucket을 지정한다.
- [ ] gap이 작은 이미지는 hybrid review 대상으로 표시한다.

### Task 4. 최종 64장 선별

**파일:**

- 수정: `public/appearance-ideal/METADATA.json`
- 생성: `public/appearance-ideal/female-64/CONTACT_SHEET.jpg`
- 생성: `public/appearance-ideal/male-64/CONTACT_SHEET.jpg`
- 생성: `public/appearance-ideal/REVIEW.md`

작업:

- [ ] 성별별 final_bucket이 8장씩인지 확인한다.
- [ ] 과잉 버킷은 8장만 active로 남긴다.
- [ ] 부족 버킷은 regenerate 목록을 만든다.
- [ ] measured_score 분포가 60/70/80/90점대 목표와 맞는지 확인한다.
- [ ] 접촉 시트로 얼굴/헤어/옷/배경 중복을 검수한다.
- [ ] 각 축의 `pool_axis_stats`를 계산해서 축별 spread가 충분한지 확인한다.
- [ ] 청순함/자연스러움/부드러운인상이 높게 몰린 경우에도 p75/p90 구분이 가능한지 확인한다.
- [ ] 가상 선택 시나리오로 청순/시크/귀여움/성숙 선호가 서로 다른 결과 벡터로 나오는지 검수한다.

### Task 5. 부족 버킷 재생성

**파일:**

- 수정: `public/appearance-ideal/female-64/*.jpg`
- 수정: `public/appearance-ideal/male-64/*.jpg`
- 수정: `public/appearance-ideal/METADATA.json`
- 수정: `public/appearance-ideal/REVIEW.md`

작업:

- [ ] 부족 버킷별로 프롬프트를 더 구체화한다.
- [ ] 청순 쏠림을 피하기 위한 반대 조건을 명시한다.
- [ ] 재생성 이미지를 다시 GPT 분석한다.
- [ ] final_bucket 수량이 맞을 때까지 반복한다.

### Task 6. 선호 벡터 계산 로직 반영

**파일:**

- 구현 위치는 실제 앱 구조 확인 후 결정한다.
- 계산 결과 필드는 아래 이름을 사용한다.

저장 필드:

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

작업:

- [ ] 선택한 이미지 평균 벡터를 계산한다.
- [ ] 전체 풀 평균을 뺀 delta vector를 계산한다.
- [ ] 축별 z-score와 percentile vector를 계산한다.
- [ ] winner-loser pairwise delta를 계산한다.
- [ ] score_gap과 vector_distance로 `type_signal_weight`를 계산한다.
- [ ] 후반 라운드 선택에 더 높은 가중치를 준다.
- [ ] 최종 결과를 매칭 시스템에 넘긴다.

### Task 7. 브래킷 생성 규칙 반영

**파일:**

- 구현 위치는 실제 앱 구조 확인 후 결정한다.
- 월드컵 대진 생성 함수는 metadata의 `final_bucket`, `measured_score`, `measured_vector`를 읽어야 한다.

작업:

- [ ] 64강 첫 라운드에서 같은 final_bucket끼리 붙지 않게 한다.
- [ ] 가능하면 measured_score 차이가 8점 이하인 이미지끼리 붙인다.
- [ ] measured_vector distance가 0.20 이상인 이미지끼리 붙인다.
- [ ] 90점대 이미지가 한쪽 브래킷에 몰리지 않게 분산한다.
- [ ] 선택 로그에 score_gap, vector_distance, type_signal_weight를 저장한다.

---

## 15. REVIEW.md에 반드시 남길 항목

`public/appearance-ideal/REVIEW.md`에는 아래 내용을 기록한다.

```text
1. 총 후보 이미지 수
2. 최종 active 이미지 수
3. 성별별 final_bucket 수량
4. measured_score 분포
5. target_type과 measured_type이 크게 어긋난 이미지 목록
6. 과잉 버킷에서 제외한 이미지 목록
7. 부족 버킷 재생성 목록
8. heavy_filter_suspected 비율
9. 접촉 시트 기준 중복 의심 이미지 목록
10. 축별 pool_axis_stats와 spread 통과 여부
11. 청순/자연/부드러움 쏠림 여부와 보정 판단
12. 가상 선택 시나리오 결과
13. 브래킷 대진 품질 검수 결과
14. 최종 사용 가능 여부
```

예시:

```markdown
## Target-Measured Mismatch

| id | target_type | measured_type | final_bucket | decision |
|---|---|---|---|---|
| FI06 | 귀여운/동안형 | 성숙/분위기형 | 성숙/분위기형 | active |
| FI08 | 귀여운/동안형 | 청순/자연형 | 청순/자연형 | candidate |
```

추가 예시:

```markdown
## Axis Coverage

| gender | axis | mean | std | p10 | p50 | p90 | spread | decision |
|---|---|---:|---:|---:|---:|---:|---:|---|
| female | 청순함 | 0.71 | 0.09 | 0.55 | 0.72 | 0.84 | 0.29 | pass |
| female | 시크함 | 0.36 | 0.16 | 0.15 | 0.32 | 0.66 | 0.51 | pass |

## Matching Simulation

| scenario | expected | observed | decision |
|---|---|---|---|
| 청순 선호자 | 청순함 absolute/percentile 높음 | 청순함 0.82, percentile 0.86 | pass |
| 점수 우선 선택자 | score mean 높고 유형 delta 약함 | score mean 84, max axis delta 0.05 | pass |
```

---

## 16. 현재 FI01~FI08 사례 해석

현재 GPT 분석 결과 기준으로 FI01~FI08은 생성 의도보다 청순/자연형, 성숙/분위기형, 지적/단정형으로 많이 읽혔다.

예시 해석:

| id | target_type | measured primary | measured 특징 | 처리 방향 |
|---|---|---|---|---|
| FI01 | 귀여운/동안형 | 귀여운/동안형 | 귀여움/부드러움 높음 | 귀여움 후보 유지 |
| FI02 | 귀여운/동안형 | 청순/자연형 | 청순/자연스러움 높음 | 청순 후보로 이동 가능 |
| FI03 | 귀여운/동안형 | 청순/자연형 | 청순/단정 쪽 | 청순 또는 지적단정 후보 |
| FI04 | 귀여운/동안형 | 귀여운/동안형 | 귀여움/따뜻함 강함 | 귀여움 후보 유지 |
| FI05 | 귀여운/동안형 | 청순/자연형 | 성숙/지적도 있음 | 청순 또는 성숙 후보 |
| FI06 | 귀여운/동안형 | 성숙/분위기형 | 성숙/청순/지적 강함 | 성숙 후보로 이동 |
| FI07 | 귀여운/동안형 | 지적/단정형 | 단정/청순/귀여움 혼합 | 지적단정 후보 |
| FI08 | 귀여운/동안형 | 청순/자연형 | 청순/성숙/따뜻함 | 청순 또는 성숙 후보 |

결론:

- FI01~FI08을 전부 귀여운/동안형으로 쓰면 안 된다.
- 실제로는 귀여운 후보 2장, 청순 후보 여러 장, 성숙/지적 후보 일부로 재배치해야 한다.
- 귀여운/동안형 final_bucket이 8장 필요하면 새 프롬프트로 추가 재생성해야 한다.

---

## 17. 완료 기준

이 계획이 완료되었다고 말하려면 아래를 모두 만족해야 한다.

- [ ] `public/appearance-ideal/METADATA.json`에 target, measured, final 값이 모두 있다.
- [ ] 성별별 active 이미지가 정확히 64장이다.
- [ ] 성별별 final_bucket이 8장씩이다.
- [ ] measured_score 분포가 목표 분포와 크게 어긋나지 않는다.
- [ ] 월드컵 선택 계산에서 `target_type`을 직접 쓰지 않는다.
- [ ] 매칭 계산에는 `measured_vector` 기반 값만 들어간다.
- [ ] `preferred_appearance_vector`로 사용자가 기대한 절대 외모 느낌을 보존한다.
- [ ] `preferred_appearance_delta_vector`로 풀 쏠림을 보정한다.
- [ ] `preferred_axis_percentile_vector`와 `preferred_axis_z_vector`로 청순 같은 고평균 축의 실제 선호를 보존한다.
- [ ] `preferred_choice_delta_vector`에 score_gap/type_signal_weight 보정을 반영한다.
- [ ] 브래킷이 점수 차이만으로 선택하게 만드는 구조가 아닌지 확인한다.
- [ ] `REVIEW.md`에 target-measured mismatch와 재생성 판단이 기록되어 있다.
- [ ] `REVIEW.md`에 축별 spread와 가상 선택 시나리오 결과가 기록되어 있다.
- [ ] 접촉 시트 기준으로 중복 얼굴/헤어/배경 쏠림이 통과된다.

---

## 18. 최종 원칙

이상형 월드컵 이미지는 "우리가 어떤 유형으로 만들려고 했는가"보다 "사용자가 실제로 어떤 인상으로 받아들이는가"가 중요하다.

따라서 최종 운영 원칙은 아래 한 줄로 정리된다.

```text
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

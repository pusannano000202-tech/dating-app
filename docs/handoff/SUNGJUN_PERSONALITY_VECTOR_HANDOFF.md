# 성준 인수인계: 성격 선호 벡터 설계 가이드

## 목적

외모 이상형 월드컵에서는 사용자가 어떤 외모 유형을 선호하는지 `primary / secondary` 형태로 요약하고, 내부적으로는 더 자세한 벡터와 선택 로그를 저장한다.

성격 파트도 월드컵처럼 진행할 필요는 없지만, 매칭에 쓰려면 같은 구조의 선호 신호가 필요하다.

- 사용자 본인의 성격: `self_personality_vector`
- 사용자가 좋아하는 상대 성격: `preferred_personality_vector`
- 사용자에게 보여줄 요약: `primary / secondary personality type`
- 매칭 엔진에 넣을 내부값: 축별 벡터, 유형별 가중치, 답변 로그, 신뢰도

핵심은 “좋은 성격 점수”를 만드는 것이 아니라 “이 사용자가 끌리는 상대 성격의 방향”을 만드는 것이다.

## 현재 외모 월드컵 방식 요약

외모 이상형 월드컵은 다음 흐름으로 구현되어 있다.

1. 후보 사진 64장을 준비한다.
2. 각 사진은 외모 절대점수 77점 이하만 사용한다.
3. 각 사진에는 `final_bucket`과 측정 벡터가 있다.
4. 매 라운드에서 사용자가 선택한 승자와 패자를 기록한다.
5. 라운드별 가중치를 적용해서 선호 벡터를 만든다.
6. 최종 우승자는 추가로 강하게 반영한다.
7. 내부적으로는 벡터와 로그를 저장하지만, 사용자에게는 `primary / secondary` 유형 정도만 보여준다.

현재 외모 쪽에서 중요한 출력값은 이런 형태다.

```ts
preferred_appearance_vector
preferred_appearance_delta_vector
preferred_choice_delta_vector
preferred_axis_percentile_vector
preferred_axis_z_vector
preferred_score_range
preferred_bucket_weights
choice_logs
meta
```

성격 파트도 이 구조를 참고하면 된다. 단, 성격은 사진 월드컵이 아니라 설문/선택형 질문으로 수집하는 게 맞다.

## 현재 성격 구현 상태

현재 앱에는 Big5 설문이 있다.

- 위치: `components/profile/Big5Survey.tsx`
- 결과 UI: `components/profile/Big5Result.tsx`
- 저장 흐름: `app/profile/survey/page.tsx`
- 타입: `lib/types.ts`

현재 Big5는 사용자의 “본인 성격”을 측정한다.

```ts
big5_openness
big5_conscientiousness
big5_extraversion
big5_agreeableness
big5_neuroticism
```

즉, 지금 있는 값은 “나는 어떤 사람인가”이고, 성준이 추가해야 하는 값은 “나는 어떤 성격의 상대에게 끌리는가”다.

## 성격 파트에서 새로 필요한 것

최소 목표는 아래 4개다.

1. 상대 성격 선호 벡터
2. 상대 성격 유형별 가중치
3. 사용자에게 보여줄 primary / secondary 성격 유형
4. 매칭에서 쓸 수 있는 답변 로그와 신뢰도

권장 저장 필드는 다음과 같다.

```ts
preferred_personality_vector: {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  emotional_stability: number
}

preferred_personality_delta_vector: {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  emotional_stability: number
}

preferred_personality_type_weights: {
  warm_empathic: number
  active_social: number
  calm_stable: number
  diligent_planned: number
  intellectual_curious: number
  free_individual: number
  direct_honest: number
  playful_humorous: number
}

preferred_personality_primary_type: string
preferred_personality_secondary_type: string | null
personality_preference_answer_logs: PersonalityPreferenceAnswerLog[]
personality_preference_confidence: number
```

`emotional_stability`는 Big5의 `neuroticism`을 뒤집은 값이다.

```ts
emotional_stability = 1 - neuroticism
```

사용자에게 “신경성 높음/낮음”이라고 보여주는 것보다 “정서적으로 안정적인 편” 같은 표현이 훨씬 자연스럽다.

## 추천 성격 유형

외모의 `final_bucket`처럼 성격도 공개용 유형 버킷이 있어야 한다. MVP에서는 8개 정도가 적당하다.

```ts
warm_empathic        // 다정/공감형
active_social        // 활동/외향형
calm_stable          // 차분/안정형
diligent_planned     // 성실/계획형
intellectual_curious // 지적/탐구형
free_individual      // 자유/개성형
direct_honest        // 솔직/직진형
playful_humorous     // 유머/장난기형
```

사용자에게는 이런 식으로 보여주면 된다.

```txt
당신은 다정/공감형 성격에 가장 끌리는 편이에요.
그리고 차분/안정형 분위기에도 자연스럽게 호감을 느끼는 경향이 있어요.
```

주의할 점은 벡터 원본이나 세부 점수를 그대로 보여주지 않는 것이다. 외모 월드컵처럼 내부 계산은 자세하게 하되, 공개 결과는 재미있고 부담 없는 수준으로 제한한다.

## 질문 설계 원칙

성격 선호는 “내 성격” 질문과 “내가 원하는 상대 성격” 질문을 분리해야 한다.

나쁜 예시:

```txt
나는 사람들과 어울리는 걸 좋아한다.
```

이건 본인 성격을 묻는 질문이다.

좋은 예시:

```txt
나는 사람들과 잘 어울리는 상대에게 끌린다.
```

이건 상대 성격 선호를 묻는 질문이다.

질문은 1~5점 리커트 척도를 권장한다.

```txt
1 전혀 아니다
2 아니다
3 보통이다
4 그렇다
5 매우 그렇다
```

계산할 때는 `1~5`를 `0~1`로 정규화한다.

```ts
normalized = (answer - 1) / 4
```

## 추천 질문 축

MVP는 Big5 기반 5축으로 시작하는 것이 좋다.

```ts
openness
conscientiousness
extraversion
agreeableness
emotional_stability
```

추후 고도화할 때는 연애 맥락 축을 추가할 수 있다.

```ts
communication_directness // 소통이 직설적인지 부드러운지
affection_expression     // 애정표현을 많이 하는지
conflict_style           // 갈등 때 대화형인지 회피형인지
planning_style           // 계획형인지 즉흥형인지
social_energy            // 집데이트/밖데이트 선호와 연결
independence             // 개인시간 존중 정도
humor_playfulness        // 장난기와 유머
care_empathy             // 배려와 공감
```

다만 처음부터 축을 너무 많이 만들면 매칭 점수가 불안정해진다. 우선 Big5 기반 선호 벡터를 만들고, 답변 로그가 충분히 쌓이면 연애 맥락 축을 추가하는 편이 안전하다.

## 유형 점수 계산 예시

각 유형은 축별 가중치로 계산한다.

```ts
warm_empathic =
  agreeableness * 0.45 +
  emotional_stability * 0.25 +
  conscientiousness * 0.15 +
  extraversion * 0.10 +
  openness * 0.05

active_social =
  extraversion * 0.55 +
  openness * 0.20 +
  agreeableness * 0.15 +
  emotional_stability * 0.10

calm_stable =
  emotional_stability * 0.50 +
  conscientiousness * 0.25 +
  agreeableness * 0.15 +
  extraversion * 0.10

diligent_planned =
  conscientiousness * 0.55 +
  emotional_stability * 0.20 +
  agreeableness * 0.15 +
  openness * 0.10

intellectual_curious =
  openness * 0.55 +
  conscientiousness * 0.20 +
  emotional_stability * 0.15 +
  extraversion * 0.10

free_individual =
  openness * 0.45 +
  emotional_stability * 0.20 +
  extraversion * 0.15 +
  agreeableness * 0.10 +
  (1 - conscientiousness) * 0.10

direct_honest =
  emotional_stability * 0.30 +
  extraversion * 0.25 +
  conscientiousness * 0.20 +
  agreeableness * 0.15 +
  openness * 0.10

playful_humorous =
  extraversion * 0.35 +
  openness * 0.30 +
  agreeableness * 0.20 +
  emotional_stability * 0.15
```

그 다음 모든 유형 점수를 합이 1이 되도록 정규화한다.

```ts
type_weight[type] = raw_type_score / sum(raw_type_scores)
```

`primary`는 가장 높은 유형, `secondary`는 두 번째로 높은 유형이다.

단, 1등과 2등 차이가 너무 크면 secondary를 안 보여줘도 된다.

```ts
if (secondary_score >= primary_score * 0.75) {
  show secondary
} else {
  secondary = null
}
```

## 매칭 점수에서 쓰는 방법

성격 매칭은 양방향으로 봐야 한다.

```ts
A가 좋아하는 성격 vs B의 실제 성격
B가 좋아하는 성격 vs A의 실제 성격
```

추천 구조:

```ts
personality_fit_A_to_B = similarity(
  A.preferred_personality_vector,
  B.self_personality_vector
)

personality_fit_B_to_A = similarity(
  B.preferred_personality_vector,
  A.self_personality_vector
)

personality_match_score =
  personality_fit_A_to_B * 0.5 +
  personality_fit_B_to_A * 0.5
```

거리 계산은 처음에는 단순하게 가도 된다.

```ts
similarity = 1 - weightedMeanAbsoluteDistance(preferred, actual)
```

이때 절대점수처럼 “성격이 좋은 사람”을 판단하면 안 된다. 어디까지나 선호 적합도다.

## DB 반영 제안

현재 `profiles`에 Big5 본인 성격이 저장된다면, 아래 필드를 추가하는 것을 권장한다.

```sql
preferred_personality_vector jsonb
preferred_personality_delta_vector jsonb
preferred_personality_type_weights jsonb
preferred_personality_primary_type text
preferred_personality_secondary_type text
personality_preference_answer_logs jsonb
personality_preference_confidence real
```

`preferred_personality_delta_vector`는 두 가지 방식 중 하나를 선택하면 된다.

1. `preferred - population_mean`
2. `preferred - self`

매칭용으로는 `preferred - self`도 유용하다. 예를 들어 본인은 내향적인데 상대는 외향적인 사람을 선호하는지, 본인과 비슷한 사람을 선호하는지 볼 수 있다.

추천은 둘 다 저장하는 것이다.

```ts
preferred_personality_population_delta_vector
preferred_personality_self_delta_vector
```

MVP에서는 이름을 줄이기 위해 하나만 저장해도 되지만, 나중에 매칭 설명을 만들려면 둘 다 있는 편이 좋다.

## 사용자 공개 원칙

공개해도 되는 것:

- primary 성격 유형
- secondary 성격 유형
- 짧은 설명 문장

공개하지 않는 것이 좋은 것:

- 축별 원점수
- z-score
- percentile
- 답변별 영향도
- “당신은 이런 성격을 싫어합니다” 같은 부정 문장

외모 월드컵과 동일하게, 사용자는 재미있는 요약만 보고 내부 계산은 매칭 품질에 사용한다.

## 구현 체크리스트

성준이 구현할 때 필요한 순서는 다음과 같다.

1. `PersonalityPreferenceVector` 타입 추가
2. `PersonalityTypeWeights` 타입 추가
3. 상대 성격 선호 질문 세트 작성
4. 답변을 `0~1` 벡터로 정규화
5. 유형별 점수 계산 함수 구현
6. `primary / secondary` 산출 함수 구현
7. DB 저장 필드 추가
8. 프로필 생성 플로우에서 성격 선호 설문 연결
9. 결과 화면에서는 primary/secondary만 노출
10. 매칭 점수에서 양방향 personality fit 반영

## 성준에게 꼭 전달할 주의점

성격 파트는 이상형 월드컵처럼 64강으로 만들 필요가 없다. 하지만 결과 데이터 구조는 외모 월드컵과 맞춰야 한다.

즉, UI는 설문이어도 결과는 아래처럼 나와야 한다.

```ts
{
  preferred_personality_vector,
  preferred_personality_type_weights,
  preferred_personality_primary_type,
  preferred_personality_secondary_type,
  personality_preference_answer_logs,
  personality_preference_confidence
}
```

이렇게 해두면 나중에 외모 선호, 성격 선호, 데이트 스타일 선호를 같은 방식으로 매칭 엔진에 넣을 수 있다.

## 미결정 사항

성준이 작업 전에 정해야 할 것:

1. 성격 선호 설문을 기존 Big5 설문 뒤에 붙일지, 별도 단계로 만들지
2. `neuroticism`을 내부에 그대로 쓸지, `emotional_stability`로 변환해서 쓸지
3. secondary 유형을 항상 보여줄지, 점수 차이가 가까울 때만 보여줄지
4. `preferred - self` 델타도 저장할지
5. 성격 매칭 비중을 전체 매칭 점수에서 몇 퍼센트로 둘지

권장 기본값:

```ts
use emotional_stability instead of public neuroticism
show secondary only when secondary >= primary * 0.75
store both preferred vector and preferred-self delta later
start with personality weight around 20~30% of total matching score
```

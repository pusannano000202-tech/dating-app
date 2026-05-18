# Codex 인수인계 프롬프트: 여자 이상형 월드컵 64장 이미지 생성

아래 내용을 다른 노트북의 Codex 또는 이미지 생성 담당 Codex에게 그대로 붙여넣어라.

---

너는 데이팅앱 프로젝트에서 **상대방 이상형 월드컵용 여자 이미지 64장**을 생성하는 작업을 맡는다.

이 작업은 자기유사 월드컵이 아니다.
사용자가 "나는 어떤 여성 외모를 선호하는가"를 고르는 이상형 월드컵용 이미지 풀이다.

## 절대규칙

1. 반드시 아래 MD 파일을 먼저 읽고 작업한다.

```text
docs/IDEAL_WORLDCUP_64_DESIGN.md
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
```

2. `docs/IDEAL_WORLDCUP_64_DESIGN.md`의 여자 설계표 FI01~FI64를 기준으로 이미지를 만든다.

3. `docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md`의 원칙을 반드시 따른다.

```text
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

4. 생성 의도 라벨인 `target.type`을 실제 매칭값으로 착각하지 마라.

5. 각 이미지는 생성 후 다시 GPT 분석기로 평가되어야 한다.

6. 최종 선호 계산에 쓰이는 값은 `measured.appearance_vector`다.

7. 청순/자연/부드러움 쏠림을 반드시 경계한다.

8. 하지만 청순 쏠림 보정이 청순 선호를 지워버리면 안 된다.

9. 사용자가 청순 상위 이미지를 반복 선택하면, 매칭에서 청순한 상대를 기대할 수 있어야 한다.

10. 여자 64장 중 최소 61장 이상은 접촉 시트에서 서로 다른 사람처럼 보여야 한다.

11. 같은 사람의 헤어/옷만 바꾼 것처럼 보이면 실패다.

12. 모든 이미지는 완전히 가상의 20대 초반 한국 대학생 여성이다.

13. 실존 인물, 연예인, 인플루언서, 유명인과 닮으면 안 된다.

14. 인터넷에서 실제 사람 사진을 가져오면 안 된다.

15. 이미지 안에 글자, 점수, 유형명, 워터마크, 로고를 넣지 마라.

16. 과한 노출, 선정적 구도, 화보식 글래머 포트레이트는 금지다.

17. 사용자에게 내부 점수/유형/벡터가 보이는 UI는 만들지 마라.

18. `public/appearance-self/`는 건드리지 마라.

19. `public/appearance-types/`와 섞지 마라.

20. 여자 이미지 작업만 한다. 남자 이미지는 이번 작업 범위가 아니다.

---

## 생성 목표

최종 결과:

```text
public/appearance-ideal/female-64/FI01.jpg ~ FI64.jpg
```

총 64장.

이미지 스펙:

```text
세로형 3:4 비율
최소 768x1024 이상
가슴 위 상반신 프로필 카드 구도
실제 데이팅 앱 프로필 사진 느낌
일반 휴대폰으로 찍은 현실적인 프로필 사진 느낌
글자/로고/워터마크 없음
과한 보정/화보 조명/AI 인형 피부 금지
```

점수 분포는 target 기준으로 먼저 설계하고, 생성 후 measured 기준으로 다시 확인한다.

권장 최종 measured 분포:

| measured_score 구간 | 수량 |
|---|---:|
| 60~69 | 12 |
| 70~79 | 28 |
| 80~89 | 20 |
| 90~94 | 4 |

60점대도 못생긴 이미지가 아니다.
현실적 호감형이지만, 너무 완벽한 AI 미녀처럼 만들면 안 된다.

---

## 여자 64장 유형 목표

여자 이상형 풀은 8개 final_bucket을 목표로 한다.

| final_bucket | 목표 수량 |
|---|---:|
| 귀여운/동안형 | 8 |
| 청순/자연형 | 8 |
| 시크/도도형 | 8 |
| 따뜻한/부드러운형 | 8 |
| 스타일리시/화려형 | 8 |
| 건강/활동형 | 8 |
| 성숙/분위기형 | 8 |
| 지적/단정형 | 8 |

중요:

- 이 수량은 최종적으로 measured 기준으로 맞춘다.
- FI01~FI08을 귀여운/동안형으로 만들었더라도 GPT 재분석 결과가 청순/성숙으로 나오면 해당 이미지는 청순/성숙 후보로 재배치한다.
- 부족한 final_bucket은 재생성한다.
- 과잉 final_bucket은 active 8장만 남기고 나머지는 candidate/rejected로 내린다.

---

## 공통 이미지 생성 프롬프트

각 FI ID별 프롬프트는 반드시 아래 공통 조건과 `docs/IDEAL_WORLDCUP_64_DESIGN.md`의 해당 행 정보를 합쳐서 만든다.

```text
완전히 가상의 20대 초반 한국 대학생 여성.
실존 인물, 연예인, 유명인과 닮지 않음.
상대방 이상형 월드컵용 기준 이미지.
세로형 3:4 비율, 가슴 위 상반신 프로필 카드 구도.
실제 데이팅 앱 프로필 사진 느낌.
일반 휴대폰으로 찍은 자연스러운 프로필 사진 느낌.
깨끗하지만 평범한 현실 배경.
과한 노출 없음, 선정적이지 않음.
글자, 로고, 워터마크 없음.
AI 글래머 포트레이트처럼 만들지 말 것.
스튜디오 화보나 연예인 프로필 사진처럼 보이면 실패.
현실적인 피부 질감, 작은 잡티, 약한 피부톤 차이, 자연스러운 그림자 허용.
얼굴 좌우를 완벽하게 대칭으로 만들지 말 것.
눈동자를 유리알처럼 만들지 말 것.
피부를 플라스틱처럼 매끈하게 만들지 말 것.
치아가 보이면 과하게 하얗거나 완벽한 치열처럼 만들지 말 것.
머리카락 경계가 헬멧처럼 매끈하지 않게 할 것.
잔머리, 삐져나온 머리, 옷 주름, 평범한 카메라 거리감을 유지할 것.
같은 얼굴을 헤어/옷만 바꿔 재사용한 느낌 금지.
```

---

## 각 이미지 프롬프트 작성 방식

각 이미지는 반드시 아래 요소를 모두 포함해 하나의 생성 프롬프트로 만든다.

```text
1. 공통 이미지 생성 프롬프트
2. ID: FI01~FI64
3. target_score
4. target_type
5. subtype
6. 핵심 프롬프트
7. 얼굴형
8. 눈매
9. 눈썹
10. 코
11. 입/입술
12. 귀 노출 여부와 귀 특징
13. 헤어 길이/가르마/앞머리/묶음/웨이브/머리색
14. 목선/어깨선/쇄골 노출 정도/네크라인
15. 옷 색/소재/핏
16. 표정
17. 배경/조명
18. 피해야 할 반대 조건
```

나쁜 프롬프트:

```text
귀엽고 청순한 여성, 자연광, 예쁜 얼굴.
```

좋은 프롬프트:

```text
FI01. target_score 62. target_type 귀여운/동안형. 둥근 얼굴 귀여움.
둥근 얼굴과 부드러운 볼, 큰 둥근 눈, 눈꼬리가 살짝 내려간 순한 눈매, 얇은 속쌍.
짧고 부드러운 일자 눈썹, 낮은 콧대, 둥근 코끝, 작은 입, 얇은 입술.
귀는 대부분 머리카락에 가려짐.
자연 흑발 턱선 단발, 짧은 앞머리, 고르지 않은 앞머리 끝, 잔머리.
밝은 니트, 높은 네크라인, 짧은 목선, 쇄골 노출 없음.
실내 자연광, 평범하고 깨끗한 실내 배경.
상위권 미녀처럼 너무 완벽하게 만들지 말 것.
긴 생머리, 흰 블라우스, 화보 조명, 플라스틱 피부 금지.
```

---

## 청순 쏠림 방지 규칙

여자 AI 이미지는 기본적으로 아래 방향으로 몰리기 쉽다.

```text
작은 타원형 얼굴
긴 흑발
흰색/크림색 옷
자연광
부드러운 미소
청순함/자연스러움/부드러운인상 높음
```

따라서 모든 이미지를 만들 때 아래를 확인한다.

| 목표 유형 | 반드시 강화 | 반드시 피함 |
|---|---|---|
| 귀여운/동안형 | 둥근 얼굴, 짧은 하관, 앞머리, 장난기, 단발/후드 | 긴 생머리, 흰 블라우스, 성숙한 표정 |
| 청순/자연형 | 낮은 화장, 자연광, 맑은 눈, 심플한 옷 | 화려한 액세서리, 진한 메이크업 |
| 시크/도도형 | 긴 눈매, 직선 눈썹, 낮은 미소, 어두운 톤 | 둥근 눈, 활짝 웃음, 밝은 니트 |
| 따뜻한/부드러운형 | 처진 눈매, 부드러운 볼, 카디건, 편안한 미소 | 날카로운 턱선, 강한 무표정 |
| 스타일리시/화려형 | 액세서리, 염색/레이어드, 도시 배경, 뚜렷한 스타일 | 무난한 니트, 평범한 카페 배경 |
| 건강/활동형 | 스포츠웨어, 묶은 머리, 야외광, 탄탄한 어깨선 | 흰 블라우스, 긴 생머리, 카페 창가 |
| 성숙/분위기형 | 긴 얼굴형, 낮은 채도, 차분한 표정, 성숙한 헤어 | 동안 볼살, 큰 둥근 눈, 후드 |
| 지적/단정형 | 셔츠/니트, 단정한 헤어, 도서관/실내, 절제된 표정 | 화려한 메이크업, 과한 액세서리 |

청순함 평균이 높은 것은 그 자체로 실패가 아니다.
실패는 모든 이미지가 비슷한 청순 얼굴로 몰려서 선택 차이를 측정할 수 없는 상태다.

---

## 생성 순서

작업은 아래 순서로 진행한다.

1. `docs/IDEAL_WORLDCUP_64_DESIGN.md` 읽기
2. `docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md` 읽기
3. 여자 FI01~FI64 설계표 확인
4. `public/appearance-ideal/female-64/` 폴더 생성
5. FI01~FI64 이미지 생성
6. 모든 이미지를 3:4 비율, 최소 768x1024 이상으로 정규화
7. `CONTACT_SHEET.jpg` 생성
8. 각 이미지에 실제 사용한 생성 프롬프트 기록
9. GPT 분석 프롬프트로 FI01~FI64 재평가
10. `ANALYSIS_RAW_FEMALE.json` 저장
11. measured_vector 기준 bucket_scores 계산
12. final_bucket 후보 지정
13. 점수 분포와 축 커버리지 계산
14. 중복/AI 티/청순 쏠림 검수
15. 부족한 final_bucket 재생성
16. 최종 active 64장 확정
17. `METADATA_FEMALE.json` 또는 통합 `METADATA.json` 작성
18. `REVIEW_FEMALE.md` 작성
19. git commit/push는 사용자가 요청한 경우에만 수행

---

## GPT 재평가 필수 항목

각 이미지는 GPT 분석 결과로 아래 값을 가져야 한다.

```json
{
  "id": "FI01",
  "measured": {
    "subject_gender": "female",
    "appearance_score_normalized": 72,
    "score_confidence": 0.68,
    "primary_type": "귀여운/동안형",
    "secondary_types": ["청순/자연형"],
    "appearance_vector": {
      "귀여움": 0.80,
      "청순함": 0.74,
      "시크함": 0.18,
      "따뜻함": 0.76,
      "스타일리시함": 0.48,
      "건강함": 0.58,
      "성숙함": 0.28,
      "지적단정함": 0.61,
      "눈큼": 0.68,
      "부드러운인상": 0.81,
      "날카로운인상": 0.18,
      "자연스러움": 0.72,
      "화려함": 0.24
    }
  }
}
```

`measured.appearance_vector`가 없으면 해당 이미지는 최종 active로 쓰면 안 된다.

---

## METADATA 구조

최종 메타데이터는 아래 구조를 따른다.

```json
{
  "id": "FI01",
  "gender": "female",
  "file": "public/appearance-ideal/female-64/FI01.jpg",
  "status": "active",
  "generation_round": 1,
  "target": {
    "score": 62,
    "type": "귀여운/동안형",
    "subtype": "둥근 얼굴 귀여움",
    "prompt": "실제로 사용한 이미지 생성 프롬프트"
  },
  "measured": {
    "subject_gender": "female",
    "appearance_score_normalized": 72,
    "score_confidence": 0.68,
    "primary_type": "귀여운/동안형",
    "secondary_types": ["청순/자연형"],
    "appearance_vector": {}
  },
  "bucket_scores": {
    "귀여운/동안형": 0.0,
    "청순/자연형": 0.0,
    "시크/도도형": 0.0,
    "따뜻한/부드러운형": 0.0,
    "스타일리시/화려형": 0.0,
    "건강/활동형": 0.0,
    "성숙/분위기형": 0.0,
    "지적/단정형": 0.0
  },
  "final_bucket": "귀여운/동안형",
  "matching_vector_source": "measured.appearance_vector",
  "visual_review": {
    "duplicate_risk": "pass",
    "similar_to": [],
    "difference_notes": ""
  },
  "review": {
    "target_measured_mismatch": false,
    "decision": "active",
    "accepted_reason": "",
    "rejection_reason": ""
  }
}
```

---

## REVIEW_FEMALE.md에 반드시 적을 내용

아래 항목을 빠뜨리지 마라.

```text
1. 총 생성 이미지 수
2. 최종 active 이미지 수
3. FI01~FI64 파일 존재 여부
4. 3:4 비율/해상도 통과 여부
5. measured_score 분포
6. final_bucket별 수량
7. target_type과 measured_type이 어긋난 이미지 목록
8. 재배치한 이미지 목록
9. 재생성한 이미지 목록
10. rejected/candidate 이미지 목록
11. 접촉 시트 기준 중복 의심 이미지 목록
12. AI 티가 강한 이미지 목록
13. heavy_filter_suspected 비율
14. 축별 pool_axis_stats
15. 축별 spread 통과 여부
16. 청순/자연/부드러움 쏠림 여부
17. 청순 선호가 매칭에서 사라지지 않는지 검수한 결과
18. 가상 선택 시나리오 결과
19. 최종 사용 가능 여부
```

---

## 축 커버리지 검수

여자 64장 active 풀은 각 축이 충분히 벌어져 있어야 한다.

각 축마다 아래 통계를 계산한다.

```text
mean, std, p10, p25, p50, p75, p90, min, max
spread = p90 - p10
```

권장 기준:

| 축 | 기준 |
|---|---|
| 일반 축 | spread 0.25 이상 |
| 청순함/자연스러움/부드러운인상 | spread 0.18 이상 |
| 시크함/날카로운인상/화려함 | spread 0.30 이상 |
| 건강함 | spread 0.25 이상 |

청순함 평균이 높아도 괜찮다.
하지만 청순함이 전부 비슷한 값이면 실패다.

---

## 매칭 유효성 시뮬레이션

최종 active 64장으로 아래 가상 선택 시나리오를 돌린다.

| 시나리오 | 선택 패턴 | 기대 결과 |
|---|---|---|
| 청순 선호자 | 청순함 percentile 상위 이미지만 선택 | preferred_appearance_vector.청순함 높음, percentile 높음 |
| 시크 선호자 | 시크/날카로운 이미지 반복 선택 | 시크함/날카로운인상 delta와 choice_delta 높음 |
| 귀여움 선호자 | 둥근 얼굴/큰 눈/동안 이미지 선택 | 귀여움/눈큼/부드러운인상 높음 |
| 성숙 선호자 | 성숙/분위기/지적 이미지 선택 | 성숙함/지적단정함 높고 귀여움 낮음 |
| 점수 우선 선택자 | 유형과 무관하게 높은 measured_score 선택 | preferred_score_range.mean 높고 유형 delta는 약함 |

특히 아래 상태면 실패다.

```text
사용자가 청순 상위 이미지를 골랐는데
preferred_appearance_vector.청순함은 높지만
매칭 계산에서 청순함이 거의 무시됨
```

이 경우 `preferred_axis_percentile_vector`와 `preferred_axis_z_vector`가 제대로 계산되는지 확인한다.

---

## 최종 산출물

아래 파일을 만든다.

```text
public/appearance-ideal/female-64/FI01.jpg
...
public/appearance-ideal/female-64/FI64.jpg
public/appearance-ideal/female-64/CONTACT_SHEET.jpg
public/appearance-ideal/ANALYSIS_RAW_FEMALE.json
public/appearance-ideal/METADATA_FEMALE.json
public/appearance-ideal/REVIEW_FEMALE.md
```

기존 통합 메타데이터를 사용하는 구조라면 아래도 갱신한다.

```text
public/appearance-ideal/METADATA.json
public/appearance-ideal/REVIEW.md
```

---

## 완료 보고 형식

작업 완료 후 아래 형식으로 보고한다.

```text
여자 이상형 월드컵 64장 생성 결과

1. 생성 완료 수:
2. active 수:
3. candidate 수:
4. rejected 수:
5. regenerate 수:
6. final_bucket별 수량:
7. measured_score 분포:
8. 중복 의심 이미지:
9. 청순 쏠림 검수 결과:
10. 축 커버리지 실패 축:
11. 재생성한 이미지:
12. 최종 사용 가능 여부:
13. 생성/수정한 파일:
14. 커밋 여부:
```

---

## 가장 중요한 한 줄

```text
여자 64장은 예쁜 사진 모음이 아니라, 사용자의 여성 외모 취향 벡터를 정확히 측정하기 위한 계측 도구다.
```

# 여성 이상형 64장 measured 벡터 1차 리뷰

## 전제

- 이 리뷰는 외부 OpenAI API 배치 호출 결과가 아니라, 현재 `CONTACT_SHEET_FI01_FI64.jpg` 기준 Codex/GPT 육안 1차 벡터화 결과다.
- 매칭 계산에는 `target.type`을 직접 쓰지 않고 `measured.appearance_vector`와 `final_bucket`을 쓴다.
- 노출/화려함/스타일만으로 삭제하지 않는다. 사용자가 실제로 고른 이미지의 measured 벡터가 무엇인지가 우선이다.

## 생성 파일

- `public/appearance-ideal/ANALYSIS_RAW_FEMALE.json`
- `public/appearance-ideal/METADATA_FEMALE.json`
- `public/appearance-ideal/FEMALE_VECTOR_SUMMARY.json`

## final_bucket 분포

| final_bucket | 수량 | 목표 8장 대비 |
|---|---:|---:|
| 귀여운/동안형 | 2 | -6 |
| 청순/자연형 | 12 | +4 |
| 시크/도도형 | 9 | +1 |
| 따뜻한/부드러운형 | 7 | -1 |
| 스타일리시/화려형 | 9 | +1 |
| 건강/활동형 | 8 | +0 |
| 성숙/분위기형 | 5 | -3 |
| 지적/단정형 | 12 | +4 |

## 핵심 판단

- target과 final_bucket이 다른 이미지는 17장이다.
- 이 차이가 바로 현재 문제의 핵심이다. 예를 들어 target이 귀여움이어도 실제 분석값이 청순/성숙/지적이면, 매칭에서는 청순/성숙/지적 선호로 반영해야 한다.
- 현재 세트는 사용 가능하지만, 최종 운영 전에는 부족 버킷을 추가 생성하고 과잉 버킷을 압축하는 단계가 필요하다.

## 부족/과잉

- 부족: {'귀여운/동안형': 6, '따뜻한/부드러운형': 1, '성숙/분위기형': 3}
- 과잉: {'청순/자연형': 4, '시크/도도형': 1, '스타일리시/화려형': 1, '지적/단정형': 4}

## 다음 작업

1. 실제 GPT Vision API 배치 분석을 붙이면 이 파일의 스키마 그대로 `ANALYSIS_RAW_FEMALE.json`을 교체한다.
2. `FEMALE_VECTOR_SUMMARY.json`의 부족 버킷을 기준으로 Manus/Codex에 추가 생성 요청을 한다.
3. 최종 64장은 target 기준이 아니라 measured `final_bucket` 기준으로 8장씩 맞춘다.
4. 월드컵 결과 집계는 선택 이미지들의 절대 평균 + 풀 대비 delta + z/percentile을 함께 계산한다.

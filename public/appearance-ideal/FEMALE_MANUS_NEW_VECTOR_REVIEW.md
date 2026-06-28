# Manus 신규 여성 이미지 80장 measured 벡터 리뷰

## 대상

- `NEW_FI01~NEW_FI64`: 새 전체 후보 세트
- `FI65~FI80`: 추가 보강 후보
- 총 80장

## 산출물

- `public/appearance-ideal/ANALYSIS_RAW_FEMALE_MANUS_NEW.json`
- `public/appearance-ideal/METADATA_FEMALE_MANUS_NEW.json`
- `public/appearance-ideal/FEMALE_MANUS_NEW_VECTOR_SUMMARY.json`
- `public/appearance-ideal/NEW_FEMALE_FILE_AUDIT.json`

## final_bucket 분포

| final_bucket | 수량 |
|---|---:|
| 귀여운/동안형 | 6 |
| 청순/자연형 | 7 |
| 시크/도도형 | 9 |
| 따뜻한/부드러운형 | 12 |
| 스타일리시/화려형 | 6 |
| 건강/활동형 | 13 |
| 성숙/분위기형 | 11 |
| 지적/단정형 | 16 |

## 점수대 분포

| 점수대 | 수량 |
|---|---:|
| 50점대 | 1 |
| 60점대 | 10 |
| 70점대 | 52 |
| 80점대 | 17 |

## 기존 부족 버킷 보강 후보

- 귀여운/동안형: ['NEW_FI02', 'NEW_FI04', 'NEW_FI07', 'NEW_FI12', 'NEW_FI13', 'NEW_FI16']
- 따뜻한/부드러운형: ['NEW_FI01', 'NEW_FI06', 'NEW_FI10', 'NEW_FI11', 'NEW_FI45', 'NEW_FI48', 'NEW_FI61', 'FI66', 'FI67', 'FI71', 'FI72', 'FI73']
- 성숙/분위기형: ['NEW_FI19', 'NEW_FI24', 'NEW_FI27', 'NEW_FI40', 'NEW_FI41', 'NEW_FI42', 'NEW_FI44', 'NEW_FI46', 'NEW_FI47', 'NEW_FI60', 'NEW_FI62']

## 판단

- 새 세트는 이전보다 현실형/평균형이 섞여 있어 점수 분포가 더 쓸만하다.
- 다만 여전히 청순/지적/따뜻 계열로 읽히는 이미지가 많아, 최종 64장 편성은 measured final_bucket 기준으로 해야 한다.
- `NEW_FI17~NEW_FI30`, `NEW_FI39~NEW_FI48`, `NEW_FI59~NEW_FI64`는 이전 세트보다 스타일/성숙/시크 구분에 유리하다.
- `FI65~FI80`은 평균권 보정 후보로 쓸 수 있어, 기존 세트가 너무 예쁜 쪽으로 치우치는 문제를 완화한다.

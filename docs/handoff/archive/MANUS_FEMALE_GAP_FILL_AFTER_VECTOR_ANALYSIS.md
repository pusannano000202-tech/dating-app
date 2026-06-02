# Manus 인수인계서: 여자 이미지 measured vector 분석 후 부족분 추가 생성

아래 내용은 여자 이상형 월드컵 64장 후보셋을 GPT로 벡터화한 뒤, 부족한 유형만 추가 생성할 때 Manus에게 전달할 프롬프트다.

---

너는 데이팅앱 프로젝트에서 **여자 이상형 월드컵 이미지셋의 부족한 벡터 축을 보강하는 작업**을 맡는다.

중요:

이번 작업은 무작정 예쁜 사진을 더 만드는 작업이 아니다.
이미 존재하는 여자 이미지 `FI01~FI64`를 GPT로 분석한 결과를 보고, 부족한 final_bucket과 부족한 appearance_vector 축을 채우는 작업이다.

## 반드시 먼저 읽을 문서

```text
docs/IDEAL_WORLDCUP_64_DESIGN.md
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
public/appearance-ideal/REVIEW_FEMALE.md
public/appearance-ideal/ANALYSIS_RAW_FEMALE.json
public/appearance-ideal/METADATA_FEMALE.json
```

만약 `ANALYSIS_RAW_FEMALE.json` 또는 `METADATA_FEMALE.json`이 아직 없다면, 먼저 GPT measured 분석을 완료해야 한다.

## 핵심 원칙

```text
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

즉, 파일명이 `FI33`이고 target이 스타일리시/화려형이라고 해서 그대로 스타일리시로 쓰면 안 된다.
GPT가 실제 이미지를 어떻게 분석했는지 보고 `final_bucket`을 정해야 한다.

## 노출/화보 느낌에 대한 새 기준

노출이 조금 있거나 화보 느낌이 있다는 이유만으로 폐기하지 않는다.

이상형 월드컵은 아래 축도 측정해야 한다.

```text
스타일리시함
화려함
건강함
성숙함
날카로운인상
체형/활동성 신호
```

따라서 어느 정도 강한 스타일, 건강미, 화려함은 유효한 측정 신호가 될 수 있다.

다만 아래는 금지다.

```text
선정적 구도
과한 성적 대상화
과한 노출 중심 사진
실제 데이팅 앱 프로필보다 광고/화보에 가까운 사진
같은 얼굴에 의상만 바꾼 사진
연예인/인플루언서 닮은 사진
```

## 작업 순서

1. `ANALYSIS_RAW_FEMALE.json`을 읽는다.
2. 각 이미지의 `measured.appearance_vector`를 확인한다.
3. `final_bucket`별 active 후보 수를 계산한다.
4. 각 축의 mean, std, p10, p50, p90, spread를 계산한다.
5. 부족한 final_bucket을 찾는다.
6. 부족한 vector 축을 찾는다.
7. 과잉 축을 확인한다.
8. 부족한 축을 보강하는 추가 후보 이미지를 생성한다.
9. 새 후보는 기존 64장과 같은 사람처럼 보이면 안 된다.
10. 새 후보도 GPT로 다시 분석한다.
11. measured 기준으로 active/candidate/rejected를 결정한다.

## 부족 유형 판단 예시

예를 들어 GPT 분석 결과가 아래처럼 나왔다고 하자.

```text
귀여운/동안형: 4장
청순/자연형: 16장
시크/도도형: 8장
따뜻한/부드러운형: 7장
스타일리시/화려형: 11장
건강/활동형: 5장
성숙/분위기형: 9장
지적/단정형: 4장
```

이 경우 추가 생성 우선순위:

```text
1. 귀여운/동안형 후보 추가
2. 지적/단정형 후보 추가
3. 건강/활동형 후보 추가
4. 따뜻한/부드러운형 후보 소량 추가
```

청순/자연형과 스타일리시/화려형은 이미 과잉이므로 더 만들지 않는다.

## 추가 생성 프롬프트 작성 방식

부족한 유형을 만들 때는 아래 형식을 따른다.

```text
목표 final_bucket:
부족한 measured vector 축:
피해야 할 과잉 축:
기존에 비슷한 이미지:
반드시 다르게 만들 얼굴형:
반드시 다르게 만들 눈매:
반드시 다르게 만들 코/입/귀:
반드시 다르게 만들 헤어:
반드시 다르게 만들 옷:
반드시 다르게 만들 배경:
현실감 조건:
금지 조건:
```

예시:

```text
목표 final_bucket: 귀여운/동안형
부족한 measured vector 축: 귀여움, 눈큼, 부드러운인상
피해야 할 과잉 축: 청순함, 성숙함, 지적단정함
기존에 비슷한 이미지: FI01, FI03
반드시 다르게 만들 얼굴형: 짧은 둥근 얼굴이 아니라 넓은 볼의 하트형 얼굴
반드시 다르게 만들 눈매: 큰 눈이지만 눈꼬리는 수평, 쌍꺼풀은 흐린 속쌍
반드시 다르게 만들 코/입/귀: 낮은 콧대, 둥근 코끝, 넓게 웃는 입, 한쪽 귀 선명히 보임
반드시 다르게 만들 헤어: 짧은 단발 금지, 낮은 양갈래 느낌의 묶음 또는 짧은 반묶음
반드시 다르게 만들 옷: 니트 금지, 밝은 후드/맨투맨
반드시 다르게 만들 배경: 창가/카페 금지, 캠퍼스 야외
현실감 조건: 일반 휴대폰 프로필 사진, 피부 질감, 잔머리, 옷 주름
금지 조건: 연예인 닮음, AI 인형 피부, 과한 보정, 흰 블라우스 청순 공식
```

## 산출물

추가 생성한 이미지는 기존 `FI01~FI64`를 바로 덮어쓰지 말고 후보 폴더에 저장한다.

```text
public/appearance-ideal/female-candidates/FC001.jpg
public/appearance-ideal/female-candidates/FC002.jpg
...
```

후보 메타데이터:

```text
public/appearance-ideal/female-candidates/METADATA_CANDIDATES.json
```

후보 접촉시트:

```text
public/appearance-ideal/female-candidates/CONTACT_SHEET_CANDIDATES.jpg
```

후보 리뷰:

```text
public/appearance-ideal/female-candidates/REVIEW_CANDIDATES.md
```

## 완료 보고 형식

```text
여자 이미지 부족 축 보강 결과

1. 분석한 기존 이미지 수:
2. 부족한 final_bucket:
3. 부족한 vector 축:
4. 과잉 final_bucket:
5. 과잉 vector 축:
6. 추가 생성한 후보 수:
7. 후보별 target:
8. 후보별 measured 결과:
9. active로 교체 추천할 기존 이미지:
10. candidate로 둘 이미지:
11. 최종 추천:
```

## 가장 중요한 한 줄

```text
사진을 보고 마음에 드는지 판단하지 말고, measured_vector 분포에서 부족한 취향 측정 축을 보강해라.
```

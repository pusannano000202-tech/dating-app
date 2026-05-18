# Manus 인수인계서: 여자 이상형 월드컵 64장 이미지 생성

아래 내용을 Manus에게 그대로 전달해라.

---

너는 데이팅앱 프로젝트에서 **상대방 이상형 월드컵용 여자 이미지 64장**을 완성하는 작업을 맡는다.

이 작업은 자기유사 월드컵이 아니다.
사용자가 "나는 어떤 여성 외모를 선호하는가"를 고르는 이상형 월드컵용 이미지 풀이다.

## 현재 상태

작업 디렉터리:

```text
C:\Users\82108\OneDrive\바탕 화면\데이팅앱만들기
```

현재 Codex가 새로 생성해서 덮어쓴 이미지:

```text
FI01 ~ FI20
```

확인 기준:

```text
public/appearance-ideal/REGENERATED_FEMALE_IDS.txt
```

현재 남은 작업:

```text
FI21 ~ FI64 생성
FI01 ~ FI20 포함 전체 64장 검수
비슷한 이미지 재생성
최종 접촉시트/메타데이터/리뷰 작성
```

중요:

- `public/appearance-ideal/CURRENT_PROGRESS.txt`에는 FI19까지라고 적혀 있을 수 있다.
- 최신 기준은 `REGENERATED_FEMALE_IDS.txt`이며, 실제로는 FI20까지 새로 생성되어 있다.
- FI01~FI20은 새 파일이지만, 최종 통과 확정은 아니다.

---

## 반드시 먼저 읽을 문서

아래 문서를 먼저 읽고 작업해라.

```text
docs/handoff/CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md
docs/IDEAL_WORLDCUP_64_DESIGN.md
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
```

특히 아래 파일이 가장 중요하다.

```text
public/appearance-ideal/FEMALE_TARGET_PROMPTS.json
```

이 파일에는 FI01~FI64 각각의 실제 이미지 생성 프롬프트가 들어 있다.
새 이미지를 만들 때는 이 JSON의 `target.prompt`를 기준으로 한다.

---

## 절대 원칙

1. 여자 이미지 작업만 한다.
2. 남자 이미지, 자기유사 이미지, 대표 타입 이미지는 건드리지 않는다.
3. `public/appearance-self/`는 건드리지 않는다.
4. `public/appearance-types/`는 건드리지 않는다.
5. 인터넷에서 실제 사람 사진을 가져오지 않는다.
6. 모든 이미지는 완전히 가상의 20대 초반 한국 대학생 여성으로 만든다.
7. 실존 인물, 연예인, 인플루언서, 유명인과 닮으면 안 된다.
8. 이미지 안에 글자, 점수, 유형명, 워터마크, 로고를 넣지 않는다.
9. 과한 노출, 선정적 구도, 화보식 글래머 포트레이트는 금지다.
10. 실제 데이팅 앱 프로필 사진처럼 현실감 있게 만든다.
11. 같은 얼굴에 헤어/옷만 바꾼 느낌이면 실패다.
12. 최종 64장 중 최소 61장 이상은 접촉시트에서 서로 다른 사람처럼 보여야 한다.

---

## 핵심 개념

이 프로젝트의 가장 중요한 원칙:

```text
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

뜻:

- `target.type`은 이미지 생성 목표다.
- 실제 매칭에는 `target.type`을 직접 쓰지 않는다.
- 생성된 이미지는 GPT 분석기로 다시 평가해서 `measured.appearance_vector`를 만든다.
- 사용자가 월드컵에서 고른 결과는 `measured.appearance_vector` 기준으로 계산한다.

예:

```text
FI06을 귀여운/동안형으로 만들었더라도
GPT 재평가 결과가 성숙/청순/지적이면
사용자가 FI06을 고른 의미는 귀여움 선호가 아니라 성숙/청순/지적 선호일 수 있다.
```

따라서 최종 메타데이터에는 target, measured, final_bucket을 모두 저장해야 한다.

---

## 현재 생성물에 대한 주의

FI01~FI20은 새로 생성되어 있다.

하지만 FI01~FI16은 접촉시트 기준으로 아직 비슷한 얼굴 공식이 남아 있다.
특히 귀여움/청순 구간이 아래 방향으로 몰리는 문제가 있다.

```text
작은 얼굴
긴 흑발 또는 단정한 흑발
흰색/크림색 옷
창가 자연광
부드러운 미소
비슷한 한국 AI 프로필 얼굴
```

기록된 재검수 후보:

```text
FI01/FI03
FI05/FI06/FI12/FI13/FI16
FI07/FI15
```

즉 Manus는 FI21~FI64를 계속 만들되, 마지막에 FI01~FI20도 반드시 접촉시트로 다시 보고 재생성 여부를 판단해야 한다.

---

## 생성해야 할 파일

최종 이미지:

```text
public/appearance-ideal/female-64/FI01.jpg
...
public/appearance-ideal/female-64/FI64.jpg
```

현재 FI01~FI20은 이미 존재한다.
우선 FI21부터 이어서 생성해라.
단, 최종 검수에서 FI01~FI20 중 비슷한 이미지는 다시 생성한다.

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

---

## 생성 순서

1. `docs/handoff/CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md`를 읽는다.
2. `public/appearance-ideal/FEMALE_TARGET_PROMPTS.json`을 읽는다.
3. `REGENERATED_FEMALE_IDS.txt`를 확인한다.
4. FI21부터 FI64까지 생성한다.
5. 각 이미지는 3:4, 768x1024 이상으로 저장한다.
6. 생성한 ID를 `REGENERATED_FEMALE_IDS.txt`에 추가한다.
7. FI01~FI64 전체 접촉시트를 만든다.
8. 시각 중복을 검수한다.
9. 너무 비슷한 이미지는 재생성한다.
10. 가능하면 GPT 분석 프롬프트로 FI01~FI64를 재평가한다.
11. `ANALYSIS_RAW_FEMALE.json`을 만든다.
12. `METADATA_FEMALE.json`을 만든다.
13. `REVIEW_FEMALE.md`를 만든다.

---

## 반드시 강하게 지켜야 할 다양성 기준

아래 요소가 64장 전체에서 반복되면 실패다.

```text
비슷한 작은 얼굴
비슷한 큰 눈
비슷한 코
비슷한 입꼬리
비슷한 귀 모양
비슷한 흑발 긴 머리
비슷한 흰색/크림색 옷
비슷한 창가 자연광
비슷한 부드러운 미소
```

각 이미지마다 아래가 달라야 한다.

```text
얼굴형
눈 크기
눈꼬리
쌍꺼풀/무쌍/속쌍
눈 사이 거리
눈썹 모양
콧대/코끝/코폭
입 크기/입술 두께/입꼬리
귀 노출 여부
헤어 길이/가르마/앞머리/묶음/웨이브/머리색
목선/어깨선/네크라인
옷 색/소재/핏
표정
배경/조명
```

---

## 유형별 주의사항

### FI21~FI24: 시크/도도형 남은 구간

앞의 귀여움/청순형과 확실히 달라야 한다.

강화:

```text
긴 눈매
눈꼬리 상승
낮은 미소 또는 무표정
직선 눈썹
블랙/그레이 의상
도시적 배경
날카로운 턱선
귀 노출 또는 얼굴선 노출
```

금지:

```text
둥근 큰 눈
활짝 웃음
파스텔 니트
흰 블라우스
첫사랑/청순 분위기
```

### FI25~FI32: 따뜻한/부드러운형

청순형과 겹치지 않게 해야 한다.

강화:

```text
웃는 눈
둥근 볼
편한 니트/카디건
집 같은 실내/카페
따뜻한 조명
부드러운 표정
```

금지:

```text
긴 생머리 흰 셔츠 청순 공식
너무 완벽한 작은 얼굴
시크한 블랙 스타일
```

### FI33~FI40: 스타일리시/화려형

무난한 프로필 사진처럼 나오면 실패다.

강화:

```text
컬러 니트
레이어드 의상
패턴 블라우스
재킷
염색 기운
액세서리
도시 거리/편집숍/패션 스튜디오
자신감 있는 표정
```

금지:

```text
흰 티
평범한 카페 자연광
청순한 긴 생머리
수줍은 미소
```

### FI41~FI48: 건강/활동형

섹시하게 만들면 안 된다.
활동적이고 건강한 현실 프로필이어야 한다.

강화:

```text
묶은 머리
스포티 집업
운동복
야외 운동장/공원/체육관
건강한 어깨선
생기 있는 표정
운동 후 잔머리
```

금지:

```text
과한 노출
몸매 강조
글래머 포즈
흰 블라우스
긴 생머리 카페 사진
```

### FI49~FI56: 성숙/분위기형

귀여움이나 청순형으로 돌아가면 실패다.

강화:

```text
긴 얼굴형
깊은 눈매
낮은 채도 옷
어두운 니트/재킷
차분한 미소
낮은 조명
고급 실내
절제된 표정
```

금지:

```text
동안 볼살
큰 둥근 눈
밝은 후드
활짝 웃음
파스텔 귀여움
```

### FI57~FI64: 지적/단정형

청순형과 겹치지 않게 안경/셔츠/도서관/단정함을 강하게 쓴다.

강화:

```text
단정한 셔츠
안경
책장/도서관/스터디룸/서재
낮은 묶음
중단발
절제된 미소
깔끔한 자세
```

금지:

```text
화려한 메이크업
스포티 배경
청순한 흰 블라우스만 반복
섹시한 스타일링
```

---

## GPT 재평가

가능하면 모든 이미지를 GPT 분석기로 다시 평가한다.

사용할 문서:

```text
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md
docs/APPEARANCE_ANALYSIS_SCHEMA.md
docs/APPEARANCE_VECTOR_CALIBRATION.md
```

저장 파일:

```text
public/appearance-ideal/ANALYSIS_RAW_FEMALE.json
```

각 이미지에는 아래 값이 있어야 한다.

```json
{
  "id": "FI21",
  "measured": {
    "subject_gender": "female",
    "appearance_score_normalized": 77,
    "score_confidence": 0.66,
    "primary_type": "시크/도도형",
    "secondary_types": [],
    "appearance_vector": {
      "귀여움": 0.0,
      "청순함": 0.0,
      "시크함": 0.0,
      "따뜻함": 0.0,
      "스타일리시함": 0.0,
      "건강함": 0.0,
      "성숙함": 0.0,
      "지적단정함": 0.0,
      "눈큼": 0.0,
      "부드러운인상": 0.0,
      "날카로운인상": 0.0,
      "자연스러움": 0.0,
      "화려함": 0.0
    }
  }
}
```

---

## 메타데이터

최종 메타데이터:

```text
public/appearance-ideal/METADATA_FEMALE.json
```

각 이미지 구조:

```json
{
  "id": "FI21",
  "gender": "female",
  "file": "public/appearance-ideal/female-64/FI21.jpg",
  "status": "active",
  "generation_round": 1,
  "target": {
    "score": 77,
    "type": "시크/도도형",
    "subtype": "선명한 이목구비",
    "prompt": "실제로 사용한 생성 프롬프트"
  },
  "measured": {
    "subject_gender": "female",
    "appearance_score_normalized": 0,
    "score_confidence": 0,
    "primary_type": "",
    "secondary_types": [],
    "appearance_vector": {}
  },
  "bucket_scores": {},
  "final_bucket": "",
  "matching_vector_source": "measured.appearance_vector",
  "visual_review": {
    "duplicate_risk": "pass|C|B|A",
    "similar_to": [],
    "difference_notes": ""
  },
  "review": {
    "target_measured_mismatch": false,
    "decision": "active|candidate|rejected|regenerate",
    "accepted_reason": "",
    "rejection_reason": ""
  }
}
```

---

## REVIEW_FEMALE.md에 적을 것

아래 파일을 반드시 만든다.

```text
public/appearance-ideal/REVIEW_FEMALE.md
```

포함 내용:

```text
1. 총 생성 이미지 수
2. FI01~FI64 파일 존재 여부
3. 새로 생성한 ID 목록
4. 재생성한 ID 목록
5. 최종 active 수
6. candidate/rejected/regenerate 수
7. final_bucket별 수량
8. measured_score 분포
9. target_type과 measured_type 불일치 목록
10. 접촉시트 기준 중복 의심 목록
11. AI 티가 강한 이미지 목록
12. 청순/자연/부드러움 쏠림 검수
13. 축별 spread 검수
14. 청순 선호가 매칭에서 사라지지 않는지 검수
15. 최종 사용 가능 여부
```

---

## 최종 산출물

반드시 아래 파일을 만든다.

```text
public/appearance-ideal/female-64/FI01.jpg ~ FI64.jpg
public/appearance-ideal/female-64/CONTACT_SHEET.jpg
public/appearance-ideal/female-64/CONTACT_SHEET_FI01_FI64.jpg
public/appearance-ideal/FEMALE_TARGET_PROMPTS.json
public/appearance-ideal/REGENERATED_FEMALE_IDS.txt
public/appearance-ideal/ANALYSIS_RAW_FEMALE.json
public/appearance-ideal/METADATA_FEMALE.json
public/appearance-ideal/REVIEW_FEMALE.md
```

---

## 완료 보고 형식

작업 완료 후 아래 형식으로 보고해라.

```text
여자 이상형 월드컵 64장 작업 결과

1. 최종 이미지 수:
2. 새로 생성한 ID:
3. 재생성한 ID:
4. active/candidate/rejected/regenerate 수:
5. final_bucket별 수량:
6. measured_score 분포:
7. 중복 의심 이미지:
8. AI 티가 강한 이미지:
9. 청순 쏠림 검수 결과:
10. FI01~FI20 재검수 결과:
11. 최종 사용 가능 여부:
12. 생성/수정한 파일:
13. 커밋 여부:
```

---

## 가장 중요한 한 줄

```text
여자 64장은 예쁜 사진 모음이 아니라, 사용자의 여성 외모 취향 벡터를 정확히 측정하기 위한 계측 도구다.
```

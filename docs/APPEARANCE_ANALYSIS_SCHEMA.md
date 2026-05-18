# 사용자 사진 외모 분석 결과 JSON 스키마

GPT Vision API 가 사용자 사진을 분석한 후 반환하는 JSON 의 정식 스키마.
프롬프트 본문은 `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md` 에 있다.
매칭 시스템에서 이 JSON 을 그대로 받아서 DB 에 저장하고, 매칭 엔진의 입력값으로 사용한다.

## 0. 전체 구조 한눈에 보기

```text
AppearanceAnalysisResult
├── subject_gender                  : "female" | "male"
├── appearance_score_normalized     : int [0, 100]   ← 사용자 노출 금지
├── score_confidence                : float [0, 1]   ← 사용자 노출 금지
├── primary_type                    : string         ← 유형명만 노출 가능
├── secondary_types                 : string[0..2]   ← 노출 가능
├── appearance_vector               : object         ← 사용자 노출 금지(매칭 입력)
├── visible_features                : object         ← 노출 가능(요약 카드용)
├── photo_quality                   : object         ← 일부만 노출(품질 안내용)
└── internal_notes                  : string         ← 사용자 노출 금지
```

노출 정책은 `docs/INTERFACE_CONTRACT.md` 의 `SafeAppearanceProfile` 타입과 일치한다.

## 1. JSON Schema (draft-2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://destiny.app/schema/appearance-analysis.json",
  "title": "AppearanceAnalysisResult",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "subject_gender",
    "appearance_score_normalized",
    "score_confidence",
    "primary_type",
    "secondary_types",
    "appearance_vector",
    "visible_features",
    "photo_quality",
    "internal_notes"
  ],
  "properties": {
    "subject_gender": {
      "type": "string",
      "enum": ["female", "male"]
    },
    "appearance_score_normalized": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "description": "한국 20대 대학생 모집단 기준 백분위 점수(percentile rank). 90=상위 10%, 50=평균, 30=하위 30%. 정의 출처는 public/appearance-self/SCORE_GUIDE.md. 사용자 노출 금지."
    },
    "score_confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "점수 자체의 신뢰도. 사진 품질, 정보 부족, 보정 의심 등을 종합."
    },
    "primary_type": {
      "type": "string",
      "description": "가장 강한 외모 유형 1개. 성별에 따라 enum 이 달라진다."
    },
    "secondary_types": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 0,
      "maxItems": 2
    },
    "appearance_vector": {
      "oneOf": [
        { "$ref": "#/$defs/FemaleVector" },
        { "$ref": "#/$defs/MaleVector" }
      ]
    },
    "visible_features": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "face_shape", "eye_impression", "hair_style",
        "makeup_or_grooming", "clothing_style", "overall_mood"
      ],
      "properties": {
        "face_shape":          { "type": "string", "maxLength": 40 },
        "eye_impression":      { "type": "string", "maxLength": 40 },
        "hair_style":          { "type": "string", "maxLength": 40 },
        "makeup_or_grooming":  { "type": "string", "maxLength": 40 },
        "clothing_style":      { "type": "string", "maxLength": 40 },
        "overall_mood":        { "type": "string", "maxLength": 40 }
      }
    },
    "photo_quality": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "single_person", "face_visible", "lighting_ok",
        "blurred", "heavy_filter_suspected", "face_occluded", "confidence"
      ],
      "properties": {
        "single_person":           { "type": "boolean" },
        "face_visible":            { "type": "boolean" },
        "lighting_ok":             { "type": "boolean" },
        "blurred":                 { "type": "boolean" },
        "heavy_filter_suspected":  { "type": "boolean" },
        "face_occluded":           { "type": "boolean" },
        "confidence":              { "type": "number", "minimum": 0.0, "maximum": 1.0 }
      }
    },
    "internal_notes": {
      "type": "string",
      "maxLength": 240,
      "description": "검수용 메모. 사용자에게 절대 노출 금지."
    }
  },
  "$defs": {
    "FemaleVector": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "귀여움", "청순함", "시크함", "따뜻함", "스타일리시함",
        "건강함", "성숙함", "지적단정함", "눈큼",
        "부드러운인상", "날카로운인상", "자연스러움", "화려함"
      ],
      "properties": {
        "귀여움":         { "type": "number", "minimum": 0, "maximum": 1 },
        "청순함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "시크함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "따뜻함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "스타일리시함":   { "type": "number", "minimum": 0, "maximum": 1 },
        "건강함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "성숙함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "지적단정함":     { "type": "number", "minimum": 0, "maximum": 1 },
        "눈큼":           { "type": "number", "minimum": 0, "maximum": 1 },
        "부드러운인상":   { "type": "number", "minimum": 0, "maximum": 1 },
        "날카로운인상":   { "type": "number", "minimum": 0, "maximum": 1 },
        "자연스러움":     { "type": "number", "minimum": 0, "maximum": 1 },
        "화려함":         { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "MaleVector": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "훈훈함", "댄디함", "시크함", "소년미", "건강함",
        "지적단정함", "남성미", "스타일리시함",
        "부드러운인상", "날카로운인상", "체형탄탄함", "자연스러움"
      ],
      "properties": {
        "훈훈함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "댄디함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "시크함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "소년미":         { "type": "number", "minimum": 0, "maximum": 1 },
        "건강함":         { "type": "number", "minimum": 0, "maximum": 1 },
        "지적단정함":     { "type": "number", "minimum": 0, "maximum": 1 },
        "남성미":         { "type": "number", "minimum": 0, "maximum": 1 },
        "스타일리시함":   { "type": "number", "minimum": 0, "maximum": 1 },
        "부드러운인상":   { "type": "number", "minimum": 0, "maximum": 1 },
        "날카로운인상":   { "type": "number", "minimum": 0, "maximum": 1 },
        "체형탄탄함":     { "type": "number", "minimum": 0, "maximum": 1 },
        "자연스러움":     { "type": "number", "minimum": 0, "maximum": 1 }
      }
    }
  }
}
```

## 2. 성별별 enum

### `primary_type` / `secondary_types` 허용값

여자(`subject_gender = "female"`):

```text
귀여운/동안형
청순/자연형
시크/도도형
따뜻한/부드러운형
스타일리시/화려형
건강/활동형
성숙/분위기형
지적/단정형
```

남자(`subject_gender = "male"`):

```text
훈훈/부드러운형
댄디/단정형
시크/날카로운형
소년미/귀여운형
운동/건강형
지적/안경형
강한 인상/남성미형
스타일리시/개성형
```

위 8개 외의 자유 텍스트는 거부한다. 백엔드 측에서 enum 미스매치 검증을 한다.

## 3. 예시 응답

### 3-1. 여자 — 청순형 상위권

```json
{
  "subject_gender": "female",
  "appearance_score_normalized": 74,
  "score_confidence": 0.82,
  "primary_type": "청순/자연형",
  "secondary_types": ["따뜻한/부드러운형", "지적/단정형"],
  "appearance_vector": {
    "귀여움": 0.42,
    "청순함": 0.78,
    "시크함": 0.16,
    "따뜻함": 0.64,
    "스타일리시함": 0.32,
    "건강함": 0.40,
    "성숙함": 0.35,
    "지적단정함": 0.58,
    "눈큼": 0.52,
    "부드러운인상": 0.69,
    "날카로운인상": 0.12,
    "자연스러움": 0.76,
    "화려함": 0.18
  },
  "visible_features": {
    "face_shape": "계란형",
    "eye_impression": "차분하고 맑은 눈매",
    "hair_style": "긴 생머리",
    "makeup_or_grooming": "낮은 화장",
    "clothing_style": "단정한 캐주얼",
    "overall_mood": "자연스럽고 차분한 인상"
  },
  "photo_quality": {
    "single_person": true,
    "face_visible": true,
    "lighting_ok": true,
    "blurred": false,
    "heavy_filter_suspected": false,
    "face_occluded": false,
    "confidence": 0.82
  },
  "internal_notes": "낮은 화장과 자연스러운 헤어, 차분한 표정. 청순/자연형 상위 호감 구간으로 판단."
}
```

### 3-2. 남자 — 시크 중위권

```json
{
  "subject_gender": "male",
  "appearance_score_normalized": 68,
  "score_confidence": 0.74,
  "primary_type": "시크/날카로운형",
  "secondary_types": ["댄디/단정형"],
  "appearance_vector": {
    "훈훈함": 0.22,
    "댄디함": 0.55,
    "시크함": 0.72,
    "소년미": 0.10,
    "건강함": 0.30,
    "지적단정함": 0.48,
    "남성미": 0.45,
    "스타일리시함": 0.46,
    "부드러운인상": 0.18,
    "날카로운인상": 0.65,
    "체형탄탄함": 0.35,
    "자연스러움": 0.50
  },
  "visible_features": {
    "face_shape": "갸름한 계란형",
    "eye_impression": "선명하고 차가운 눈매",
    "hair_style": "단정한 가르마 짧은 머리",
    "makeup_or_grooming": "기본 정돈",
    "clothing_style": "어두운 셔츠",
    "overall_mood": "도시적이고 절제된 인상"
  },
  "photo_quality": {
    "single_person": true,
    "face_visible": true,
    "lighting_ok": true,
    "blurred": false,
    "heavy_filter_suspected": false,
    "face_occluded": false,
    "confidence": 0.74
  },
  "internal_notes": "갸름한 얼굴선과 날카로운 눈매, 어두운 옷. 시크/날카로운형 중상 구간."
}
```

### 3-3. 하위권(과대평가 방지 예시)

GPT 가 평균 이상으로 매기고 싶어하는 충동을 누른 결과. 사진 보정/조명에도 불구하고 비례·정돈감이 평균 이하라고 판단되면 30~40점대를 정직하게 부여한다.

```json
{
  "subject_gender": "female",
  "appearance_score_normalized": 36,
  "score_confidence": 0.71,
  "primary_type": "따뜻한/부드러운형",
  "secondary_types": [],
  "appearance_vector": {
    "귀여움": 0.30,
    "청순함": 0.28,
    "시크함": 0.18,
    "따뜻함": 0.45,
    "스타일리시함": 0.22,
    "건강함": 0.40,
    "성숙함": 0.30,
    "지적단정함": 0.30,
    "눈큼": 0.32,
    "부드러운인상": 0.50,
    "날카로운인상": 0.18,
    "자연스러움": 0.55,
    "화려함": 0.15
  },
  "visible_features": {
    "face_shape": "둥근형",
    "eye_impression": "작고 차분한 눈",
    "hair_style": "어깨 길이 단발",
    "makeup_or_grooming": "거의 없음",
    "clothing_style": "베이지 니트",
    "overall_mood": "온화하지만 평범한 인상"
  },
  "photo_quality": {
    "single_person": true,
    "face_visible": true,
    "lighting_ok": true,
    "blurred": false,
    "heavy_filter_suspected": false,
    "face_occluded": false,
    "confidence": 0.71
  },
  "internal_notes": "이목구비 비례와 헤어 정돈감 평균 이하. 보정 흔적은 없음. 점수는 30점대 후반이 정직한 추정."
}
```

> 이 점수는 사용자에게 절대 노출되지 않는다. 매칭 시스템 내부에서 비슷한 점수대끼리 더 자주 매칭되는 데에만 쓰인다.

### 3-4. 사진 품질 불량(점수 산출 거부에 가까운 상태)

```json
{
  "subject_gender": "female",
  "appearance_score_normalized": 50,
  "score_confidence": 0.22,
  "primary_type": "따뜻한/부드러운형",
  "secondary_types": [],
  "appearance_vector": {
    "귀여움": 0.40, "청순함": 0.40, "시크함": 0.30, "따뜻함": 0.40,
    "스타일리시함": 0.35, "건강함": 0.40, "성숙함": 0.35, "지적단정함": 0.40,
    "눈큼": 0.40, "부드러운인상": 0.40, "날카로운인상": 0.30,
    "자연스러움": 0.45, "화려함": 0.30
  },
  "visible_features": {
    "face_shape": "판별 어려움",
    "eye_impression": "어두워 정확한 판별 어려움",
    "hair_style": "긴 머리 추정",
    "makeup_or_grooming": "판별 어려움",
    "clothing_style": "어두운 상의",
    "overall_mood": "조명 부족"
  },
  "photo_quality": {
    "single_person": true,
    "face_visible": false,
    "lighting_ok": false,
    "blurred": true,
    "heavy_filter_suspected": false,
    "face_occluded": false,
    "confidence": 0.22
  },
  "internal_notes": "조명 부족과 흐림으로 얼굴 판별 곤란. 점수는 보수적 평균(50)과 낮은 confidence 로 표기."
}
```

이 응답을 받은 백엔드는 `photo_quality.confidence < 0.5` 또는 `face_visible=false` 면 매칭 입력에서 제외하고, 사용자에게 "사진을 다시 등록해 주세요" 안내를 보낸다.

## 4. 필드 설명

### `subject_gender`
사진의 성별. `female` 또는 `male`. 사용자 메타데이터 우선, 없으면 사진 단서로 추정. 둘 다 불확실하면 분석 중단(`photo_quality.face_visible=false`).

### `appearance_score_normalized`
0~100 정수. 한국 20대 대학생 모집단 기준 **백분위 점수(percentile rank)**.

- 90 = 상위 10%
- 70 = 상위 30%
- 50 = 평균 부근
- 30 = 하위 30%
- 10 = 하위 10%

40점은 "나쁘지 않다" 가 아니라 모집단 하위 40% 라는 뜻. 호감도/매력도 점수가 아니다.

정의의 single source of truth 는 `public/appearance-self/SCORE_GUIDE.md`. 보정 기준은 `docs/APPEARANCE_VECTOR_CALIBRATION.md` 참조.

**사용자 노출 절대 금지.** `lib/types.ts` 에서도 이 필드는 `SafeAppearanceProfile` 타입에 포함되지 않는다.

### `score_confidence`
점수 자체의 신뢰도. 사진 품질이 낮거나, 화장/보정이 의심되거나, 단서가 부족할 때 낮춘다.
매칭 엔진은 이 값을 가중치로 사용한다. 점수 차이가 같아도 신뢰도가 낮은 사용자의 점수는 매칭 시 영향력이 줄어든다.

### `primary_type` / `secondary_types`
사용자에게 노출 가능한 외모 유형 라벨. 점수와 raw 벡터는 노출하지 않지만 유형은 노출해도 무방하다.
"청순/자연형" 처럼 한 사용자가 자기 유형을 알아도 매칭 품질에 직접 영향을 주지 않기 때문이다.

### `appearance_vector`
성별별 12~13축의 0~1 실수 벡터. 매칭 엔진의 핵심 입력값.
이 벡터는 `docs/IDEAL_WORLDCUP_64_DESIGN.md` 8.0 절의 이미지 벡터와 같은 축이며 같은 스케일이다.

매칭 시 코사인 유사도 또는 가중 L2 거리 사용.

### `visible_features`
사용자 노출 가능. 프로필 카드의 "내 외모 한 줄 분석" 같은 영역에 활용 가능.
"단정한 캐주얼, 차분한 인상" 같은 자유 텍스트지만 40자 이내로 강제.

### `photo_quality`
- `single_person=false` → 분석 거부
- `face_visible=false` → 분석 거부
- `confidence < 0.5` → 사용자에게 재업로드 안내
- `heavy_filter_suspected=true` → 점수에 보정 효과 빼고 더 낮게 매김

### `internal_notes`
검수용. 사용자에게 노출 절대 금지. 240자 이내 짧은 메모.
운영팀이 점수에 이의제기가 들어왔을 때 GPT 가 어떤 근거로 매겼는지 추적하는 용도.

## 5. 검증과 저장

### 백엔드 검증 흐름

```text
GPT 응답
→ JSON parse
→ JSON Schema validate (1번 섹션)
→ subject_gender 별 vector 키 정합 확인
→ primary_type / secondary_types enum 검증
→ photo_quality 정책 적용
→ DB 저장
```

JSON Schema validation 실패 시:

1. 즉시 같은 사진으로 1회 재시도(temperature=0).
2. 재시도도 실패하면 사용자에게 "분석에 실패했어요" 안내 후 사진 재업로드 요청.

### DB 저장 (예시 — 실제 컬럼명은 INTERFACE_CONTRACT.md 따름)

```sql
-- 사용자 프로필 외모 분석 컬럼 (RLS 잠금)
self_appearance_score        smallint       -- appearance_score_normalized
self_score_confidence        real           -- score_confidence
self_appearance_vector       jsonb          -- appearance_vector
self_primary_type            text           -- primary_type
self_secondary_types         text[]         -- secondary_types
self_visible_features        jsonb          -- visible_features
self_photo_quality           jsonb          -- photo_quality
self_internal_notes          text           -- internal_notes
self_analyzed_at             timestamptz    -- 분석 시각
```

`self_appearance_score`, `self_appearance_vector`, `self_internal_notes` 는 RLS 로 매칭 엔진 서비스 키 + 본인(읽기만) 만 접근 가능.

## 6. 매칭 엔진 입력 형태

매칭 엔진은 아래 두 가지 형태만 받는다.

```python
@dataclass
class AppearanceInputForMatching:
    user_id: str
    gender: Literal["female", "male"]
    score: int                       # 0~100
    score_confidence: float          # 0~1
    vector: dict[str, float]         # 성별별 12~13축
    preferred_vector: dict[str, float]  # 월드컵 결과
    preferred_score_band: str        # 예: "70~80점대"
```

매칭 엔진은 `internal_notes`, `visible_features`, `photo_quality` 를 읽지 않는다. 그 필드들은 검수와 사용자 노출용이다.

## 7. 변경 시 규칙

이 스키마를 변경하려면:

1. `docs/INTERFACE_CONTRACT.md` 의 `appearance_profile` 타입을 먼저 갱신.
2. `lib/types.ts` 의 `AppearanceProfile`, `SafeAppearanceProfile` 갱신.
3. `supabase/migrations/` 에 컬럼 변경 마이그레이션 추가 → 상대방 리뷰 필수.
4. `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md` 의 [출력 형식] 블록 갱신.
5. 이 문서의 1번 JSON Schema 갱신.
6. 4~5번 변경 후 동일 사진으로 회귀 테스트(점수 ±5 안정성).

벡터 축의 키 이름/개수는 월드컵 이미지 벡터와 같이 가야 한다. 어느 한쪽만 바꿔도 매칭 비교가 깨진다.

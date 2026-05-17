# Claude Code 다음 세션 인수인계서

> 작성일: 2026-05-17  
> 작성자: Claude Code (데스크탑 세션)  
> 대상: Claude Code (노트북 세션)

---

## 핵심 결정 사항 (이전 세션에서 확정)

### 외모 AI 방향 최종 확정

| 기능 | 이전 방향 | **확정된 방향** |
|------|-----------|----------------|
| 외모 절대점수 | SCUT-FBP5500 + ResNet-18 | **GPT-4o-mini Vision API** |
| 외모 타입 분류 | CLIP (openai/clip-vit-base-patch32) | **GPT-4o-mini Vision API** |
| 이상형 월드컵 | 6장 이미지 토너먼트 | **그대로 유지 (변경 없음)** |

**이유:**
- CLIP: 코사인 유사도 기준으로 모든 이미지가 62~67% 범위에 몰려 차별화 불가
- SCUT ResNet-18: 한국인 기준과 괴리, 점수 분포 32~52에 몰림, 육안 평가와 일치율 낮음
- GPT Vision: 한국인 기준으로 설명적 평가 가능, 코드 구현 단순, 비용 허용 가능 수준

---

## 지금 당장 해야 할 작업: `gpt_scorer.py` 구현

### 파일 생성 위치
`python/appearance/gpt_scorer.py`

### 구현 스펙

**1. 외모 절대점수 (appearance_score)**

```python
# GPT-4o-mini로 이미지 URL → 0~100 점수 반환
# 프롬프트 방향:
# - 한국 대학생 집단 내 상대적 외모 수준 평가
# - 1~10점 척도로 받아서 10배 → 0~100으로 환산
# - "외모가 뛰어난 사람이 10점, 평균이 5점, 매력이 덜한 편이 1~3점"
# - GPT가 관대하게 주는 경향 있음 → 프롬프트에 "엄격하게" 명시
```

**2. 외모 타입 분류 (appearance_type_scores)**

```python
# 여성 타입: cute, pure, chic, warm, stylish, healthy
# 남성 타입: warm, dandy, chic, cute, healthy, intellectual
# 각 타입별 0~100 점수 반환 (합계 100 아닌 독립 점수)
# JSON 형식으로 응답 강제
```

**3. 함수 시그니처**

```python
async def score_appearance(image_url: str, gender: str = "female") -> dict:
    """
    반환: {
        "appearance_score": float,  # 0~100
        "type_scores": {
            "cute": float, "pure": float, ...
        },
        "top_type": str
    }
    """
```

### 환경변수 추가 필요
```
OPENAI_API_KEY=sk-...  (충현에게 확인)
```

### `main.py` 연결

기존 `/api/score-photos` 엔드포인트가 `model.py`의 `score_photos()`를 호출하고 있음.
`gpt_scorer.py`로 교체하거나 병렬 실행 후 결과 병합하는 방식으로 연결.

---

## 현재 파일 상태

```
python/appearance/
├── main.py              ← FastAPI 서버 (엔드포인트 수정 필요)
├── model.py             ← SCUT ResNet-18 (→ gpt_scorer.py로 대체 예정)
├── clip_classifier.py   ← CLIP 분류기 (→ gpt_scorer.py로 대체 예정)
├── gpt_scorer.py        ← 🔴 아직 없음 — 이번 세션에 생성
├── requirements.txt     ← openai 패키지 추가 필요
└── .env.example         ← OPENAI_API_KEY 항목 추가 필요
```

---

## 절대 규칙 (CLAUDE.md + v1.5 추가)

- `lib/types.ts` 수정 → PR + 성준 리뷰 필수
- `supabase/migrations/` 신규 파일 → main 머지 전 성준 확인
- `main` 브랜치 직접 push 금지
- 성준 영역 (app/group/, app/match/, python/matching/, components/matching/) 건드리지 않기
- `self_appearance_vector` 사용자 화면 노출 절대 금지
- 세션 시작 전 `docs/CURRENT_STATE.md` 필독, 종료 후 업데이트

---

## 브랜치 전략

현재 작업 브랜치: `feature/claude/gpt-scorer` (새로 생성)  
PR 대상: `main` (성준 리뷰 후 머지)

---

## 참고: GPT 프롬프트 초안

### 외모 절대점수용

```
You are evaluating facial attractiveness of Korean college students.
Rate this person's appearance on a scale of 1 to 10, where:
- 10: Exceptionally attractive (top 5% among Korean college students)
- 7-8: Noticeably attractive (top 20%)
- 5: Average attractiveness
- 3-4: Below average
- 1-2: Significantly below average

Be strict and realistic. Most people score between 3 and 7.
Response format: {"score": <number 1-10>}
Only output valid JSON.
```

### 외모 타입 분류용 (female)

```
Analyze this Korean female college student's appearance and score each type (0-100, independent scores, not summing to 100):
- cute: round face, large soft eyes, youthful features, baby-face
- pure: natural minimal makeup, innocent expression, clean fresh look
- chic: sharp features, cool confident gaze, edgy/dark style
- warm: friendly approachable smile, soft kind eyes, cozy vibe
- stylish: trendy fashionable, on-trend accessories, modern look
- healthy: athletic toned, energetic complexion, sporty vibe

Response format: {"cute": 0-100, "pure": 0-100, "chic": 0-100, "warm": 0-100, "stylish": 0-100, "healthy": 0-100}
Only output valid JSON.
```

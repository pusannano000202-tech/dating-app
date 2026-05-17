# Codex 다음 세션 인수인계서

> 작성일: 2026-05-17  
> 작성자: Claude Code (데스크탑 세션)  
> 대상: Codex (노트북 세션)

---

## Codex의 현재 담당 작업

### 1. female-64 나머지 48장 생성 (최우선)

완료된 16장: F01, F02, F05, F08, F11, F16, F21, F22, F26, F27, F28, F29, F31, F54, F59, F63

**남은 48장:**
F03, F04, F06, F07, F09, F10, F12, F13, F14, F15, F17, F18, F19, F20,
F23, F24, F25, F30, F32, F33, F34, F35, F36, F37, F38, F39, F40, F41,
F42, F43, F44, F45, F46, F47, F48, F49, F50, F51, F52, F53, F55, F56,
F57, F58, F60, F61, F62, F64

**기준 문서:** `public/appearance-self/DESIGN_128.md`  
**저장 위치:** `public/appearance-self/female-64/`

### 2. male-64 전체 64장 생성

M01~M64, 저장 위치: `public/appearance-self/male-64/`

---

## 벡터 METADATA 형식 (v1.5 확정)

각 이미지에 대해 점수(0~100) + 6차원 외모 타입 벡터를 기록해야 함.

**여성 타입:** cute, pure, chic, warm, stylish, healthy  
**남성 타입:** warm, dandy, chic, cute, healthy, intellectual

**METADATA 형식:**
```markdown
| ID  | 점수 | cute | pure | chic | warm | stylish | healthy |
|-----|------|------|------|------|------|---------|---------|
| F01 | 20   | 15   | 10   | 5    | 20   | 8       | 12      |
```

**점수 기준:**
- 점수: 해당 이미지가 한국 대학생 기준으로 어느 정도 외모인지 (0=최하, 100=최상)
  - 20: 평균 이하
  - 50: 평균
  - 80: 상위권
  - 100: 최상위
- 벡터: 각 외모 타입에 얼마나 가까운지 독립 점수 (합계 100이 아님)

---

## 이미지 생성 스타일 가이드

**공통:**
- 한국 대학생 여성 (female-64) / 남성 (male-64) 외모
- 증명사진 스타일 또는 자연스러운 상반신 사진
- 흰 배경 또는 단색 배경 권장
- 실제 사진처럼 사실적인 렌더링

**점수대별 외모 수준:**
- F01~F20 (하위권, 점수 15~35): 평범한 외모, 특별한 매력 포인트 없음
- F21~F40 (중간, 점수 40~60): 평균적인 대학생 외모
- F41~F55 (상위권, 점수 65~80): 눈에 띄는 외모, 또래 집단 내 매력적
- F56~F64 (최상위, 점수 85~100): 모델급 외모

---

## 현재 파일 상태 확인

```bash
ls public/appearance-self/female-64/    # 현재 16장 확인
ls public/appearance-self/male-64/      # 아직 없음
```

---

## 브랜치 전략

작업 브랜치: `feature/codex/images-128`  
PR 대상: `main`

세션 시작 전 pull, 종료 후 push + PR.

---

## 절대 규칙

- `lib/types.ts` 수정 절대 금지 (Claude Code 영역)
- `python/` 수정 절대 금지 (Claude Code 영역)
- `app/` 수정 절대 금지 (프론트엔드는 Claude Code 영역)
- 이미지 생성 + METADATA 작성만 담당
- `docs/CURRENT_STATE.md` 세션 시작 전 필독, 종료 후 업데이트

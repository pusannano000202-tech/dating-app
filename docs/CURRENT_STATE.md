# Destiny 프로젝트 현재 상태 (단일 진실 소스)

> **마지막 업데이트**: 2026-05-17 (Claude Code — GPT Vision 방향 최종 확정)  
> **다음 세션 작업자**: Claude Code (노트북)  
> **이 파일을 읽지 않고 작업을 시작하지 말 것**

---

## 정식 용어 (이것만 사용)

| 개념 | 정식 이름 | 타입 |
|------|-----------|------|
| 이성 이상형 외모 타입 | `appearance_type` | `'cute'|'pure'|'chic'|'warm'|'stylish'|'healthy'` |
| 자기유사 월드컵 결과 | `self_appearance_vector` | `{ cute, pure, chic, warm, stylish, healthy }` (각 0~100) |
| 외모 AI 점수 | `appearance_score_normalized` | `number` (0~1 float) |
| 신규 자기유사 이미지 | `female-64/F01~F64`, `male-64/M01~M64` | - |
| 구 자기유사 이미지 | `female/`, `male/` (참고용, 더 이상 추가 작업 없음) | - |

---

## 전체 완료 현황

### Claude Code 완료 ✅
- 프로필 전체 플로우 UI (worldcup, self-worldcup, basic, photos, survey, schedule, preferences, complete, edit)
- Destiny 브랜딩 (Soul Orbs, 컬러 시스템, DestinyLogo)
- 외모 AI 서버 프로토타입 (python/appearance/) — 구조만, 실 가중치 없음
- AppearanceSelfWorldcup.tsx — 현재 구 이미지셋(female/, male/) 32장 중 8장 사용
- 랜딩 페이지 + 로그인 UI
- CLIP 분류기 프로토타입 (`clip_classifier.py`) — CLIP 정확도 한계 확인, GPT Vision으로 전환 결정
- SCUT-FBP5500 ResNet-18 프로토타입 (`model.py`) — HF 자동 다운로드 구현, 점수 정확도 한계 확인, GPT Vision으로 전환 결정

### Codex 완료 ✅
- 이성 이상형 이미지 6장: `public/appearance-types/` (cute, pure, chic, warm, stylish, healthy)
- 자기유사 구 이미지셋 64장: `public/appearance-self/female/` 32장 + `public/appearance-self/male/` 32장
- 신규 이미지셋(128장) 설계표: `public/appearance-self/DESIGN_128.md`
- 신규 여자 이미지 16장: `public/appearance-self/female-64/` (F01,F02,F05,F08,F11,F16,F21,F22,F26,F27,F28,F29,F31,F54,F59,F63)

---

## 현재 진행 중 🔄

| 작업자 | 작업 내용 | 시작일 | 상태 |
|--------|-----------|--------|------|
| Codex | female-64/male-64 이미지 생성 및 벡터 METADATA 작성 | 2026-05-17 | 진행 중 |
| Claude Code (노트북) | GPT Vision 외모 평가 서버 구현 (gpt_scorer.py) | 2026-05-17 | 대기 중 (다음 세션) |

> 세션 시작 시 이 표에 본인 작업을 추가하고 push할 것

---

## 다음 작업 목록 (우선순위 순)

### Codex 담당
1. **[긴급] 노트북 로컬 이미지 push** — 노트북에만 있는 female-64, male-64 이미지를 feature/codex/images-128 브랜치에 push
2. **female-64 나머지 완성** — F03,F04,F06,F07,F09,F10,F12~F15,F17~F20,F23~F25,F30,F32~F53,F55~F58,F60~F62,F64 (48슬롯)
3. **male-64 전체 생성** — M01~M64 (64슬롯)
4. **벡터 스코어 METADATA 작성** — 각 이미지(F01~F64, M01~M64)에 대해 6차원 점수 기록  
   형식: `{ cute: 80, pure: 30, chic: 10, warm: 70, stylish: 20, healthy: 40 }`

### Claude Code 담당
1. **[최우선] GPT Vision 외모 평가 서버 구현** — `python/appearance/gpt_scorer.py` 신규 작성
   - 외모 절대점수 (0~100) + 외모 타입 분류 (cute/pure/chic/warm/stylish/healthy) 모두 GPT-4o-mini Vision으로 처리
   - `main.py` 엔드포인트 연결, OPENAI_API_KEY 환경변수 추가
   - ⚠️ OPENAI_API_KEY 필요 — 충현에게 확인
2. **[대기 중] self_appearance_vector 타입 변경** — `lib/types.ts`의 `self_appearance_score: number` → `self_appearance_vector: SelfAppearanceVector`  
   ⚠️ Codex의 벡터 METADATA 작성 완료 후 진행, PR + 성준 리뷰 필요
3. **[대기 중] AppearanceSelfWorldcup.tsx 업데이트** — female-64/male-64 이미지 완성 후 교체
4. **Supabase 실키 연동** — 성준에게 URL/ANON_KEY 받으면 .env.local 세팅 후 E2E 테스트
5. **MatchingPool Supabase 실시간 구독** — 연동 후 작업

### 성준 담당 (별도 추적)
- 그룹 생성 / 매칭 엔진 / 결제 연동

---

## 중요 결정 사항 (확정)

| 결정 | 내용 | 날짜 |
|------|------|------|
| 앱명 | Destiny | 2026-05-15 |
| self_appearance_vector 도입 | 단일 점수 → 6차원 벡터 (cute/pure/chic/warm/stylish/healthy 각 0-100) | 2026-05-17 |
| 신규 이미지셋 | DESIGN_128.md 기반 female-64/male-64 (128장 총 세트) | 2026-05-15 |
| 구 이미지셋 처리 | female/, male/ 32장은 참고용으로 보존, 신규 작업 없음 | 2026-05-17 |
| **외모 절대점수 구현 방향** | **ResNet50 → ResNeXt-50 + SCUT-FBP5500 공식 가중치로 변경. 3단계 전략: 1)공식가중치 즉시적용 2)한국인 보정 레이어 3)실서비스 데이터로 재학습** | **2026-05-17** |
| **외모 절대점수 + 타입 분류 최종 결정** | **CLIP 및 SCUT ResNet-18 모두 정확도 한계 확인 → 외모 절대점수(0~100) + 타입 분류(cute/pure/chic 등) 둘 다 GPT-4o-mini Vision API로 처리. 이상형월드컵(appearance_type 선택)은 그대로 유지.** | **2026-05-17** |

---

## 변경 예고 (작업 전 합의 필요)

| 파일 | 변경 내용 | 제안자 | 상태 |
|------|-----------|--------|------|
| `lib/types.ts` | `self_appearance_score` → `self_appearance_vector` | Claude Code | Codex 벡터 완성 후 진행 예정 |
| `supabase/migrations/` | self_appearance_vector 컬럼 타입 변경 (FLOAT → JSONB) | Claude Code | 위와 동시 진행 |

---

## 현재 이미지 현황 (정확한 파일 수)

| 폴더 | 완성 수 | 목표 | 상태 |
|------|---------|------|------|
| `public/appearance-types/` | 6/6 | 6 | ✅ 완료 |
| `public/appearance-self/female/` | 32/32 | 32 | ✅ 완료 (구 세트, 참고용) |
| `public/appearance-self/male/` | 32/32 | 32 | ✅ 완료 (구 세트, 참고용) |
| `public/appearance-self/female-64/` | 16/64 | 64 | 🔄 진행 중 |
| `public/appearance-self/male-64/` | 0/64 | 64 | ⏳ 미시작 |

---

## 블로커

| 블로커 | 해제 조건 |
|--------|-----------|
| Supabase 실키 없음 | 성준이 URL/ANON_KEY 공유하면 해제 |
| self_appearance_vector 미구현 | Codex가 벡터 METADATA 완성하면 Claude Code가 types.ts PR 진행 |
| female-64 미완성 | Codex 작업 중 |

# Manus 인수인계서: 남자 이상형 월드컵 64장 이미지 생성 (MI01~MI64)

> 작성: 충현 / 2026-05-21
> 결정 근거: `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-06
> 우선순위: 🔴 Critical — 여자 사용자의 이상형 월드컵 자체가 동작하려면 필수

---

## 작업 개요

너는 **남자 사용자가 아닌, 여자 사용자가 풀이할 "이상형 월드컵"에 쓰일 남자 이미지 64장**을 만든다.

자기유사 월드컵 아님. 여자 사용자가 "나는 어떤 남자 외모를 선호하는가"를 고르는 이상형 월드컵용 풀.

## 현재 상태

```
public/appearance-ideal/male-64/   → 빈 폴더
public/appearance-ideal/METADATA.json   → male 항목 4개만 fixture 상태
```

여자 64장(FI01~FI116 중 최종 64장)은 이미 완료. 동일 절차를 남자에게 적용.

---

## 반드시 먼저 읽을 문서

```text
docs/handoff/MANUS_FEMALE_64_IMAGE_GENERATION_HANDOFF.md   ← 여자 작업 절차 (그대로 적용)
docs/handoff/CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md    ← target/measured 구분 핵심
docs/IDEAL_WORLDCUP_64_DESIGN.md                            ← 64장 설계표
docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md                 ← measured 벡터 설계
docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md                      ← GPT Vision 분석 프롬프트
docs/APPEARANCE_ANALYSIS_SCHEMA.md                          ← 분석 결과 JSON 스키마
docs/APPEARANCE_VECTOR_CALIBRATION.md                       ← 벡터 캘리브레이션
```

여자 작업의 최종 산출물(참고용):

```text
public/appearance-ideal/FEMALE_TARGET_PROMPTS.json
public/appearance-ideal/FEMALE_VECTOR_SUMMARY.json
public/appearance-ideal/FINAL_64_USAGE_SET.json
public/appearance-ideal/METADATA.json   (female 항목)
```

---

## 절대 원칙 (여자 작업과 동일)

1. 남자 이미지 작업만. 여자/자기유사/대표 타입 이미지는 건드리지 않음.
2. 인터넷 실제 사람 사진 사용 금지.
3. 모든 이미지는 완전히 가상의 20대 초반 한국 남자 대학생.
4. 실존 인물(연예인/인플루언서/유명인)과 닮으면 안 됨.
5. 이미지에 글자/점수/유형명/워터마크/로고 X.
6. 과한 노출/선정적 구도/화보식 포트레이트 X. 실제 데이팅 앱 프로필 톤.
7. 같은 얼굴에 헤어/옷만 바꾼 느낌이면 실패.
8. 최종 64장 중 최소 61장은 접촉시트에서 서로 다른 사람으로 보여야 함.

---

## 핵심 개념 (여자 작업에서 그대로 가져옴)

```
생성은 target 기준으로 하되, 선별과 매칭은 measured 기준으로 한다.
```

- `target.type`은 생성 목표 (예: chic / warm / stylish / healthy / smart / friendly)
- 생성 후 GPT Vision으로 `measured.appearance_vector` 측정
- 최종 64장 선별은 measured 벡터 분포 기반
- 매칭 엔진은 target_type을 **직접 쓰지 않음**

---

## 남자 6 버킷 (여자와 다름)

여자: `cute / pure / chic / warm / stylish / healthy`
남자 추천: `chic / warm / smart / friendly / stylish / healthy`

> 충현 결정 필요 시점: 남자 6 버킷 명명. 디폴트로 위 추천 사용해도 됨.
> v1.5 정의서 `appearance_type` enum 은 여자/남자 공통 6 enum. 남자 6 버킷도
> 매칭 엔진 입장에서는 enum 키만 다르면 됨. INTERFACE_CONTRACT.md 갱신 필요.

---

## 산출물 체크리스트

```
[ ] public/appearance-ideal/male-64/MI01.jpg ~ MI64.jpg (64장)
[ ] public/appearance-ideal/male-64/CONTACT_SHEET_MI01_MI64.jpg
[ ] public/appearance-ideal/MALE_TARGET_PROMPTS.json
[ ] public/appearance-ideal/MALE_VECTOR_SUMMARY.json
[ ] public/appearance-ideal/MALE_FILE_AUDIT.json
[ ] public/appearance-ideal/MALE_VECTOR_REVIEW.md
[ ] public/appearance-ideal/METADATA.json 의 male 항목 64개로 갱신
   (현재 male active 4개만 fixture)
```

---

## 진행 절차

1. 여자 작업 산출물을 그대로 읽고 자기 작업 디렉토리 정합
2. `MALE_TARGET_PROMPTS.json` 64개 작성 (6 버킷 균형)
3. 이미지 생성 (Stable Diffusion / Midjourney / 동등 도구)
4. GPT Vision으로 measured 벡터 측정
5. 측정값 기준으로 64장 선별 (여자 작업과 같은 77점 이하 컷오프 정책)
6. METADATA.json 갱신
7. 접촉시트 생성
8. 충현 검수

---

## 검수 기준

```
[ ] 64장 중 61장 이상이 접촉시트에서 서로 다른 사람으로 식별 가능
[ ] 6 버킷 분포 균형 (각 버킷 8~13장)
[ ] measured.appearance_score_normalized 분포가 0.45 ~ 0.85 범위에 골고루
[ ] 위반: 실존 인물 닮음 / 선정적 / 글자·워터마크 포함
```

---

## 충현이 추가로 결정해야 할 것

1. 남자 6 버킷의 정확한 이름 (위 추천 그대로 vs 변경)
2. 남자 풀의 점수 컷오프 (여자는 77점 이하, 남자 동일?)
3. 생성 도구 (Manus가 Codex처럼 자체 생성 vs 외부 도구 결과 받기)
4. 작업 기한

위 4개는 Manus 작업 시작 전 충현이 명시.

---

## 관련 기록

- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md` D-06 (이 작업의 결정 근거)
- `docs/handoff/MANUS_FEMALE_64_IMAGE_GENERATION_HANDOFF.md` (여자 버전 인수서)
- `docs/handoff/MANUS_FEMALE_GAP_FILL_AFTER_VECTOR_ANALYSIS.md` (여자 보충 작업 기록)

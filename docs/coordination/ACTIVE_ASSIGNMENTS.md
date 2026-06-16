# 현재 작업 배정판

최신 기준: 2026-06-15

이 문서는 팀장방이 현재 누가 무엇을 맡고 있는지 추적하기 위한 운영판이다.

## 현재 활성 작업

| 작업 | 역할 | 도구 표시 이름 | 상태 | 소유 범위 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 없음 | 팀장방 | - | 대기 | - | 다음 작업 배정 전 |

## 최근 완료된 하위 직원 작업

| 작업 | 역할 | 결과 |
| --- | --- | --- |
| 현재 앱 흐름 조사 | Noether 성격 임시 조사 | Manus 인수인계서에 반영 |
| 맛집/네이버지도 UX 조사 | Bernoulli 성격 임시 조사 | `venues.map_url` 수동 링크 MVP 방향 확인 |
| 논쟁카드 이미지 프롬프트/위치 조사 | McClintock/Pascal 성격 임시 조사 | `public/daily-cards/debate/` 기준 확정 |
| 논쟁카드 이미지 생성 | Pascal | 이미지 8개 생성 완료 |
| 고정 역할제 문서화 | 팀장방 | `docs/coordination/*` 운영 문서 정리 |
| 프론트 전체 동선 구조 감사 | Noether | 홈/매칭/데일리카드/알림 흐름 조사 완료. 시간/장소 배정 순서, 카드 공개 범위, 앱 셸 부재 위험 보고 |
| 프론트 UX/디자인 감사 | McClintock | 홈/매칭 하단 분류 부재, 카드 용어 혼선, 한 화면 과다 누적 문제 보고 |

## 현재 커밋 전 변경 묶음

| 묶음 | 파일 | 상태 |
| --- | --- | --- |
| 데일리카드 항목별 작성/논쟁카드 | `app/match/[id]/page.tsx`, `app/match/page.tsx`, `lib/matching/daily-card-authoring.ts`, `tests/matching/daily-card-authoring.test.ts` | 커밋 전 |
| Manus 프론트 동선 인수인계 | `docs/handoff/active/MANUS_FRONTEND_FLOW_HANDOFF_2026-06-15.md` | 커밋 전 |
| 논쟁카드 이미지 에셋 | `public/daily-cards/debate/*` | 커밋 전 |
| 팀장방 운영 문서 | `docs/coordination/*` | 커밋 전 |

## 다음 추천 배정

| 우선순위 | 작업 | 추천 역할 |
| --- | --- | --- |
| 1 | Phase 11 구현 승인 받기 | 팀장방 |
| 2 | 하단 탭/홈 오늘 할 일/사전 힌트 wizard/논쟁 이미지 카드/알림 문구 구현 | Darwin |
| 3 | 현재 변경분을 기능 묶음별로 분류하고 커밋 준비 | 팀장방 |
| 4 | 카드 공개 범위와 시간/장소 배정 순서 DB/API 검증 | Bernoulli |
| 5 | 부산대 맛집 seed 초안과 맛집 3곳 선택 UI 계획 | Bernoulli + McClintock |

## 최근 감사에서 나온 팀장방 판단 후보

| 우선순위 | 내용 | 추천 처리 |
| --- | --- | --- |
| P0 | 작성용 카드와 하루 공개 카드가 같은 말로 섞임 | 작성 단계는 `사전 힌트`, 공개 단계는 `오늘의 카드`로 분리 |
| P0 | 하루 1장 공개 카드가 통합 `content_text` 전체를 보여줄 위험 | Bernoulli에게 DB/API 저장 구조와 공개 RPC 분리 검토 배정 |
| P0 | 양측 확정 후 시간/장소 배정 순서가 끊길 가능성 | Bernoulli에게 `confirm_match` 순서와 local DB 검증 배정 |
| P1 | 홈/매칭/알림이 앱 셸로 묶이지 않음 | Darwin에게 하단 탭/홈 오늘 할 일 UI 구현 배정 전 설계 확정 |
| P1 | `app/match/[id]/page.tsx`에 기능이 너무 몰림 | 카드 작성 영역부터 컴포넌트 분리 |

## 운영 메모

- 하위 직원이 새로 생기면 이 문서에 역할명과 도구 표시 이름을 함께 남긴다.
- worker 결과는 `WORKER_REPORT_TEMPLATE.md` 형식으로 받아서 팀장방이 취합한다.
- 커밋 전에는 `git status` 기준으로 기능 묶음을 다시 분류한다.

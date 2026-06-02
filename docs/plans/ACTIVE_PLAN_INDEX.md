# Active Plan Index

마지막 업데이트: 2026-06-02

## 지금 기준 제품 방향

과팅의 핵심 흐름은 다음 순서로 정리한다.

1. 사용자가 친구를 모아 1:1 또는 그룹 과팅 단위를 만든다.
2. 보증금 없이 매칭 큐에 들어간다.
3. 시스템이 상대 개인 또는 상대 그룹을 가매칭한다.
4. 양쪽 참여자가 익명 카드 정보를 작성한다.
5. 카드 작성 후 보증금을 결제한다.
6. 양쪽 조건이 충족되면 매칭이 확정된다.
7. 실제 만남까지 5~7일 동안 하루 하나씩 상대 정보 카드가 열린다.

## 활성 계획

| 문서 | 목적 | 상태 |
|---|---|---|
| [가매칭 카드-보증금 흐름 설계](../product/matching/2026-06-02-proposed-match-card-deposit-flow.md) | 보증금 선결제 제거, 카드 작성 후 보증금 결제, 익명 멤버 카드 공개 설계 | 진행 중 |
| [구현 계획](../product/matching/2026-06-02-card-deposit-flow-implementation-plan.md) | 코드/DB/UI 변경 순서 | 진행 중 |
| [운영자 콘솔 계획](./2026-06-02-operator-console-plan.md) | 매칭 승인 게이트 + 매칭 근거 보고 + 외모 점수 보정 | 설계 확정 대기 |

## 기존 참조 문서

| 문서 | 쓸 곳 |
|---|---|
| [Daily Card Spec](../product/matching/DAILY_CARD_SPEC_2026-05-28.md) | 기존 데일리 카드 카드풀/공개 일정 아이디어 |
| [Sungjun Daily Card Handoff](../product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md) | 매칭 엔진 경계, `match_meetings` 의존성 |
| [Master Plan](../CODEX_MASTER_2026-05-23.md) | 전체 제품 흐름과 DB/RPC 맥락 |
| [Interface Contract](../engineering/INTERFACE_CONTRACT.md) | 프론트/매칭/DB 경계 |
| [Meeting Agenda](../SUNGJUN_MEETING_AGENDA_2026-06-01.md) | 성준 미팅 논의 안건 |

## 정리 원칙

- `docs/plans/`는 앞으로 볼 계획서의 첫 진입점이다.
- 기존 문서는 기록 보존용으로 남긴다.
- 새 의사결정이 기존 문서와 충돌하면 `docs/plans/` 문서를 우선 기준으로 삼고, 기존 문서에는 필요할 때만 후속 패치를 한다.


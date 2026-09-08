---
name: quantum-model-router
description: Quantum 하위 작업에 위험·명세 잠금·모델 가용성을 기준으로 fast/full lane과 모델을 배정한다. 작업 분업, 모델 선택, Spark 적격성, 고위험 또는 production 판단에 사용한다.
---

# Quantum 작업 지능 배정

`docs/coordination/MODEL_ROUTING_POLICY.md`의 현재 정책을 따른다. 모델을 팀에 고정하거나 사용 비율을 목표로 하지 않는다.

## 먼저 레인을 고른다

- **Fast lane**: 읽기 전용 사실 확인, 검증 기준이 잠긴 단순 수정, 또는 부모가 범위·파일·종료를 잠근 내부 하위 작업. 짧은 내부 지시만 만든다.
- **Full lane**: 열린 제품/디자인, 결제·인증·DB/RLS·개인정보·공용 계약, migration, production/release, 여러 소유권의 충돌, 증거 충돌·반복 실패. 필요한 경우 Sol 검토와 승인 Gate를 포함한다.

유효한 `resolved routing`을 부모에게서 받았으면 이를 확인해 그대로 실행한다. 같은 논리 작업 트리에서 정책을 다시 읽거나 대표실 형식을 반복하지 않는다. 계약에 모순·RED 신호·범위 확대가 생기면 멈추고 부모에게 올린다.

부모가 아직 해석하지 않았을 때만 정책을 읽고 아래 계약을 만든다.

```text
routing_version / root_task / lane / stage / risk:
model_id / reasoning_effort / why_this_route:
allowed_files / forbidden_actions:
acceptance_criteria / evidence_return / escalate_when:
approval_basis: 정확한 승인 문장 또는 "없음"
```

## 모델 선택

- 열린 프론트 디자인의 첫 해석·첫 보고·전체 설계와 최종 제품 품질은 Sol `xhigh`다.
- 화면 표시·잘림·CTA·URL·테스트의 사실 확인은 Luna `low`~`medium`이다.
- 잠긴 일반 분석·구현은 Terra `medium`~`high`가 기본이다.
- Spark는 현재 가용하고, 요구·허용 파일·출력·검증·종료 조건이 모두 잠긴 GREEN 작업일 때만 후보로 검토한다. 가용성이나 잠금 조건이 없으면 Spark를 강제하지 않는다.
- Spark가 한 번 실패하거나 작업이 모호해지면 Terra로, RED 신호면 Sol로 올린다. Spark는 결제·인증·DB/RLS·개인정보·공용 계약·production·최종 판단을 맡지 않는다.
- Ultra는 기본값이 아니다. 정책의 모든 조건과 사용자 승인 문장·시각·범위가 확인될 때만 배정한다.

## 지시 형식

Fast lane 내부 에이전트에는 이것만 준다.

```text
작업 / 소유(허용 파일):
금지:
모델·강도와 이유:
합격 기준:
부모 반환 증거·승격 조건:
```

Full lane에서만 단계·위험·승인 근거·중단 조건·독립 검증자·반환 대상을 추가한다. 별도 작업방을 열거나 사용자 승인 Gate를 관리하거나 대표실로 회수할 때만 `quantum-executive-reporting`을 함께 적용한다.

## 자체 검사

- 정확한 모델 ID와 영문 사고 강도를 썼는가?
- Spark의 가용성과 명세 잠금 조건을 확인했는가? 확인 불가면 Spark를 강제하지 않았는가?
- RED 영역, 명시적 사용자 승인 필요 작업, 최종 판단을 fast lane에 넣지 않았는가?
- 자식이 유효한 부모 계약을 받았는데 정책·대표실 스킬 재독을 요구하지 않았는가?
- `git add`·commit·push, 원격 DB/Auth/Storage/RLS/RPC·migration 적용, 실제 결제, production 배포·제출을 각각 사용자 승인 전 금지했는가?

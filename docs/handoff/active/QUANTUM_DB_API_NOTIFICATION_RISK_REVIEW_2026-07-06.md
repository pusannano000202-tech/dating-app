# Quantum DB/API 알림 변경분 별도 검수 메모

작성일: 2026-07-06
작성자: 팀장방 Codex

## 현재 보류 파일

- `app/api/notifications/route.ts`
- `supabase/migrations/20260701000000_daily_card_available_notifications.sql`
- `tests/matching/frontend-flow-polish.test.ts`

## 변경 요약

### 1. `app/api/notifications/route.ts`

`GET /api/notifications`에서 `notify_available_daily_cards` RPC를 호출하던 코드를 제거한 상태입니다.

의도:
- GET API에서 알림 생성 side effect가 발생하지 않게 함
- 알림 생성은 scheduler/RPC/명시적 작업으로 분리

검수 필요:
- scheduler가 없는 로컬/preview 환경에서 daily card available 알림이 사라지는지 확인 필요
- 실제 product에서 알림 생성 주체가 어디인지 확정 필요

### 2. `supabase/migrations/20260701000000_daily_card_available_notifications.sql`

`daily_card_available` 중복 알림 방지를 위해 unique index를 추가하고, 기존 `WHERE NOT EXISTS` 방식 대신 `ON CONFLICT DO NOTHING`을 사용하도록 바꾼 상태입니다.

의도:
- 동시 실행/중복 실행 시 중복 알림 방지
- DB constraint 기반으로 안전하게 idempotent 처리

검수 필요:
- expression unique index가 기존 payload 구조와 정확히 맞는지 확인 필요
- nullable payload 값이 들어올 때 중복 방지 정책이 의도대로 동작하는지 확인 필요
- 이미 배포된 DB에 같은 kind/payload 중복 데이터가 있을 경우 index 생성 실패 가능성 검토 필요

### 3. `tests/matching/frontend-flow-polish.test.ts`

아래 변경이 한 파일에 섞여 있습니다.

- 1:1 preview 라우팅 테스트 변경
- notification GET side effect 제거 테스트
- migration 중복 방지 방식 변경 테스트

검수 필요:
- 프론트 preview 테스트와 DB/API 알림 테스트를 분리할지 결정 필요
- DB/API 커밋에만 알림 관련 테스트를 포함하는 것이 안전함

## 권장 처리 순서

1. 실제 DB에 중복 `daily_card_available` 알림 데이터가 있는지 확인
2. scheduler 또는 RPC 호출 주체 확정
3. migration을 로컬 Supabase 또는 shadow DB에 적용 검증
4. `tests/matching/frontend-flow-polish.test.ts`에서 DB/API 관련 assertion만 별도 테스트로 분리
5. DB/API 알림 안정화 커밋으로 별도 commit

## 이번 프론트 커밋 포함 여부

포함하지 않았습니다.

이유:
- API 동작 변경과 DB migration은 프론트 테마/마스코트 구현과 위험도가 다름
- `supabase/migrations/`는 협업 규칙상 별도 리뷰 필요

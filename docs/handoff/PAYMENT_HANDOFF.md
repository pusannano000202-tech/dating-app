# 결제 연결 레이어 — 충현(Codex) 인수 문서

성준이 토스페이먼츠 결제 연결(plumbing)까지 완료. 충현은 비즈니스 로직을 이어받는다.

## 준비된 엔드포인트

| 메서드 | 경로 | 인증 | 요청 body | 응답 |
|--------|------|------|-----------|------|
| POST | `/api/payments/deposit/prepare` | **세션 필요** | `{ match_id, group_id }` | `{ orderId, amount, orderName, clientKey }` |
| POST | `/api/payments/confirm` | **세션 필요** | `{ paymentKey, orderId, amount }` | `{ status:'paid', method }` (deposit/tip 공용, orderId 접두사로 분기) |
| POST | `/api/payments/cancel` | **내부 시크릿** | `{ orderId, reason? }` | `{ status:'refunded' }` (deposit 전액 환불) |
| POST | `/api/payments/tip/prepare` | **세션 필요** | `{ match_id, amount }` | `{ orderId, amount, orderName, clientKey }` |

모든 라우트는 `export const runtime = 'nodejs'` (시크릿 키 사용, 서버 전용).

**인증 모델 (중요):**
- `prepare`/`confirm`: 로그인 세션 필수(`lib/payments/auth.ts` `getSessionUser`). **payer_user_id는 body가 아니라 세션 사용자에서 도출**(스푸핑 차단). confirm은 주문의 payer와 세션 사용자가 일치해야 함(403).
- `cancel`(환불): 사용자가 직접 호출 금지(선환불 후 노쇼 악용). `PAYMENT_INTERNAL_SECRET`을 `Authorization: Bearer …`로 제시하는 **서버-내부 호출만** 허용. 충현의 만남 인증/노쇼 판정 로직이 이 시크릿으로 호출.

## 준비된 함수 (`lib/payments/`)
- `confirmPayment({paymentKey,orderId,amount}, {secretKey})` → 토스 승인
- `cancelPayment({paymentKey,cancelReason}, {secretKey})` → 토스 취소
- `generateOrderId('deposit'|'tip')`, `assertAmountMatches(expected, actual)`
- `lib/supabase-server.ts` `createServiceClient()` (service_role)

## env 키
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` (공개), `TOSS_SECRET_KEY` (서버 전용)
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용), `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`
- `PAYMENT_INTERNAL_SECRET` (서버 전용) — cancel 라우트 내부 호출 인증용
- 템플릿: `.env.local.example`. 실키는 `.env.local`에 직접 입력(커밋 금지).

## 테이블 / status 전이
- `deposits.status`: pending → paid → refunded(성사) / forfeited(노쇼)
- `tips.status`: pending → paid / failed
- `matches.status`: scheduled → confirmed → completed / cancelled
- `groups`/`matches`는 **stub** — 실제 컬럼은 성준이 ALTER로 확장 예정.

## 연결 레이어가 이미 보장하는 것 (보안)
- 시크릿/service_role 키 서버 전용 (NEXT_PUBLIC_ 아님)
- **모든 결제 변경 라우트 인증**: prepare/confirm 세션 필수, cancel 내부 시크릿
- payer_user_id를 세션에서 도출(클라 스푸핑 차단), confirm은 주문 소유자만(403)
- 서버 저장 금액 ↔ 클라 금액 ↔ **토스 반환 totalAmount**(필수) 대조, status='DONE' 확인
- confirm 멱등: 이미 paid면 success + paid 전이는 `WHERE status='pending'` 원자적 업데이트
- cancel 멱등: 이미 refunded면 success, 토스 `ALREADY_CANCELED_PAYMENT`는 멱등 진행(Toss/DB 불일치 복구)
- toss 래퍼: 비JSON 응답 안전 파싱(`res.text()`), `TossError.code`로 에러 분기
- **전 테이블 RLS ENABLE**(groups/matches/deposits/tips/noshow_penalties/attendances), 정책 없이 기본거부 → anon 차단(grant 부재에만 의존하지 않음)
- deposits `(match_id, group_id)` pending 부분 유니크 → 중복 prepare orphan 방지

## 알려진 미구현(충현 처리 또는 추후)
- `tips.status='failed'` 기록 경로 없음 — confirm 실패 시 tip/deposit 모두 `pending`으로 남음. 실패 상태 영속화는 충현이 정책 확정 후 추가.
- 토스 webhook(가상계좌 등 비동기 입금) 미구현 — 동기 confirm만. 추후.
- prepare는 match_id/group_id UUID 형식 검증을 DB FK에 위임(잘못된 값은 500).
- 참가자 레벨 인가(이 사용자가 이 match의 참가자인가)는 매칭 참가자 모델 확정 후 충현이 추가.

## 충현 TODO (코드 내 `// TODO(충현):` 주석 위치)
1. confirm 성공 후: 같은 match_id 양 팀 deposit이 모두 paid → `matches.status='confirmed'` (QnA 오픈 트리거)
2. 코드 인증(`attendances`) 성공 → `/api/payments/cancel`을 **`Authorization: Bearer $PAYMENT_INTERNAL_SECRET`로 서버에서 호출**(전액 환불) + `matches.status='completed'`
3. 노쇼 판정 → cancel 호출 없이 `deposits.status='forfeited'` + `noshow_penalties` insert + 패널티 기간 적용
4. QnA 게이팅: `matches.status==='confirmed'`에서만 접근
5. 뽀찌 UX: 자율 금액 입력 → tip/prepare → 결제위젯 → confirm
6. RLS: 참가자 본인 SELECT 정책(매칭 참가자 모델 확정 후)
7. 결제 UI를 실제 매칭 플로우에 연결(임시 테스트 페이지는 제거됨 — 인증된 세션에서 prepare→위젯→confirm 호출)

## 검증 방법 (✅ 2026-06-21 실키 라운드트립 검증 완료)
- 임시 테스트 페이지(`/match/payment-test`, 인증 우회)로 **실키 검증을 마친 뒤 보안 강화를 위해 제거**했다.
- 검증 당시 확인된 동작: prepare→결제위젯(카카오페이/토스페이)→confirm→DB `paid`(method=간편결제, payment_key 저장)→cancel→DB `refunded`(canceled_at 기록) 전 구간 정상.
- 재검증 시: 로그인 세션이 있는 상태에서 매칭 화면이 prepare/confirm을 호출하도록 연결한 뒤 동일 흐름 확인.
- 마이그레이션 적용 시 `GRANT … TO service_role` + 전 테이블 RLS ENABLE + pending 부분 유니크가 모두 포함됨.

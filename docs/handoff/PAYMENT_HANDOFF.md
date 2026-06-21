# 결제 연결 레이어 — 충현(Codex) 인수 문서

성준이 토스페이먼츠 결제 연결(plumbing)까지 완료. 충현은 비즈니스 로직을 이어받는다.

## 준비된 엔드포인트

| 메서드 | 경로 | 요청 body | 응답 |
|--------|------|-----------|------|
| POST | `/api/payments/deposit/prepare` | `{ match_id, group_id, payer_user_id }` | `{ orderId, amount, orderName, clientKey }` |
| POST | `/api/payments/confirm` | `{ paymentKey, orderId, amount }` | `{ status:'paid', method }` (deposit/tip 공용, orderId 접두사로 분기) |
| POST | `/api/payments/cancel` | `{ orderId, reason? }` | `{ status:'refunded' }` (deposit 전액 환불) |
| POST | `/api/payments/tip/prepare` | `{ match_id, payer_user_id, amount }` | `{ orderId, amount, orderName, clientKey }` |

모든 라우트는 `export const runtime = 'nodejs'` (시크릿 키 사용, 서버 전용).

## 준비된 함수 (`lib/payments/`)
- `confirmPayment({paymentKey,orderId,amount}, {secretKey})` → 토스 승인
- `cancelPayment({paymentKey,cancelReason}, {secretKey})` → 토스 취소
- `generateOrderId('deposit'|'tip')`, `assertAmountMatches(expected, actual)`
- `lib/supabase-server.ts` `createServiceClient()` (service_role)

## env 키
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` (공개), `TOSS_SECRET_KEY` (서버 전용)
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용), `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`
- 템플릿: `.env.local.example`. 실키는 `.env.local`에 직접 입력(커밋 금지).

## 테이블 / status 전이
- `deposits.status`: pending → paid → refunded(성사) / forfeited(노쇼)
- `tips.status`: pending → paid / failed
- `matches.status`: scheduled → confirmed → completed / cancelled
- `groups`/`matches`는 **stub** — 실제 컬럼은 성준이 ALTER로 확장 예정.

## confirm 라우트가 이미 보장하는 것 (보안)
- 시크릿/service_role 키 서버 전용 (NEXT_PUBLIC_ 아님)
- 서버 저장 금액 ↔ 클라 금액 ↔ **토스 반환 totalAmount** 3중 대조, status='DONE' 확인
- 멱등: 이미 paid면 success 반환 + paid 전이는 `WHERE status='pending'` 원자적 업데이트(동시요청 race 차단)

## 알려진 미구현(충현 처리 또는 추후)
- `tips.status='failed'` 기록 경로 없음 — confirm 실패 시 tip/deposit 모두 `pending`으로 남음. 실패 상태 영속화는 충현이 정책 확정 후 추가.
- 토스 webhook(가상계좌 등 비동기 입금) 미구현 — 동기 confirm만. 추후.
- prepare는 match_id/group_id UUID 형식 검증을 DB FK에 위임(잘못된 값은 500).

## 충현 TODO (코드 내 `// TODO(충현):` 주석 위치)
1. confirm 성공 후: 같은 match_id 양 팀 deposit이 모두 paid → `matches.status='confirmed'` (QnA 오픈 트리거)
2. 코드 인증(`attendances`) 성공 → `/api/payments/cancel` 호출(전액 환불) + `matches.status='completed'`
3. 노쇼 판정 → cancel 호출 없이 `deposits.status='forfeited'` + `noshow_penalties` insert + 패널티 기간 적용
4. QnA 게이팅: `matches.status==='confirmed'`에서만 접근
5. 뽀찌 UX: 자율 금액 입력 → tip/prepare → 결제위젯 → confirm
6. RLS: 참가자 본인 SELECT 정책(매칭 참가자 모델 확정 후)
7. `app/match/payment-test/` 임시 페이지 제거 + `middleware.ts`의 `isTestBypass`(결제 테스트 인증 우회) 함께 제거

## 검증 방법 (✅ 2026-06-21 실키 검증 완료)
- `.env.local`에 Supabase 실키 + 토스 위젯 테스트키(`test_gck_docs_…`/`test_gsk_docs_…`) 입력 후 `npm run dev`
- 마이그레이션에 `GRANT … TO service_role` 포함(일부 프로젝트는 신규 테이블 grant 자동부여 안 됨)
- `/match/payment-test`에서 prepare→결제위젯(카카오페이/토스페이)→confirm→DB `paid`→cancel→DB `refunded` 라운드트립 **실제 동작 확인됨**(method=간편결제, payment_key 저장, paid_at/canceled_at 기록).

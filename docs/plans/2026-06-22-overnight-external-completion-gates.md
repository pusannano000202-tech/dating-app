# 2026-06-22 야간 계획 외부 완료 게이트

## 1. 한 줄 결론

장시간 계획의 코드/문서/로컬 검증은 상당 부분 진행됐지만, 전체 완료 선언은 아직 불가하다.
남은 핵심은 코드 작성이 아니라 `외부 설정`, `정책 합의`, `실제 E2E 검증`이다.

## 2. 현재 완료로 볼 수 있는 것

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| 보증금 금액 | 10,000원 기준 고정 | `lib/constants.ts`, `tests/config/deposit-policy.test.ts` |
| 결제 provider | `mock`, `toss`만 유지 | `lib/payments/deposit.ts` |
| Toss 서버 route | checkout/confirm/cancel/webhook 코드 경로 있음 | `app/api/payments/deposit/*` |
| Toss webhook 검증 방식 | body 신뢰가 아니라 Query API 재조회 | `app/api/payments/deposit/webhook/route.ts` |
| env 예시 | mock/Toss sandbox/server-only key 자리 추가 | `.env.local.example` |
| env preflight | 비밀값 노출 없이 SET/MISSING 확인 가능 | `scripts/check-payment-env.mjs` |
| 데일리카드 현재 브랜치 정책 | 16:00-20:00 직접 뽑기 | `supabase/migrations/20260602_z54_daily_card_draw_policy.sql` |
| 데일리카드 회귀 방지 | 자동공개형으로 되돌아가지 않게 테스트 추가 | `tests/config/daily-card-policy.test.ts` |

## 3. 아직 완료가 아닌 것

| 항목 | 왜 완료가 아닌가 | 필요한 다음 증거 |
| --- | --- | --- |
| Toss sandbox 결제 시작 | 현재 로컬에 Toss key가 없음 | `npm run check:payment-env -- --provider=toss` 통과 |
| Toss sandbox confirm | 실제 `paymentKey/orderId/amount`로 승인 호출 미검증 | sandbox checkout 후 confirm route가 `deposits.status = paid`로 바꾸는 증거 |
| Toss cancel/refund | 내부 secret과 service role 기반 실제 취소 미검증 | cancel/refund route가 Toss sandbox 취소와 DB `refunded`를 같이 남기는 증거 |
| Toss webhook | route 코드는 있으나 dashboard/ngrok/preview URL 수신 미검증 | 실제 Toss sandbox webhook event 수신 로그 |
| 데일리카드 최종 정책 | 우리 브랜치는 직접 뽑기, 성준 gwating은 자동분배 | 둘 중 하나를 제품 정책으로 확정 |
| `preference_weights` 계약 | 우리 현재 코드 4개, 성준 회신 7개 | `docs/engineering/INTERFACE_CONTRACT.md` 합의 후 코드 반영 |
| 새 DB migration production 적용 | local 검증만 완료 | 성준 리뷰 후 staging/production 적용 결과 |

## 4. Toss sandbox E2E 실행 전 체크

먼저 실행:

```powershell
npm run check:payment-env -- --provider=toss
```

현재 이 명령은 실패하는 것이 정상이다. 로컬 `.env.local`에 아래 값이 없기 때문이다.

필요한 값:

- `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `PAYMENT_INTERNAL_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 또는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

현재 확인 결과:

- `npm run check:payment-env`는 mock provider 기준으로 통과한다.
- `npm run check:payment-env -- --provider=toss`는 아래 4개 누락으로 차단된다.
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY`
  - `TOSS_SECRET_KEY`
  - `PAYMENT_INTERNAL_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`

주의:

- `NEXT_PUBLIC_TOSS_CLIENT_KEY`만 브라우저 공개 가능하다.
- `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다.
- 실제 값은 문서나 테스트 파일에 넣지 않는다.

## 5. Toss sandbox E2E 순서

1. Toss sandbox 상점에서 client key, secret key를 발급한다.
2. `.env.local`에 sandbox 값을 넣는다.
3. provider를 `toss`로 바꾼다.

```env
NEXT_PUBLIC_PAYMENT_PROVIDER=toss
PAYMENT_PROVIDER=toss
```

4. `npm run check:payment-env -- --provider=toss`를 통과시킨다.
5. 로컬 dev server를 재시작한다.
6. 로그인된 테스트 계정으로 그룹을 만든다.
7. 보증금 결제 버튼을 눌러 `/api/payments/deposit` 또는 `/api/deposits`가 checkout URL을 반환하는지 확인한다.
8. Toss sandbox checkout에서 결제를 완료한다.
9. `/api/payments/deposit/confirm`이 `deposits.status = paid`로 바꾸는지 확인한다.
10. 내부 cancel/refund 흐름은 `PAYMENT_INTERNAL_SECRET`이 있는 서버 호출로만 검증한다.
11. webhook은 ngrok 또는 Vercel preview URL을 Toss dashboard에 등록한 뒤 event 수신을 확인한다.

## 6. 사용자/성준 합의 질문

### 데일리카드

질문:

- 최종 MVP는 `16:00-20:00 직접 뽑기`인가, 성준 `gwating-app`식 자동분배인가?

팀장 판단:

- 사용자 의도와 현재 우리 브랜치 구현은 `16:00-20:00 직접 뽑기`에 가깝다.
- 성준 자동분배는 UX 참고로만 두고, 최종 정책 확정 전에는 DB를 더 확장하지 않는다.

### 매칭 비중

질문:

- `preference_weights`는 현재 4개(`appearance`, `personality`, `height`, `body_type`)로 유지할지, 성준 회신의 7개(`school`, `hobby`, `time_fit` 포함)로 갈지?

팀장 판단:

- 현재 사용자 요구는 취미/학교 비중 제거 쪽에 가까웠고, 실제 프로필 입력도 4개 기준에 맞다.
- 하지만 성준 계약이 7개라면 공용 문서 합의 후 바꿔야 한다.

### 보증금 결제 시점

질문:

- 보증금은 큐 진입 전에 받을지, 가매칭 후 받을지?

팀장 판단:

- 현재 코드 흐름은 가매칭/매칭 상세에서 결제를 다루는 쪽에 가깝다.
- 큐 진입 전 선결제를 강제하려면 `enter_match_pool` route/RPC 조건을 다시 설계해야 한다.

### 노쇼/환불

질문:

- MVP 노쇼 판정은 GPS 체크인만으로 할지, 사진 인증/관리자 확인까지 넣을지?

팀장 판단:

- 결제/환불 E2E가 먼저다.
- 사진 인증과 관리자 판정은 MVP 후순위로 두는 것이 안전하다.

## 7. 다음 명령 추천

```text
팀장방, docs/plans/2026-06-22-overnight-external-completion-gates.md 기준으로 Toss sandbox E2E 준비를 시작해.
먼저 npm run check:payment-env -- --provider=toss 결과를 보고, 부족한 dashboard/env 값을 사용자 작업과 Codex 작업으로 나눠서 보고해.
production Toss/Supabase/Vercel은 건드리지 마.
```

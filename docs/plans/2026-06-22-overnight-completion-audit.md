# 2026-06-22 장시간 계획 완료 감사

## 1. 결론

`2026-06-21-overnight-user-flow-frontend-backend-plan.md`의 앱 내부 작업은 상당 부분 구현 및 검증됐다.
하지만 전체 목표를 `배포 사용자가 로그인부터 매칭, 보증금, 데일리카드, 연락처/채팅, 환불까지 실제로 막힘없이 사용`으로 보면 아직 완료가 아니다.

완료라고 부를 수 없는 이유는 코드 작성 부족만이 아니라 아래 외부 조건 때문이다.

- Toss sandbox key와 dashboard/webhook 설정이 없어 실제 결제 E2E를 검증하지 못했다.
- 새 Supabase migration 2개는 local 검증 완료 상태이며 production 적용 전 성준 리뷰가 필요하다.
- `preference_weights` 4개/7개 계약은 아직 팀 합의가 없다.
- 데일리카드 최종 정책은 `16~20시 직접 뽑기`와 성준 `gwating-app` 자동분배 중 선택이 필요하다.
- 연락처/채팅 공개 시점과 노쇼/환불 운영 기준은 아직 정책 확정이 필요하다.

## 2. 현재 증거 기준 완료 항목

| 영역 | 상태 | 증거 |
| --- | --- | --- |
| 로그인 UI | 코드 구현 | `app/(auth)/login/page.tsx` |
| 기본정보 저장 | 구현 | `app/profile/basic/page.tsx`, `components/profile/BasicInfoForm.tsx` |
| 부산대 학과 검색 | 구현 및 테스트 | `lib/pnu-departments.ts`, `tests/profile/pnu-departments.test.ts` |
| 닉네임 중복 DB 강제 | local 검증 완료 | `supabase/migrations/20260622_profile_display_name_claims.sql`, `app/api/profiles/claim-nickname/route.ts` |
| 이상형 월드컵 성별 분기 | 구현 | `app/profile/worldcup/page.tsx` |
| 가능 시간/매칭 비중 저장 | 구현 | `app/profile/schedule/page.tsx`, `app/profile/preferences/page.tsx` |
| 전화번호 기반 신규 그룹 초대 차단 | 구현 및 테스트 | `app/api/group-invites/route.ts`, `tests/config/booting-branding.test.ts` |
| 닉네임 기반 친구 요청 | 구현 | `app/api/friend-requests/route.ts` |
| 사전 카드 DB 초안 | local 검증 완료 | `supabase/migrations/20260622_matching_pre_match_card_drafts.sql`, `app/api/profile/match-card-draft/route.ts` |
| 매칭 준비 gate | 구현 | `app/api/match-pool/enter/route.ts`, `lib/matching/match-setup-status.ts` |
| 보증금 기본액 | 10,000원 고정 | `lib/constants.ts`, `tests/config/deposit-policy.test.ts` |
| 결제 provider | mock/toss만 유지 | `lib/payments/deposit.ts` |
| Toss confirm/cancel/webhook route | 코드 구현 | `app/api/payments/deposit/*`, `lib/payments/toss.ts` |
| 환불 앱 기여금 UX | 구현 | `app/match/[id]/refund/page.tsx`, `lib/refund/fee-flow.ts` |
| 데일리카드 직접 뽑기 | 우리 브랜치 정책 구현 | `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`, `tests/config/daily-card-policy.test.ts` |
| 홈/매칭/알림 정보 과노출 완화 | 구현 | `app/page.tsx`, `app/match/page.tsx`, `app/notifications/page.tsx` |

## 3. 아직 완료가 아닌 항목

| 영역 | 왜 미완료인가 | 완료 증거 |
| --- | --- | --- |
| Google/Supabase 실제 로그인 | provider/dashboard redirect 설정은 코드 밖 작업 | 실제 배포 URL에서 Google 로그인 성공 |
| production 닉네임 claim | migration은 local 검증만 완료 | 성준 리뷰 후 staging/production 적용 |
| production 사전 카드 DB | migration은 local 검증만 완료 | 성준 리뷰 후 staging/production 적용 |
| Toss sandbox checkout | key/env가 없음 | `npm run check:payment-env -- --provider=toss` 통과 후 checkout 성공 |
| Toss confirm | 실제 `paymentKey/orderId/amount` 검증 미실행 | sandbox 결제 후 `deposits.status = paid` 확인 |
| Toss cancel/refund | 실제 취소 미실행 | sandbox 취소 후 `deposits.status = refunded` 확인 |
| Toss webhook | dashboard/ngrok/Vercel preview 미설정 | 실제 webhook 수신 로그와 DB reconciliation 증거 |
| 데일리카드 최종 정책 | 우리 직접 뽑기와 성준 자동분배 충돌 | 팀 정책 확정 후 코드/문서 일치 |
| `preference_weights` 계약 | 현재 4개, 성준 회신 7개 | `INTERFACE_CONTRACT.md` 합의 및 코드 반영 |
| 연락처/채팅 공개 시점 | 정책 결정 필요 | 확정 정책과 API gate 일치 |
| 노쇼/환불 운영 | GPS/사진/관리자 판정 결정 필요 | MVP 운영 정책과 API 검증 |

## 4. 재현 가능한 로컬 검증 명령

앱 내부 검증:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:profile
npm run test:matching
npm run build
```

결제 환경 검증:

```powershell
npm run check:payment-env
npm run check:payment-env -- --provider=toss
```

현재 `--provider=toss`는 실제 sandbox 키가 없으면 실패하는 것이 정상이다.

로컬 route 검증:

```powershell
npm run check:routes -- --base=http://localhost:3004
```

이 명령은 `booting_dev_auth=1` cookie를 넣고 주요 미리보기 route가 로그인으로 튕기지 않는지 확인한다.
dev server가 떠 있지 않으면 먼저 아래 명령으로 실행한다.

```powershell
npm run dev -- -p 3004
```

현재 최신 확인 결과:

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm run test:config` 통과. 37개 테스트 통과.
- `npm run test:profile` 통과. 14개 테스트 통과.
- `npm run test:matching` 통과. 38개 테스트 통과.
- `npm run check:payment-env` 통과.
- `npm run build` 통과.
- `npm run check:routes -- --base=http://localhost:3004` 통과.
- `npm run check:payment-env -- --provider=toss`는 Toss sandbox 키 4개 누락으로 차단됨.

## 5. 지금 팀장방 판단

지금 커밋 가능한 단위는 `앱 내부 검증 체계와 완료 감사 문서 보강`이다.
하지만 전체 목표는 아직 완료가 아니며, 남은 핵심은 사용자가 직접 준비해야 하는 외부 설정과 성준과의 정책/스키마 합의다.

따라서 다음 작업은 둘 중 하나다.

1. Toss sandbox key와 webhook 테스트 환경을 준비해서 실제 결제 E2E를 진행한다.
2. 성준과 `preference_weights`, 데일리카드 정책, 연락처/채팅 공개 시점을 확정하고 계약 문서를 업데이트한다.

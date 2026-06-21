# 2026-06-21 야간 코드리뷰 결과

## 1. 한 줄 결론

현재 브랜치는 사용자 검토용 프론트와 mock 흐름을 넘어서, 큐 진입 전 사전 카드 초안 DB 저장과 닉네임 중복 DB 강제 구조까지 추가했다. 그래도 배포 기준 핵심인 Toss 실승인, 데일리카드/채팅 정책 합의는 아직 끝난 상태가 아니다. 새로 추가한 `pre_match_card_drafts`, `profile_display_name_claims` migration은 production 적용 전 성준 리뷰가 필요하다.

## 2. 결제 코드리뷰

| 항목 | 현재 우리 코드 | 성준 회신 기준 | 판단 | 다음 조치 |
| --- | --- | --- | --- | --- |
| 결제사 | `mock`, `toss` provider만 유지 | Toss 단일 | 로컬 mock 제외 일치 | `mock`은 로컬/검토용, 실결제 흡수 대상은 Toss만 유지 |
| 결제 시작 | `/api/deposits`, `/api/payments/deposit`에서 mock이면 즉시 paid, Toss면 pending deposit row를 만들고 checkout URL 반환 | Toss prepare route에서 결제 요청 생성 | 코드 보강, sandbox 검증 필요 | route 이름/응답 형태 매핑표 필요 |
| 결제 승인 | `/api/payments/deposit/confirm`에서 Toss `paymentKey/orderId/amount`를 서버 helper로 승인 검증하고 paid 처리 | Toss 승인값 서버 검증 후 `deposits` paid 처리 | 코드 보강, sandbox 검증 필요 | production 호출은 안 했고, sandbox key로 end-to-end 검증 필요 |
| 결제 취소 | `/api/payments/deposit/cancel`은 checkout 실패 redirect와 내부 secret 기반 Toss cancel을 분리 | 성준 cancel route + 내부 secret 환불 호출 | 코드 보강, 운영 트리거 미연결 | `PAYMENT_INTERNAL_SECRET` 없이는 실제 cancel 불가. refund 화면과 내부 route 연결은 남음 |
| webhook | body 수신 placeholder, 서명 검증/DB 반영 없음 | 성준 기준 webhook 없음, 동기 confirm 중심 | 보류 | MVP는 webhook보다 confirm 검증 우선 |
| 환경변수 | `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | 코드 기준 일치, 대시보드 설정 필요 | Vercel/Supabase/Toss dashboard 설정 필요 |
| 금액 | `DEPOSIT_AMOUNT = 10000`, mock RPC도 10,000원 검증 | 10,000원 | 일치 | 유지 |

결제 쪽 핵심 위험:

- 현재 테스트는 route가 외부 API를 직접 호출하지 않고 `lib/payments/toss.ts` 서버 helper에 위임하는 구조를 고정한다.
- `kakao` provider 이름은 결제 provider 목록에서 제거했다. 과거 문서에 남은 KakaoPay/PortOne 언급은 레거시 참고로만 본다.
- `confirm` route는 Toss 승인 응답의 `orderId`, `totalAmount`, `status = DONE`을 확인한다. 다만 sandbox key로 실제 checkout/confirm을 끝까지 검증한 증거는 아직 없다.

## 2.1 성준 Toss 기준과 우리 route 매핑표

| 성준 회신 기준 | 현재 우리 코드 대응 | 현재 차이 | 판단 |
| --- | --- | --- | --- |
| `app/api/payments/deposit/prepare` | `app/api/payments/deposit/route.ts`, `app/api/deposits/route.ts` | 우리 쪽은 prepare라는 이름이 아니라 POST route에서 checkout draft를 반환 | 이름/응답 통합 필요 |
| `app/api/payments/deposit/confirm` | `app/api/payments/deposit/confirm/route.ts` | mock이면 paid, Toss면 `confirmTossPayment` 후 DB paid 처리 | sandbox 실검증 필요 |
| `app/api/payments/deposit/cancel` | `app/api/payments/deposit/cancel/route.ts` | checkout 실패 redirect + 내부 secret 기반 Toss cancel | refund/운영 트리거 연결 필요 |
| `app/api/payments/tip/prepare` 등 | 대응 없음 또는 미확인 | 앱 기여금/팁 결제를 보증금 환불 UX와 섞으면 안 됨 | 별도 phase |
| `lib/payments/toss.ts` | `lib/payments/toss.ts` 추가 | Toss checkout/confirm/cancel 서버 helper 존재 | sandbox 실검증 필요 |
| `lib/payments/orders.ts` | `buildDepositOrderId()`만 존재 | 주문/멱등 처리 레이어 부족 | 보강 필요 |
| `PAYMENT_INTERNAL_SECRET` | `app/api/payments/deposit/cancel/route.ts`에서 실제 cancel POST 보호 | 환불/cancel 내부 호출 보호 | 추가 완료, 운영 트리거 필요 |
| `SUPABASE_SERVICE_ROLE_KEY` | `app/api/payments/deposit/cancel/route.ts`에서 내부 환불 후 deposit 상태 갱신에 사용 | 서버 전용 status 갱신 권한 | 추가 완료, env 설정 필요 |

결론:

- 지금은 Toss 결제 "코드 경로 보강" 수준이다. sandbox 환경변수로 실제 checkout/confirm/cancel을 검증해야 "승인 검증 완료"라고 말할 수 있다.
- 성준 코드를 흡수할 때 필요한 `confirm`, `cancel`, `toss helper`, `internal secret`은 코드에 반영했다. `orders` 전용 레이어와 운영 환불 트리거는 남아 있다.
- 프론트에서 결제 완료처럼 보이는 UI를 먼저 강화하면 실제 DB paid 판정과 어긋날 수 있다.

## 3. 홈/매칭/그룹 preview source 점검

| 화면 | 현재 source | 상태 | 문제 | 조치 |
| --- | --- | --- | --- | --- |
| 홈 `/` | `HomeTodayTaskCard`가 `DEV_PREVIEW_GROUP_MEMBERS` 사용 | 대체로 통일 | 없음 | 유지 |
| 매칭 `/match` | `DEV_GROUP_SUMMARY`가 `DEV_PREVIEW_GROUP_MEMBERS` 사용 | 통일 | 없음 | 유지 |
| 그룹 `/group/create` | `DEV_GROUP_STATE`가 `DEV_PREVIEW_GROUP_MEMBERS`에서 members 생성 | 통일 | 보증금 요약만 별도 user_id 사용 | 수정 완료 |
| 그룹 보증금 요약 | 기존 `dev-user-1`, `dev-user-2` | 불일치 | 멤버 id와 보증금 id가 달라 화면별 상태를 의심하게 만듦 | `DEV_PREVIEW_CURRENT_USER_ID`, `DEV_PREVIEW_FRIEND_MINJI_ID` 사용으로 수정 |
| 초대 가능 친구 | 기존 `Friend B`, `Friend C` | 어색함 | 사용자 검토 화면에 영어 placeholder 노출 | `서윤`, `지민`으로 수정 |

프론트 source 판단:

- 홈과 매칭은 같은 미리보기 멤버 배열을 쓰고 있다.
- 그룹 생성 화면도 같은 멤버 배열을 쓰지만, 보증금 요약만 독자 id를 써서 미묘한 불일치가 있었다.
- 이번 수정으로 로컬 preview의 멤버, 보증금 요약, 큐 시각화의 그룹 크기 기준을 같은 source에 맞췄다.

## 4. 공용 스키마 충돌

성준 회신 기준으로 아래 이름들은 성준 현재 DB/코드에 대응물이 없다고 봐야 한다.

- `match_meetings`
- `venues`
- `enter_match_pool`
- `connections` RPC/테이블
- `member_match_setup_ready`
- `current_user_match_setup`
- `preferred_personality_vector`
- `16~20시 직접 뽑기`

우리 브랜치에는 일부 route, migration, 문서가 이미 이 이름들을 쓰고 있다. 그래서 지금 새 migration을 추가하거나 공용 타입을 바꾸면 성준 스키마와 우리 스키마가 따로 생기는 위험이 있다.

예외적으로 이번 재개 작업에서는 계획서 전체 완료 기준에서 `사전 카드 DB 저장`과 `닉네임 중복 DB 강제`가 사용자 동선과 직접 연결되어 있어 migration 2개를 새로 추가했다. `pre_match_card_drafts`는 기존 `match_card_submissions`를 바꾸지 않고, match_id가 생기기 전 user-level 초안만 저장한다. `profile_display_name_claims`는 기존 중복 데이터를 터뜨리지 않고 신규 닉네임 claim만 고유하게 강제한다. 적용 전에는 공용 DB 변경이므로 성준 리뷰가 필요하다.

## 5. 결정 필요

1. `preference_weights`는 4개 기준으로 유지할지, 성준 회신의 7개 기준으로 바꿀지.
2. 데일리카드는 16~20시 직접 뽑기 방식인지, `gwating-app` 자동 분배 방식인지.
3. `match_meetings`, `venues`, `connections`를 우리 브랜치 기준으로 살릴지, 성준 기준에 맞춰 새 계약부터 잡을지.
4. Toss 결제는 webhook 없이 confirm 중심으로 갈지.
5. Toss confirm/cancel 구현 시 `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`를 어떤 route에서만 읽게 할지.
6. `pre_match_card_drafts`와 `profile_display_name_claims`를 현재 브랜치 기준으로 적용할지, 성준 스키마에 맞춰 이름/위치를 조정할지.

## 6. 바로 가능한 다음 작업

- 새 `pre_match_card_drafts` migration을 local/staging에서 적용해 `/profile/match-card` 저장과 `/api/match-pool/enter` 멤버 전원 gate를 실제 DB로 확인.
- 새 `profile_display_name_claims` migration을 local/staging에서 적용해 동시 닉네임 중복 저장이 DB에서 막히는지 확인.
- `/profile/basic` 브라우저 확인: 학과 검색 후보가 실제로 뜨는지 확인.
- 결제 흡수 표 보강: 성준 Toss route 이름과 우리 route 이름을 1:1로 매핑.
- 홈/매칭/그룹 로컬 route 확인: 같은 멤버가 보이는지 확인.
- provider 목록은 `mock`, `toss`로 정리했고, 테스트가 Toss 단일 정책을 오해하지 않게 고정.
- 환불 페이지는 0~10,000원, 1,000원 단위, 3천/2천/1천 제안 흐름이 이미 코드에 반영됐으므로 다음 작업은 구현이 아니라 브라우저/route 검증이다.

## 6.5 추가 코드리뷰 결과

### 닉네임 친구 요청

| 항목 | 현재 코드 | 판단 |
| --- | --- | --- |
| 닉네임 중복 확인 | `app/api/profiles/check-nickname/route.ts`가 `is_profile_display_name_available` RPC 호출 | API + DB claim 기준 |
| 친구 요청 생성 | `app/api/friend-requests/route.ts`가 `receiver_nickname`으로 receiver를 찾고 `receiver_phone: null`로 insert | 전화번호 중심 흐름은 신규 요청 기준에서 빠져 있음 |
| DB unique | `profile_display_name_claims` + `trg_profiles_guard_display_name_claim` 추가 | 신규 중복 저장은 DB에서 막는 구조. migration 적용 검증 필요 |

### 매칭 찾기 gate

`app/api/match-pool/enter/route.ts`는 단순 버튼 통과가 아니라 아래 조건을 서버에서 검사한다.

- 그룹 멤버 여부.
- 그룹 리더 여부.
- 활성 멤버 2명 이상.
- 활성 멤버 수가 `groups.size`에 도달.
- 모든 멤버의 성향 선호, 가능 시간, 매칭 비중 완료.
- 모든 멤버의 사전 카드 초안 DB 저장 완료.

따라서 사용자가 걱정한 "입력 안 해도 바로 매칭 큐로 들어가는 문제"는 서버 route 기준으로는 막고 있다. 다만 이 route가 부르는 `enter_match_pool` RPC와 새 `pre_match_card_drafts` migration은 성준 최신 회신 기준에는 없다고 했으므로, 우리 브랜치 구현 후보와 성준 기준 계약을 분리해야 한다.

### 이상형 월드컵 성별 분기

`app/profile/worldcup/page.tsx`는 Supabase 모드에서 `profiles.gender`를 읽고 반대 성별을 `IdealWorldcup`에 넘긴다. 성별이 없으면 기본정보 화면으로 돌아가게 안내한다. dev preview는 기본값을 `female`로 둬서 남성 후보 월드컵을 기본 실행하므로, 실제 남자/여자 양방향 브라우저 검증은 아직 필요하다.

## 8. route-level 확인 결과

검증 방식:

- `curl`로 `/dev/preview`를 먼저 열어 `booting_dev_auth=1` 쿠키를 받은 뒤 주요 route를 확인했다.
- 실제 브라우저 플러그인은 현재 노출되지 않았고, Node REPL 브라우저 확인은 sandbox meta 오류로 실행되지 않았다.

확인 결과:

| route | HTTP 결과 | 본문 marker | 판단 |
| --- | --- | --- | --- |
| `/` | 200 | `현재 함께하는 친구`, `매칭 현황` | dev preview 홈 렌더 확인 |
| `/match` | 200 | `현재 함께하는 친구`, `매칭 현황` | dev preview 매칭 렌더 확인 |
| `/profile/basic` | 200 | 단순 HTML 검색 marker 없음 | 로그인 튕김은 없음. 클라이언트 렌더 확인은 브라우저 필요 |
| `/group/create` | 200 | 단순 HTML 검색 marker 없음 | 로그인 튕김은 없음. 클라이언트 렌더 확인은 브라우저 필요 |

남은 확인:

- 실제 브라우저에서 `/profile/basic` 학과 input 포커스 시 후보가 뜨는지.
- 실제 브라우저에서 `/group/create` 보증금 요약이 `나`, `민지`로 통일돼 보이는지.

## 7. 이번 코드리뷰에서 하지 않은 것

- `supabase/migrations/`는 이번 재개 작업에서 새 파일 2개를 추가했다. production 적용 전 리뷰 필요.
- `lib/types.ts` 수정 안 함.
- 실제 Toss API 호출 구현 안 함.
- KakaoPay/PortOne 실결제 구현 안 함.
- 성격 기능 제거 안 함.

## 9. 하위 에이전트 감사 반영

### DB/API

- 현재 우리 브랜치에는 `venues`, `match_meetings`, `enter_match_pool`, `connections` 등이 실제 migration/API로 존재한다.
- 성준 최신 회신 기준에는 이 이름들이 없다고 했으므로, 현재 브랜치의 해당 스키마는 `합의된 성준 기준`이 아니라 `우리 로컬 구현 후보`로 봐야 한다.
- `enter_match_pool` route는 그룹/멤버/준비 완료 조건을 검사하지만, z50 RPC 자체는 보증금 선결제를 요구하지 않는다.
- 닉네임은 `profiles.display_name`을 사용자 표시값으로 유지하되, 신규 중복 방지는 `profile_display_name_claims`와 profiles trigger가 담당한다.

### 프론트 UX

- `/match`와 `/notifications`에서 `pending` 또는 `match_created` 단계의 상대 정보가 결과처럼 빨리 보이는 문제가 있다.
- 홈의 설명은 큐/상대 카드를 매칭 화면에서 본다고 말하지만, 랜딩 홈은 `MatchingPool`로 큐 숫자를 보여준다.
- 매칭찾기 조건 문구가 "친구 초대만", "2명 이상"처럼 가볍게 들려 서버 조건보다 느슨하게 느껴진다.
- 혼성 그룹과 대표 성별 기준 설명이 분산되어 있어 큐 숫자를 보는 사용자가 남자/여자 팀 수의 의미를 헷갈릴 수 있다.
- `초대중` 문구는 `수락 대기`로 바꾸는 것이 자연스럽다.

후속 반영:

- `/match` pending 카드는 상대 규모/성별 대신 `가매칭 후보가 도착했어요`로 낮췄다.
- `/notifications` `match_created` 카드는 상대 학과/학교/그룹 상세 칩을 제거하고, 확정 후 공개 안내와 다음 행동 중심 칩으로 변경했다.
- 확정된 매칭은 여전히 `/match`에서 상대 그룹 규모/대표 성별을 볼 수 있다.
- 비로그인 랜딩 홈에서는 `MatchingPool`을 제거하고, 큐 숫자 대신 숫자 없는 3단계 흐름 안내를 보여주도록 바꿨다.
- `tests/config/booting-branding.test.ts`도 새 기준에 맞춰 `MatchingPool` 미사용을 고정한다.

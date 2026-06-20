# 보증금·뽀찌 결제 — 연결 레이어 설계 (Integration Layer Spec)

> 작성일: 2026-06-20
> 작성: 성준 (매칭/결제 모듈)
> 범위: **토스페이먼츠 ↔ Supabase 연결 레이어만.** 비즈니스 로직은 충현(Codex)이 이어받음.

---

## 0. 이 문서의 목적과 경계

성준은 **결제가 실제로 통하는 배관(plumbing)** 까지만 만든다. 그 위의 기능 로직은 충현(Codex)이 이어받는다.

| 구분 | 담당 | 내용 |
|------|------|------|
| **In scope (성준)** | 이 문서 | 토스 SDK 연동, 승인/취소 API 라우트, Supabase 결제 스키마 마이그레이션, 서버 클라이언트, 핸드오프 문서 |
| **Out of scope (충현)** | 별도 | 매칭 상태머신, 코드 인증 UI, QnA 게이팅, 뽀찌 UX, 노쇼 패널티 로직 |

**핸드오프 산출물:** 동작하는 연결 레이어 코드 + `docs/handoff/PAYMENT_HANDOFF.md`(엔드포인트·함수 시그니처·env·테이블·TODO).

---

## 1. 확정된 제품 결정 (브레인스토밍 결과)

1. **결제 채널**: 토스페이먼츠 **결제위젯**. 카카오페이/토스페이/카드가 한 화면에 자동 노출 (카카오페이 별도 연동 불필요).
2. **보증금**: 매칭 확정 시 **각 팀 팀장이 일괄 결제**(팀원 각자 아님). 양 팀 팀장 결제 완료 → 매칭 확정 → QnA 오픈.
3. **성사 판정**: 양측이 **서로 상대 화면의 6자리 코드를 입력**(상호 인증). 양쪽 일치 → 성사.
4. **환불/몰수**: 성사 시 **100% 환불**. 노쇼 시 **플랫폼 몰수 + 노쇼팀 패널티**(P2P 송금 없음).
5. **뽀찌(팁)**: 과팅 후 자율 금액 결제 (운영비 성격).

> P2P 송금을 버렸기 때문에 지급대행·정산 사업자 이슈가 없고, 토스 **결제 + 취소(환불) API**만으로 전부 커버된다.

---

## 2. 기존 계약 정렬 (INTERFACE_CONTRACT 준수)

`docs/INTERFACE_CONTRACT.md`에 이미 정의된 이름/enum을 **그대로 사용**한다. 새 이름을 만들지 않는다.

- 테이블: `deposits`, `attendances`, `matches` (모두 성준 소유, 단 `supabase/migrations/`는 공용 → 충현 리뷰 필요)
- `MatchStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'`
- `DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited' | 'compensated'`

### 라이프사이클 매핑

```
matches.status:   scheduled ──▶ confirmed ──▶ completed
                  (보증금 대기)   (양팀 결제,    (코드 인증 성공)
                                  QnA 오픈)
                       │                            │
                       └────────────────────────────┴──▶ cancelled
                          (타임아웃/노쇼로 매칭 파기)

deposits.status:  pending ──▶ paid ──▶ refunded   (성사 → 전액 환불)
                                  └──▶ forfeited   (노쇼 → 몰수)
```

- 노쇼는 `matches`에 별도 상태를 만들지 않고 `attendances`(인증 실패) + `deposits.status='forfeited'` + 패널티로 표현.
- `compensated`(상대팀 보상)는 현재 정책에서 **미사용**(P2P 보상 폐기). enum에는 남겨두되 코드에서 쓰지 않음.

### 계약 변경이 필요한 항목 (→ 충현 리뷰/PR 필수)

- `deposits` 테이블 **컬럼 정의 추가**(아래 3절). 토스 연동 필드(order_id, payment_key 등).
- **신규 테이블** `tips`(뽀찌), `noshow_penalties`(패널티) — 계약에 없음.
- `attendances`에 코드 인증 컬럼 추가.
- 위 변경은 `lib/types.ts` enum 확장이 필요하면 **PR + 충현 리뷰**.

---

## 3. Supabase 스키마 (마이그레이션)

> `supabase/migrations/` 신규 파일 → main 머지 전 **충현 확인 필수**.

### 3-1. `deposits` (컬럼 정의)

```sql
CREATE TABLE deposits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES groups(id),      -- 어느 팀
  payer_user_id UUID NOT NULL REFERENCES users(id),        -- 결제한 팀장 (확장 대비)
  order_id      TEXT NOT NULL UNIQUE,                      -- 서버 생성 UUID, 토스 주문번호
  payment_key   TEXT,                                      -- 토스 승인 후 발급
  amount        INT  NOT NULL,                             -- 원 단위
  method        TEXT,                                      -- 카카오페이/토스페이/카드 (토스 반환)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','refunded','forfeited','compensated')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ,
  canceled_at   TIMESTAMPTZ
);
CREATE INDEX idx_deposits_match ON deposits(match_id);
```

> `payer_user_id` + `group_id` 구조라 나중에 "팀원 각자 결제"로 확장 시 **행만 늘리면** 된다.

### 3-2. `attendances` (코드 인증 컬럼)

```sql
-- 만남 인증: 각 팀이 6자리 코드를 받고, 상대 팀 코드를 입력해 검증
ALTER TABLE attendances
  ADD COLUMN code TEXT,                       -- 우리 팀에 표시되는 6자리
  ADD COLUMN verified_by_opponent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN verified_at TIMESTAMPTZ;
-- (attendances가 아직 없으면 충현/성준 합의로 신규 생성)
```

### 3-3. `tips` (뽀찌, 신규)

```sql
CREATE TABLE tips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id),
  payer_user_id UUID NOT NULL REFERENCES users(id),
  order_id      TEXT NOT NULL UNIQUE,
  payment_key   TEXT,
  amount        INT  NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ
);
```

### 3-4. `noshow_penalties` (패널티, 신규)

```sql
CREATE TABLE noshow_penalties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  group_id      UUID REFERENCES groups(id),
  match_id      UUID NOT NULL REFERENCES matches(id),
  reason        TEXT,
  penalty_until TIMESTAMPTZ,                  -- 제재 만료 시점
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3-5. RLS (기본)

- `deposits`/`tips`: 본인(payer_user_id) 또는 같은 매칭 참가자만 SELECT. INSERT/UPDATE는 **서버(service_role)만** — 결제 승인/취소는 서버에서만 일어나므로 클라 쓰기 차단.
- 충현이 세부 RLS를 다듬을 수 있도록 기본 정책 + 주석으로 의도 표기.

---

## 4. 토스페이먼츠 연결 (코드 산출물)

### 4-1. 의존성 / 환경변수

```
# 프론트 의존성
@tosspayments/tosspayments-sdk    # 결제위젯 v2

# .env.local (gitignore, 절대 커밋 금지)
NEXT_PUBLIC_SUPABASE_URL=...                 # 충현이 실키 제공
NEXT_PUBLIC_SUPABASE_ANON_KEY=...            # 실키
SUPABASE_SERVICE_ROLE_KEY=...                # 서버 전용, 클라 노출 절대 금지
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...      # 토스 공개 테스트키
TOSS_SECRET_KEY=test_sk_...                  # 토스 시크릿 테스트키, 서버 전용
```

> service_role 키와 TOSS_SECRET_KEY는 채팅에 붙여넣지 않고 `.env.local`에 직접 입력. `.gitignore` 확인 필수.

### 4-2. 서버 Supabase 클라이언트 (신규)

현재 `lib/supabase.ts`는 **브라우저 클라이언트만** 있음. 결제 승인/취소는 service_role이 필요하므로 서버 클라이언트 추가:

```
lib/supabase-server.ts   # createServerClient(service_role) — 서버 라우트 전용
```

> `lib/supabase.ts`(공용) 자체는 건드리지 않고 새 파일로 분리 → 충현 영향 최소화.

### 4-3. 결제 흐름 (라우트 핸들러)

```
[팀장] 보증금 결제
  1) POST /api/payments/deposit/prepare
       body: { match_id }
       → order_id(UUID) 발급, deposits row(status=pending) 생성
       → res: { orderId, amount, clientKey, orderName }
  2) 프론트: 결제위젯 렌더 → 사용자 결제 → 토스가 successUrl 리다이렉트
       (?paymentKey&orderId&amount)
  3) POST /api/payments/confirm
       body: { paymentKey, orderId, amount }
       → 저장된 amount와 대조 (위변조 차단)
       → 토스 POST /v1/payments/confirm (Authorization: Basic base64(secret:))
       → deposits row: status=paid, payment_key, method, paid_at
       → 멱등: 이미 paid면 skip
       → (충현 로직 훅) 양 팀 paid? → matches.status=confirmed
  환불:  POST /api/payments/cancel
       body: { paymentKey, reason }
       → 토스 POST /v1/payments/{paymentKey}/cancel (전액)
       → deposits row: status=refunded, canceled_at
  뽀찌:  /api/payments/tip/prepare + 동일 confirm 재사용 (tips 테이블)
```

### 4-4. 동작 검증용 최소 테스트 페이지

`app/match/payment-test/page.tsx` — 테스트키로 prepare→위젯→confirm→cancel **라운드트립**을 눈으로 확인하는 임시 페이지. (충현 인수 후 실제 매칭 플로우에 연결되면 제거)

---

## 5. 핸드오프 문서 (`docs/handoff/PAYMENT_HANDOFF.md`)

충현(Codex)이 이어받을 수 있게 다음을 명시:

1. **준비된 엔드포인트**: prepare/confirm/cancel 시그니처(요청·응답 JSON)
2. **준비된 함수**: `lib/payments/toss.ts`의 `confirmPayment()`, `cancelPayment()` 시그니처
3. **env 키 위치**와 의미 (테스트키 vs 실키, 서버/클라 구분)
4. **테이블 구조**와 status 전이 규칙
5. **충현 TODO 훅 지점** (주석 `// TODO(충현):` 으로 코드에 표시)
   - confirm 성공 후 "양 팀 결제 완료 → matches.confirmed" 판정
   - 코드 인증 성공 → cancel(환불) 호출
   - 노쇼 판정 → forfeited 처리 + penalty insert
   - QnA 게이팅(matches.status==confirmed)
   - 뽀찌 UX

---

## 5-1. 선행 의존성 — 최소 stub 테이블 (확정: A)

현재 `supabase/migrations/`에는 **충현의 프로필 테이블만** 존재한다. `deposits`가 참조하는 `matches`/`groups`(성준 소유, 미구현)가 아직 없다. 테스트키로 결제 라운드트립을 실제 검증하려면 이 FK가 풀려야 한다.

**결정: 최소 stub 테이블을 이 작업에서 생성한다.**

```sql
-- 결제 연결 검증용 최소 stub. 추후 성준이 실제 매칭 스키마로 확장(ALTER).
CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK (status IN ('scheduled','confirmed','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `users`는 기존 `profiles` 마이그레이션이 이미 참조하므로 존재한다고 가정(없으면 Supabase `auth.users` 연동 확인).
- stub은 **결제 연결 검증 전용**이며, 실제 그룹/매칭 컬럼은 성준이 이후 `ALTER TABLE`로 확장한다. 핸드오프 문서에 "stub임"을 명시한다.
- 이 stub 역시 `supabase/migrations/` 신규 파일 → **충현 확인 후** 머지.

---

## 6. 보안 / 신뢰성 체크리스트

- [ ] `TOSS_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 서버 전용 — 클라 번들에 미포함
- [ ] confirm 시 서버 저장 금액 ↔ 토스 반환 금액 대조
- [ ] order_id 서버 생성 UUID, confirm 멱등 처리
- [ ] deposits/tips INSERT·UPDATE는 service_role만 (RLS)
- [ ] `.env.local` gitignore 확인
- [ ] 토스 webhook(가상계좌 등 비동기)은 MVP 범위 밖 — 동기 confirm으로 충분, 핸드오프에 "추후" 표기

---

## 7. 협업 규칙 (CLAUDE.md / INTERFACE_CONTRACT)

- `supabase/migrations/` 신규 파일 → **충현 확인 후** main 머지
- `lib/types.ts` 수정(enum 확장 등) → **PR + 충현 리뷰**
- `lib/supabase.ts` 미수정(새 파일 `lib/supabase-server.ts`로 분리)
- 작업은 `app/match/`, `app/api/payments/`, `lib/payments/` 범위 내 (성준 영역)
- 구현 완료 후 **Codex 감사**(`/codex:review`) — CLAUDE.md 감사 프로토콜 준수

---

## 8. 범위 밖 (충현 TODO 요약)

- 매칭 상태머신 전이 로직 (scheduled→confirmed→completed/cancelled)
- 코드 인증 UI + Supabase Realtime 구독
- QnA 게이팅
- 뽀찌 입력 UX / 추천 금액
- 노쇼 신고 → 관리자 판정 → forfeited + 패널티 적용
- 패널티 기반 매칭 제한(penalty_until 체크)

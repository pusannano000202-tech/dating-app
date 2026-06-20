# 보증금·뽀찌 결제 연결 레이어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 토스페이먼츠 결제위젯으로 보증금·뽀찌 결제가 테스트키로 실제 도는 연결 레이어를 만들고, 비즈니스 로직은 충현(Codex)이 이어받을 수 있게 핸드오프한다.

**Architecture:** Next.js 14 App Router. 프론트는 토스 결제위젯 SDK로 결제 요청 → 토스가 successUrl로 리다이렉트 → 서버 라우트(`/api/payments/*`)가 service_role로 토스 승인/취소 API를 호출하고 Supabase `deposits`/`tips`에 기록. 결제 로직(승인·취소·금액검증·멱등)은 `lib/payments/`에 순수 모듈로 분리해 단위 테스트하고, 라우트는 얇게 위임한다.

**Tech Stack:** Next.js 14, TypeScript, Supabase (@supabase/ssr, service_role), `@tosspayments/tosspayments-sdk` (위젯 v2), Vitest (단위 테스트).

---

## File Structure

| 파일 | 책임 |
|------|------|
| `supabase/migrations/20260620_payment_create_tables.sql` | stub `groups`/`matches`, `deposits` 컬럼, `attendances` 코드 컬럼, `tips`, `noshow_penalties`, RLS |
| `lib/payments/config.ts` | 결제 상수 (보증금 금액, 통화, 토스 API base URL) |
| `lib/payments/toss.ts` | 토스 confirm/cancel REST 래퍼 (순수, fetch 주입 가능) |
| `lib/payments/orders.ts` | order_id 생성, 금액 검증 헬퍼 (순수) |
| `lib/supabase-server.ts` | service_role 서버 클라이언트 (신규, `lib/supabase.ts` 미수정) |
| `app/api/payments/deposit/prepare/route.ts` | 보증금 주문 생성 |
| `app/api/payments/confirm/route.ts` | 승인(deposit·tip 공용) |
| `app/api/payments/cancel/route.ts` | 환불 |
| `app/api/payments/tip/prepare/route.ts` | 뽀찌 주문 생성 |
| `app/match/payment-test/page.tsx` | 테스트키 라운드트립 검증용 임시 페이지 |
| `docs/handoff/PAYMENT_HANDOFF.md` | 충현 인수 문서 |
| `lib/payments/__tests__/*.test.ts` | toss/orders 단위 테스트 |
| `vitest.config.ts` | 테스트 설정 |

**협업 규칙:** `supabase/migrations/` 신규 파일은 충현 확인 후 머지. `lib/types.ts`/`lib/supabase.ts`/`lib/constants.ts`는 수정하지 않는다(공용). 모든 결제 코드는 `app/match/`, `app/api/payments/`, `lib/payments/`, `lib/supabase-server.ts` 범위 내.

---

## Task 1: 의존성 · 환경변수 · gitignore

**Files:**
- Modify: `package.json` (dependencies)
- Create: `.env.local.example`
- Modify: `.gitignore` (확인)

- [ ] **Step 1: 토스 SDK + vitest 설치**

Run:
```bash
npm install @tosspayments/tosspayments-sdk
npm install -D vitest
```
Expected: `package.json`에 `@tosspayments/tosspayments-sdk` (dependencies), `vitest` (devDependencies) 추가.

- [ ] **Step 2: `.gitignore`에 `.env.local` 포함 확인**

Run:
```bash
grep -n ".env" .gitignore
```
Expected: `.env*.local` 또는 `.env.local` 라인 존재. 없으면 `.env*.local` 한 줄 추가.

- [ ] **Step 3: `.env.local.example` 작성 (실키 아님, 자리표시)**

Create `.env.local.example`:
```
# Supabase (충현이 실키 제공 — .env.local에 직접 입력)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 전용, 절대 NEXT_PUBLIC_ 금지

# Toss Payments (공개 테스트키)
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_docs_dummy
TOSS_SECRET_KEY=test_sk_docs_dummy  # 서버 전용
```

- [ ] **Step 4: `.env.local` 생성 안내 주석 확인 후 커밋**

Run:
```bash
git add package.json package-lock.json .env.local.example .gitignore
git commit -m "chore: add toss sdk + vitest deps and env template"
```
Expected: 커밋 성공. `.env.local`은 커밋되지 않음(gitignore).

> **실키 입력(수동):** 실행자는 `.env.local`을 만들어 Supabase 실키와 토스 공개 테스트키(`test_ck_...`, `test_sk_...`, [토스 개발자센터](https://developers.tosspayments.com) 제공)를 직접 입력한다. service_role/secret 키는 채팅·커밋 금지.

---

## Task 2: Vitest 설정

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: `vitest.config.ts` 작성**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: `package.json`에 test 스크립트 추가**

Modify `package.json` scripts 객체에 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 빈 테스트로 러너 동작 확인**

Create `lib/payments/__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 4: 커밋**

```bash
git add vitest.config.ts package.json lib/payments/__tests__/smoke.test.ts
git commit -m "chore: set up vitest for payment lib unit tests"
```

---

## Task 3: 결제 상수

**Files:**
- Create: `lib/payments/config.ts`

- [ ] **Step 1: 상수 작성**

Create `lib/payments/config.ts`:
```typescript
// 결제 전용 상수. lib/constants.ts(공용)는 건드리지 않는다.

/** 팀장 1인이 내는 보증금 (원). 추후 정책에 맞게 조정. */
export const DEPOSIT_AMOUNT_KRW = 10000

/** 결제 통화 */
export const CURRENCY = 'KRW' as const

/** 토스페이먼츠 REST API base URL */
export const TOSS_API_BASE = 'https://api.tosspayments.com'

/** 뽀찌 최소/최대 금액 (원) */
export const TIP_MIN_KRW = 1000
export const TIP_MAX_KRW = 100000
```

- [ ] **Step 2: 커밋**

```bash
git add lib/payments/config.ts
git commit -m "feat: add payment config constants"
```

---

## Task 4: order/amount 헬퍼 (TDD)

**Files:**
- Create: `lib/payments/orders.ts`
- Test: `lib/payments/__tests__/orders.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `lib/payments/__tests__/orders.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateOrderId, assertAmountMatches } from '../orders'

describe('generateOrderId', () => {
  it('returns a 6-64 char id with a prefix', () => {
    const id = generateOrderId('deposit')
    expect(id.startsWith('deposit_')).toBe(true)
    expect(id.length).toBeGreaterThanOrEqual(6)
    expect(id.length).toBeLessThanOrEqual(64)
  })

  it('returns unique ids', () => {
    expect(generateOrderId('deposit')).not.toBe(generateOrderId('deposit'))
  })
})

describe('assertAmountMatches', () => {
  it('passes when expected equals actual', () => {
    expect(() => assertAmountMatches(10000, 10000)).not.toThrow()
  })

  it('throws when amounts differ (tamper guard)', () => {
    expect(() => assertAmountMatches(10000, 1)).toThrow(/amount mismatch/i)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- orders`
Expected: FAIL ("Cannot find module '../orders'").

- [ ] **Step 3: 구현**

Create `lib/payments/orders.ts`:
```typescript
import { randomUUID } from 'crypto'

/** 토스 orderId 규칙(6~64자, 영숫자/-_=)에 맞는 고유 주문번호 생성 */
export function generateOrderId(prefix: 'deposit' | 'tip'): string {
  return `${prefix}_${randomUUID()}`
}

/**
 * 서버가 저장한 금액과 클라이언트가 보낸 금액을 대조한다.
 * 불일치 시 위변조로 간주하고 throw.
 */
export function assertAmountMatches(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new Error(`amount mismatch: expected ${expected}, got ${actual}`)
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- orders`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/payments/orders.ts lib/payments/__tests__/orders.test.ts
git commit -m "feat: add order id + amount validation helpers"
```

---

## Task 5: 토스 confirm/cancel 래퍼 (TDD)

**Files:**
- Create: `lib/payments/toss.ts`
- Test: `lib/payments/__tests__/toss.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (fetch 주입 모킹)**

Create `lib/payments/__tests__/toss.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { confirmPayment, cancelPayment } from '../toss'

const secret = 'test_sk_xxx'

describe('confirmPayment', () => {
  it('calls toss confirm with Basic auth and returns payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'DONE', method: '카카오페이', paymentKey: 'pk_1' }),
    })
    const res = await confirmPayment(
      { paymentKey: 'pk_1', orderId: 'deposit_1', amount: 10000 },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    )
    expect(res.status).toBe('DONE')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from(secret + ':').toString('base64'),
    )
    expect(JSON.parse(init.body as string)).toEqual({
      paymentKey: 'pk_1', orderId: 'deposit_1', amount: 10000,
    })
  })

  it('throws with toss error message on non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'ALREADY_PROCESSED', message: '이미 처리됨' }),
    })
    await expect(
      confirmPayment(
        { paymentKey: 'pk_1', orderId: 'o', amount: 1 },
        { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/이미 처리됨/)
  })
})

describe('cancelPayment', () => {
  it('posts to cancel endpoint with cancelReason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'CANCELED' }),
    })
    const res = await cancelPayment(
      { paymentKey: 'pk_1', cancelReason: '과팅 성사 환불' },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    )
    expect(res.status).toBe('CANCELED')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/pk_1/cancel')
    expect(JSON.parse(init.body as string)).toEqual({ cancelReason: '과팅 성사 환불' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- toss`
Expected: FAIL ("Cannot find module '../toss'").

- [ ] **Step 3: 구현**

Create `lib/payments/toss.ts`:
```typescript
import { TOSS_API_BASE } from './config'

export interface TossPayment {
  status: string
  method?: string
  paymentKey?: string
  [key: string]: unknown
}

interface TossOptions {
  secretKey: string
  /** 테스트용 주입. 미지정 시 전역 fetch 사용 */
  fetchFn?: typeof fetch
}

function authHeader(secretKey: string): string {
  return 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
}

async function postToss(
  url: string,
  body: Record<string, unknown>,
  { secretKey, fetchFn = fetch }: TossOptions,
): Promise<TossPayment> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(secretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message ?? 'Toss API error')
  }
  return data as TossPayment
}

export function confirmPayment(
  params: { paymentKey: string; orderId: string; amount: number },
  opts: TossOptions,
): Promise<TossPayment> {
  return postToss(`${TOSS_API_BASE}/v1/payments/confirm`, params, opts)
}

export function cancelPayment(
  params: { paymentKey: string; cancelReason: string },
  opts: TossOptions,
): Promise<TossPayment> {
  return postToss(
    `${TOSS_API_BASE}/v1/payments/${params.paymentKey}/cancel`,
    { cancelReason: params.cancelReason },
    opts,
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- toss`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/payments/toss.ts lib/payments/__tests__/toss.test.ts
git commit -m "feat: add toss confirm/cancel rest wrappers with unit tests"
```

---

## Task 6: Supabase 마이그레이션 (stub + 결제 테이블)

**Files:**
- Create: `supabase/migrations/20260620_payment_create_tables.sql`

> ⚠️ 이 파일은 머지 전 **충현 확인 필수** (협업 규칙).

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `supabase/migrations/20260620_payment_create_tables.sql`:
```sql
-- 결제 연결 레이어. stub groups/matches는 검증 전용이며 성준이 추후 ALTER로 확장한다.

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

CREATE TABLE IF NOT EXISTS deposits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES groups(id),
  payer_user_id UUID NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,
  payment_key   TEXT,
  amount        INT  NOT NULL,
  method        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','refunded','forfeited','compensated')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ,
  canceled_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deposits_match ON deposits(match_id);

CREATE TABLE IF NOT EXISTS tips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id),
  payer_user_id UUID NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,
  payment_key   TEXT,
  amount        INT  NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS noshow_penalties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  group_id      UUID REFERENCES groups(id),
  match_id      UUID NOT NULL REFERENCES matches(id),
  reason        TEXT,
  penalty_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 만남 상호 인증 (충현이 attendances 본체를 만들면 ALTER로 병합)
CREATE TABLE IF NOT EXISTS attendances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             UUID NOT NULL REFERENCES matches(id),
  group_id             UUID NOT NULL REFERENCES groups(id),
  code                 TEXT,
  verified_by_opponent BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: 결제 기록은 서버(service_role)만 쓴다. service_role은 RLS를 우회하므로
-- 클라이언트(anon)에는 정책을 부여하지 않아 기본 거부 상태로 둔다.
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips     ENABLE ROW LEVEL SECURITY;
-- TODO(충현): 참가자 본인 SELECT 허용 정책은 매칭 참가자 모델 확정 후 추가.
```

- [ ] **Step 2: 로컬/원격 Supabase에 적용**

Supabase CLI 사용 시:
```bash
supabase db push
```
또는 Supabase 대시보드 SQL Editor에 위 SQL 붙여넣어 실행.
Expected: 6개 테이블 생성, 에러 없음. (`auth.users` 사용 시 `payer_user_id`는 FK 미설정으로 두어 stub 단계 충돌 방지)

- [ ] **Step 3: 적용 확인**

Supabase SQL Editor에서:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in
('groups','matches','deposits','tips','noshow_penalties','attendances');
```
Expected: 6개 행 반환.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260620_payment_create_tables.sql
git commit -m "feat: add payment tables migration (stub groups/matches, deposits, tips, penalties)"
```

---

## Task 7: 서버 Supabase 클라이언트

**Files:**
- Create: `lib/supabase-server.ts`

> `lib/supabase.ts`(공용)는 수정하지 않는다.

- [ ] **Step 1: service_role 클라이언트 작성**

Create `lib/supabase-server.ts`:
```typescript
// 서버 전용 Supabase 클라이언트 (service_role). API 라우트에서만 import.
// service_role 키는 절대 클라이언트 번들에 노출 금지 — NEXT_PUBLIC_ 접두사 사용 안 함.
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/supabase-server.ts
git commit -m "feat: add service-role supabase server client"
```

---

## Task 8: 보증금 prepare 라우트

**Files:**
- Create: `app/api/payments/deposit/prepare/route.ts`

- [ ] **Step 1: 라우트 작성**

Create `app/api/payments/deposit/prepare/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateOrderId } from '@/lib/payments/orders'
import { DEPOSIT_AMOUNT_KRW } from '@/lib/payments/config'

export async function POST(req: Request) {
  const { match_id, group_id, payer_user_id } = await req.json()
  if (!match_id || !group_id || !payer_user_id) {
    return NextResponse.json({ error: 'match_id, group_id, payer_user_id required' }, { status: 400 })
  }

  const orderId = generateOrderId('deposit')
  const amount = DEPOSIT_AMOUNT_KRW
  const supabase = createServiceClient()

  const { error } = await supabase.from('deposits').insert({
    match_id, group_id, payer_user_id,
    order_id: orderId, amount, status: 'pending',
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName: 'Destiny 과팅 보증금',
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  })
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음. (`@/` 별칭이 `tsconfig.json`에 없으면 상대경로로 교체.)

- [ ] **Step 3: 커밋**

```bash
git add app/api/payments/deposit/prepare/route.ts
git commit -m "feat: add deposit prepare route (creates order + pending deposit)"
```

---

## Task 9: confirm 라우트 (승인 · 금액검증 · 멱등)

**Files:**
- Create: `app/api/payments/confirm/route.ts`

- [ ] **Step 1: 라우트 작성 (deposit·tip 공용)**

Create `app/api/payments/confirm/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { confirmPayment } from '@/lib/payments/toss'
import { assertAmountMatches } from '@/lib/payments/orders'

// orderId 접두사로 deposit/tip 테이블을 분기
function tableFor(orderId: string): 'deposits' | 'tips' | null {
  if (orderId.startsWith('deposit_')) return 'deposits'
  if (orderId.startsWith('tip_')) return 'tips'
  return null
}

export async function POST(req: Request) {
  const { paymentKey, orderId, amount } = await req.json()
  const table = tableFor(orderId)
  if (!paymentKey || !orderId || typeof amount !== 'number' || !table) {
    return NextResponse.json({ error: 'invalid confirm payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error: readErr } = await supabase
    .from(table).select('*').eq('order_id', orderId).single()
  if (readErr || !row) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 })
  }

  // 멱등: 이미 결제 완료면 그대로 성공 반환
  if (row.status === 'paid') {
    return NextResponse.json({ status: 'paid', idempotent: true })
  }

  // 위변조 차단: 서버 저장 금액 ↔ 클라이언트 금액 ↔ 요청 금액
  try {
    assertAmountMatches(row.amount, amount)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  let payment
  try {
    payment = await confirmPayment(
      { paymentKey, orderId, amount },
      { secretKey: process.env.TOSS_SECRET_KEY! },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  const patch =
    table === 'deposits'
      ? { status: 'paid', payment_key: paymentKey, method: payment.method, paid_at: new Date().toISOString() }
      : { status: 'paid', payment_key: paymentKey, paid_at: new Date().toISOString() }

  const { error: updErr } = await supabase.from(table).update(patch).eq('order_id', orderId)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // TODO(충현): deposits인 경우 같은 match_id의 양 팀이 모두 paid면 matches.status='confirmed'로 전이.
  return NextResponse.json({ status: 'paid', method: payment.method })
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/payments/confirm/route.ts
git commit -m "feat: add confirm route with amount check + idempotency (deposit/tip)"
```

---

## Task 10: cancel(환불) 라우트

**Files:**
- Create: `app/api/payments/cancel/route.ts`

- [ ] **Step 1: 라우트 작성**

Create `app/api/payments/cancel/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { cancelPayment } from '@/lib/payments/toss'

export async function POST(req: Request) {
  const { orderId, reason } = await req.json()
  if (!orderId || !orderId.startsWith('deposit_')) {
    return NextResponse.json({ error: 'valid deposit orderId required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error: readErr } = await supabase
    .from('deposits').select('*').eq('order_id', orderId).single()
  if (readErr || !row) {
    return NextResponse.json({ error: 'deposit not found' }, { status: 404 })
  }
  if (row.status !== 'paid') {
    return NextResponse.json({ error: `cannot refund deposit in status ${row.status}` }, { status: 409 })
  }
  if (!row.payment_key) {
    return NextResponse.json({ error: 'no payment_key on deposit' }, { status: 409 })
  }

  try {
    await cancelPayment(
      { paymentKey: row.payment_key, cancelReason: reason ?? '과팅 성사 환불' },
      { secretKey: process.env.TOSS_SECRET_KEY! },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  const { error: updErr } = await supabase
    .from('deposits')
    .update({ status: 'refunded', canceled_at: new Date().toISOString() })
    .eq('order_id', orderId)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // TODO(충현): 노쇼 케이스는 cancel 호출 없이 deposits.status='forfeited'로 두고 패널티 insert.
  return NextResponse.json({ status: 'refunded' })
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/payments/cancel/route.ts
git commit -m "feat: add deposit refund (cancel) route"
```

---

## Task 11: 뽀찌 prepare 라우트

**Files:**
- Create: `app/api/payments/tip/prepare/route.ts`

- [ ] **Step 1: 라우트 작성 (금액은 자율, 범위 검증)**

Create `app/api/payments/tip/prepare/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateOrderId } from '@/lib/payments/orders'
import { TIP_MIN_KRW, TIP_MAX_KRW } from '@/lib/payments/config'

export async function POST(req: Request) {
  const { match_id, payer_user_id, amount } = await req.json()
  if (!match_id || !payer_user_id || typeof amount !== 'number') {
    return NextResponse.json({ error: 'match_id, payer_user_id, amount required' }, { status: 400 })
  }
  if (amount < TIP_MIN_KRW || amount > TIP_MAX_KRW) {
    return NextResponse.json({ error: `amount must be ${TIP_MIN_KRW}~${TIP_MAX_KRW}` }, { status: 400 })
  }

  const orderId = generateOrderId('tip')
  const supabase = createServiceClient()
  const { error } = await supabase.from('tips').insert({
    match_id, payer_user_id, order_id: orderId, amount, status: 'pending',
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName: 'Destiny 뽀찌',
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  })
}
```

- [ ] **Step 2: 타입체크 + 커밋**

Run: `npm run typecheck`
Expected: 에러 없음.
```bash
git add app/api/payments/tip/prepare/route.ts
git commit -m "feat: add tip prepare route with amount range validation"
```

---

## Task 12: 테스트 페이지 (라운드트립 검증)

**Files:**
- Create: `app/match/payment-test/page.tsx`

- [ ] **Step 1: 결제위젯 페이지 작성**

Create `app/match/payment-test/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk'

// 임시 검증 페이지. 충현 인수 후 실제 매칭 플로우에 연결되면 삭제.
export default function PaymentTestPage() {
  const [ready, setReady] = useState(false)
  const [order, setOrder] = useState<{ orderId: string; amount: number; orderName: string } | null>(null)
  // 검증용 더미 식별자 (stub matches/groups에 실제 행을 하나 만들어 두고 그 id 사용)
  const DUMMY = { match_id: '', group_id: '', payer_user_id: '' }

  useEffect(() => {
    if (!order) return
    let widgets: Awaited<ReturnType<Awaited<ReturnType<typeof loadTossPayments>>['widgets']>>
    ;(async () => {
      const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
      widgets = toss.widgets({ customerKey: ANONYMOUS })
      await widgets.setAmount({ currency: 'KRW', value: order.amount })
      await widgets.renderPaymentMethods({ selector: '#payment-methods' })
      await widgets.renderAgreement({ selector: '#agreement' })
      setReady(true)
    })()
  }, [order])

  async function prepare() {
    const res = await fetch('/api/payments/deposit/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DUMMY),
    })
    setOrder(await res.json())
  }

  async function pay() {
    const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
    const widgets = toss.widgets({ customerKey: ANONYMOUS })
    await widgets.setAmount({ currency: 'KRW', value: order!.amount })
    await widgets.requestPayment({
      orderId: order!.orderId,
      orderName: order!.orderName,
      successUrl: `${window.location.origin}/match/payment-test/success`,
      failUrl: `${window.location.origin}/match/payment-test`,
    })
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>결제 연결 테스트</h1>
      <p>1) match/group/payer id를 채우고 prepare → 2) 결제하기(카카오페이/토스페이 선택)</p>
      <button onClick={prepare}>① prepare</button>
      <div id="payment-methods" />
      <div id="agreement" />
      {ready && <button onClick={pay}>② 결제하기</button>}
    </div>
  )
}
```

- [ ] **Step 2: success 페이지 작성 (confirm 호출)**

Create `app/match/payment-test/success/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'

export default function SuccessPage() {
  const [result, setResult] = useState<string>('confirming...')
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentKey: p.get('paymentKey'),
        orderId: p.get('orderId'),
        amount: Number(p.get('amount')),
      }),
    })
      .then((r) => r.json())
      .then((d) => setResult(JSON.stringify(d)))
  }, [])
  return <pre style={{ padding: 24 }}>{result}</pre>
}
```

- [ ] **Step 3: 수동 라운드트립 검증**

Run: `npm run dev`
1. `.env.local`에 Supabase 실키 + 토스 테스트키 입력 확인.
2. Supabase에 stub `groups`/`matches` 행을 1개씩 INSERT하고 그 id를 페이지 `DUMMY`에 입력.
3. `http://localhost:3000/match/payment-test` 접속 → ① prepare → 결제수단에 **카카오페이/토스페이** 노출 확인 → ② 결제하기 → 토스 테스트 결제 완료.
4. success 페이지에 `{"status":"paid","method":...}` 확인.
5. Supabase `deposits`에서 해당 order의 `status='paid'`, `payment_key` 채워짐 확인.
6. (선택) `/api/payments/cancel`에 해당 orderId POST → `status='refunded'` 확인.

Expected: 결제 → paid → (환불 시) refunded 전이가 DB에 반영됨.

- [ ] **Step 4: 커밋**

```bash
git add app/match/payment-test/
git commit -m "feat: add payment round-trip test page (temporary, for handoff verification)"
```

---

## Task 13: 핸드오프 문서

**Files:**
- Create: `docs/handoff/PAYMENT_HANDOFF.md`

- [ ] **Step 1: 핸드오프 문서 작성**

Create `docs/handoff/PAYMENT_HANDOFF.md`:
```markdown
# 결제 연결 레이어 — 충현(Codex) 인수 문서

성준이 토스페이먼츠 결제 연결(plumbing)까지 완료. 충현은 비즈니스 로직을 이어받는다.

## 준비된 엔드포인트

| 메서드 | 경로 | 요청 body | 응답 |
|--------|------|-----------|------|
| POST | `/api/payments/deposit/prepare` | `{ match_id, group_id, payer_user_id }` | `{ orderId, amount, orderName, clientKey }` |
| POST | `/api/payments/confirm` | `{ paymentKey, orderId, amount }` | `{ status:'paid', method }` (deposit/tip 공용, orderId 접두사로 분기) |
| POST | `/api/payments/cancel` | `{ orderId, reason? }` | `{ status:'refunded' }` (deposit 전액 환불) |
| POST | `/api/payments/tip/prepare` | `{ match_id, payer_user_id, amount }` | `{ orderId, amount, orderName, clientKey }` |

## 준비된 함수 (`lib/payments/`)
- `confirmPayment({paymentKey,orderId,amount}, {secretKey})` → 토스 승인
- `cancelPayment({paymentKey,cancelReason}, {secretKey})` → 토스 취소
- `generateOrderId('deposit'|'tip')`, `assertAmountMatches(expected, actual)`
- `lib/supabase-server.ts` `createServiceClient()` (service_role)

## env 키
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` (공개), `TOSS_SECRET_KEY` (서버 전용)
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용), `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`

## 테이블 / status 전이
- `deposits.status`: pending → paid → refunded(성사) / forfeited(노쇼)
- `tips.status`: pending → paid / failed
- `matches.status`: scheduled → confirmed → completed / cancelled
- `groups`/`matches`는 **stub** — 실제 컬럼은 성준이 ALTER로 확장 예정.

## 충현 TODO (코드 내 `// TODO(충현):` 주석 위치)
1. confirm 성공 후: 같은 match_id 양 팀 deposit이 모두 paid → `matches.status='confirmed'` (QnA 오픈 트리거)
2. 코드 인증(`attendances`) 성공 → `/api/payments/cancel` 호출(전액 환불) + `matches.status='completed'`
3. 노쇼 판정 → cancel 호출 없이 `deposits.status='forfeited'` + `noshow_penalties` insert + 패널티 기간 적용
4. QnA 게이팅: `matches.status==='confirmed'`에서만 접근
5. 뽀찌 UX: 자율 금액 입력 → tip/prepare → 결제위젯 → confirm
6. RLS: 참가자 본인 SELECT 정책(매칭 참가자 모델 확정 후)
7. `app/match/payment-test/` 임시 페이지 제거

## 검증됨
- 테스트키로 prepare→결제위젯(카카오페이/토스페이)→confirm→DB paid→cancel→DB refunded 라운드트립 동작 확인.
```

- [ ] **Step 2: 커밋**

```bash
git add docs/handoff/PAYMENT_HANDOFF.md
git commit -m "docs: add payment integration handoff doc for Codex"
```

---

## Task 14: 최종 검증 · Codex 감사

- [ ] **Step 1: 전체 테스트 + 타입체크 + 빌드**

Run:
```bash
npm test
npm run typecheck
npm run build
```
Expected: 테스트 all pass, 타입 에러 0, 빌드 성공.

- [ ] **Step 2: Codex 감사 (CLAUDE.md 협업 헌법)**

결제는 보안 민감 변경 → `/codex:review` **및** `/codex:adversarial-review` 실행.
Critical = 0 될 때까지 반영 → 재감사. (이 plan의 "완료"는 Critical 0에서만 선언)

- [ ] **Step 3: 충현 리뷰 요청 (마이그레이션/계약)**

`supabase/migrations/20260620_payment_create_tables.sql`와 핸드오프 문서를 충현에게 전달, 머지 승인 받기.

---

## Self-Review 결과 (작성자 점검)

- **스펙 커버리지:** 결제위젯(Task 12), confirm/cancel(Task 9·10), deposits/attendances/tips/penalties + stub(Task 6), 서버 클라이언트(Task 7), 핸드오프(Task 13), 보안 체크리스트(Task 9 금액검증·멱등, Task 7 service_role) — 스펙 1~8 전 항목 매핑됨.
- **플레이스홀더:** 코드 단계 전부 실제 코드 포함. `// TODO(충현):`는 의도된 핸드오프 훅(범위 밖)이며 실행자 작업 아님.
- **타입 일관성:** `confirmPayment`/`cancelPayment`/`generateOrderId`/`assertAmountMatches`/`createServiceClient` 시그니처가 정의 Task(4·5·7)와 사용 Task(9·10·11)에서 일치.
- **알려진 제약:** `@/` 경로 별칭이 없으면 상대경로로 교체(Task 8·9·10·11 Step에 명시). 토스 webhook(가상계좌 비동기)은 의도적으로 범위 밖.

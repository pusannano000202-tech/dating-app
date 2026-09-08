import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

type DepositModule = {
  DepositApiError: new (code: string, status?: number) => Error & { code: string; status?: number };
  createDepositApi(options: {
    origin: string;
    getAccessToken: () => Promise<string | null>;
    fetchImpl?: typeof fetch;
  }): {
    getDepositOverview(input: { matchId: string; groupId: string }): Promise<{
      amount: number;
      deposit: null | {
        id: string;
        matchId: string;
        groupId: string;
        amount: number;
        status: 'pending' | 'paid' | 'held';
        paidAt: string | null;
        createdAt: string;
      };
    }>;
    chooseDepositCarryover(input: { matchId: string }): Promise<{ status: 'available' }>;
    requestFullDepositRefund(input: { matchId: string }): Promise<{ status: 'refunded' }>;
  };
};

const apiModuleUrl = new URL('../src/api/deposit.ts', import.meta.url);
const screenUrl = new URL('../app/deposit.tsx', import.meta.url);
const previewUrl = new URL('../app/dev-deposit-preview.tsx', import.meta.url);
const layoutUrl = new URL('../app/_layout.tsx', import.meta.url);

async function loadApiModule(): Promise<DepositModule> {
  const loaded = await import(apiModuleUrl.href).catch(() => null);
  assert.ok(loaded, 'mobile deposit API module must exist');
  return loaded as DepositModule;
}

const overviewPayload = {
  amount: 10_000,
  my_deposit: {
    id: 'deposit-1',
    match_id: 'match-1',
    user_id: 'user-1',
    group_id: 'group-1',
    amount: 10_000,
    status: 'held',
    paid_at: '2026-08-09T11:00:00.000Z',
    created_at: '2026-08-09T10:00:00.000Z',
  },
};

test('deposit overview sends Bearer auth and match-scoped query values', async () => {
  const { createDepositApi } = await loadApiModule();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createDepositApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-deposit-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(overviewPayload);
    },
  });

  const result = await api.getDepositOverview({ matchId: 'match-1', groupId: 'group-1' });

  assert.equal(
    calls[0]?.url,
    'https://dating-app-silk.vercel.app/api/deposits?match_id=match-1&group_id=group-1',
  );
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer mobile-deposit-token');
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.deepEqual(result, {
    amount: 10_000,
    deposit: {
      id: 'deposit-1',
      matchId: 'match-1',
      groupId: 'group-1',
      amount: 10_000,
      status: 'held',
      paidAt: '2026-08-09T11:00:00.000Z',
      createdAt: '2026-08-09T10:00:00.000Z',
    },
  });
});

test('deposit API fails closed without a session or valid scope', async () => {
  const { createDepositApi, DepositApiError } = await loadApiModule();
  let calls = 0;
  const api = createDepositApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => null,
    fetchImpl: async () => {
      calls += 1;
      return Response.json(overviewPayload);
    },
  });

  await assert.rejects(
    () => api.getDepositOverview({ matchId: 'match-1', groupId: 'group-1' }),
    (error: unknown) => error instanceof DepositApiError && error.code === 'auth_required',
  );
  await assert.rejects(
    () => api.getDepositOverview({ matchId: '', groupId: 'group-1' }),
    (error: unknown) => error instanceof DepositApiError && error.code === 'deposit_scope_invalid',
  );
  assert.equal(calls, 0);
});

test('deposit API rejects malformed, cross-match, and unsupported status responses', async () => {
  const { createDepositApi, DepositApiError } = await loadApiModule();
  const payloads = [
    { ...overviewPayload, amount: 20_000 },
    { ...overviewPayload, my_deposit: { ...overviewPayload.my_deposit, match_id: 'other-match' } },
    { ...overviewPayload, my_deposit: { ...overviewPayload.my_deposit, status: 'refunded' } },
    { ...overviewPayload, my_deposit: { ...overviewPayload.my_deposit, paid_at: 42 } },
  ];

  for (const payload of payloads) {
    const api = createDepositApi({
      origin: 'https://dating-app-silk.vercel.app',
      getAccessToken: async () => 'mobile-deposit-token',
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(
      () => api.getDepositOverview({ matchId: 'match-1', groupId: 'group-1' }),
      (error: unknown) => error instanceof DepositApiError && error.code === 'invalid_response',
    );
  }
});

test('deposit API accepts an explicit empty match-scoped result', async () => {
  const { createDepositApi } = await loadApiModule();
  const api = createDepositApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-deposit-token',
    fetchImpl: async () => Response.json({ amount: 10_000, my_deposit: null }),
  });

  assert.deepEqual(
    await api.getDepositOverview({ matchId: 'match-1', groupId: 'group-1' }),
    { amount: 10_000, deposit: null },
  );
});

test('deposit actions use Bearer auth and the exact carryover and full-refund contracts', async () => {
  const { createDepositApi } = await loadApiModule();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createDepositApi({
    origin: 'https://dating-app-silk.vercel.app',
    getAccessToken: async () => 'mobile-deposit-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/deposit-carryover')) {
        return Response.json({ status: 'available', carryover: { carryover_status: 'available' } });
      }
      return Response.json({
        result: { request_status: 'processed' },
        external_refund: { status: 'refunded', amount: 10_000 },
      });
    },
  });

  assert.deepEqual(await api.chooseDepositCarryover({ matchId: 'match-1' }), { status: 'available' });
  assert.deepEqual(await api.requestFullDepositRefund({ matchId: 'match-1' }), { status: 'refunded' });
  assert.equal(calls[0]?.url, 'https://dating-app-silk.vercel.app/api/matches/match-1/deposit-carryover');
  assert.equal(calls[1]?.url, 'https://dating-app-silk.vercel.app/api/matches/match-1/refund');
  for (const call of calls) {
    assert.equal(call.init?.method, 'POST');
    assert.equal(new Headers(call.init?.headers).get('Authorization'), 'Bearer mobile-deposit-token');
  }
  assert.equal(calls[0]?.init?.body, undefined);
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { refund_amount: 10_000 });
});

test('deposit screen connects refund and carryover while keeping support separate', async () => {
  const [screenSource, previewSource, layoutSource] = await Promise.all([
    readFile(screenUrl, 'utf8').catch(() => ''),
    readFile(previewUrl, 'utf8').catch(() => ''),
    readFile(layoutUrl, 'utf8'),
  ]);
  const protectedBlock = layoutSource.match(/<Stack\.Protected guard=\{Boolean\(session\)\}>([\s\S]*?)<\/Stack\.Protected>/)?.[1] ?? '';

  assert.match(screenSource, /useLocalSearchParams/);
  assert.match(screenSource, /getDepositOverview/);
  assert.match(screenSource, /보증금 10,000원/);
  assert.match(screenSource, /전액 환불/);
  assert.match(screenSource, /다음 매칭에 이월/);
  assert.match(screenSource, /자율 후원/);
  assert.match(screenSource, /chooseDepositCarryover/);
  assert.match(screenSource, /requestFullDepositRefund/);
  assert.match(screenSource, /Alert\.alert/);
  assert.match(screenSource, /ActivityIndicator/);
  assert.match(screenSource, /다시 확인/);
  assert.doesNotMatch(screenSource, /app_fee_amount/);
  assert.match(protectedBlock, /<Stack\.Screen name="deposit" \/>/);
  assert.match(previewSource, /__DEV__/);
  assert.match(previewSource, /DepositScreen preview/);
  assert.match(layoutSource, /__DEV__ \? <Stack\.Screen name="dev-deposit-preview" \/>/);
});

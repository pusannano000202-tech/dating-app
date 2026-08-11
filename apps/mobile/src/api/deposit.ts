import { readMobileConfig } from '../config/runtime';

const DEPOSITS_PATH = '/api/deposits';
const DEPOSIT_AMOUNT = 10_000;
const ACTIVE_DEPOSIT_STATUSES = new Set(['pending', 'paid', 'held']);

export type MobileDepositStatus = 'pending' | 'paid' | 'held';

export type MobileDeposit = {
  id: string;
  matchId: string;
  groupId: string;
  amount: number;
  status: MobileDepositStatus;
  paidAt: string | null;
  createdAt: string;
};

export type MobileDepositOverview = {
  amount: number;
  deposit: MobileDeposit | null;
};

export type MobileDepositCarryoverResult = { status: 'available' };
export type MobileDepositRefundResult = { status: 'refunded' };

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type DepositApiOptions = {
  origin: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  allowInsecureLoopbackHttp?: boolean;
};

export class DepositApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'DepositApiError';
  }
}

export function createDepositApi({
  origin,
  getAccessToken,
  fetchImpl = fetch,
  allowInsecureLoopbackHttp = process.env.NODE_ENV !== 'production',
}: DepositApiOptions) {
  const apiOrigin = normalizeOrigin(origin, allowInsecureLoopbackHttp);

  return {
    async getDepositOverview(input: { matchId: string; groupId: string }): Promise<MobileDepositOverview> {
      const matchId = input.matchId.trim();
      const groupId = input.groupId.trim();
      if (!matchId || !groupId) throw new DepositApiError('deposit_scope_invalid', 400);

      const accessToken = await getAccessToken();
      if (!accessToken) throw new DepositApiError('auth_required', 401);

      const query = new URLSearchParams({ match_id: matchId, group_id: groupId });
      let response: Response;
      try {
        response = await fetchImpl(`${apiOrigin}${DEPOSITS_PATH}?${query.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        throw new DepositApiError('network_error');
      }

      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const code = readErrorCode(payload) ?? (response.status === 401 ? 'auth_required' : 'request_failed');
        throw new DepositApiError(code, response.status);
      }
      return parseDepositOverview(payload, { matchId, groupId });
    },

    async chooseDepositCarryover(input: { matchId: string }): Promise<MobileDepositCarryoverResult> {
      const matchId = requireMatchId(input.matchId);
      const payload = await postDepositAction({
        apiOrigin,
        path: `/api/matches/${encodeURIComponent(matchId)}/deposit-carryover`,
        getAccessToken,
        fetchImpl,
      });
      if (
        !isRecord(payload)
        || payload.status !== 'available'
        || !isRecord(payload.carryover)
        || payload.carryover.carryover_status !== 'available'
      ) {
        throw new DepositApiError('invalid_response');
      }
      return { status: 'available' };
    },

    async requestFullDepositRefund(input: { matchId: string }): Promise<MobileDepositRefundResult> {
      const matchId = requireMatchId(input.matchId);
      const payload = await postDepositAction({
        apiOrigin,
        path: `/api/matches/${encodeURIComponent(matchId)}/refund`,
        getAccessToken,
        fetchImpl,
        body: { refund_amount: DEPOSIT_AMOUNT },
      });
      if (
        !isRecord(payload)
        || !isRecord(payload.result)
        || payload.result.request_status !== 'processed'
        || !isRecord(payload.external_refund)
        || payload.external_refund.status !== 'refunded'
      ) {
        throw new DepositApiError('invalid_response');
      }
      return { status: 'refunded' };
    },
  };
}

let defaultClient: ReturnType<typeof createDepositApi> | null = null;

export function getDepositApi() {
  if (defaultClient) return defaultClient;

  const runtime = readMobileConfig(process.env);
  defaultClient = createDepositApi({
    origin: runtime.apiOrigin,
    getAccessToken: async () => {
      const { getSupabaseClient } = await import('../lib/supabase');
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    },
  });
  return defaultClient;
}

function parseDepositOverview(
  value: unknown,
  scope: { matchId: string; groupId: string },
): MobileDepositOverview {
  if (!isRecord(value) || value.amount !== DEPOSIT_AMOUNT) {
    throw new DepositApiError('invalid_response');
  }
  if (value.my_deposit === null) return { amount: DEPOSIT_AMOUNT, deposit: null };
  if (!isRecord(value.my_deposit)) throw new DepositApiError('invalid_response');

  const row = value.my_deposit;
  const status = ACTIVE_DEPOSIT_STATUSES.has(String(row.status))
    ? row.status as MobileDepositStatus
    : null;
  const paidAt = row.paid_at === null ? null : readIsoDate(row.paid_at);
  const createdAt = readIsoDate(row.created_at);
  if (
    !readString(row.id)
    || !readString(row.user_id)
    || row.match_id !== scope.matchId
    || row.group_id !== scope.groupId
    || row.amount !== DEPOSIT_AMOUNT
    || !status
    || paidAt === undefined
    || !createdAt
  ) {
    throw new DepositApiError('invalid_response');
  }

  return {
    amount: DEPOSIT_AMOUNT,
    deposit: {
      id: row.id,
      matchId: scope.matchId,
      groupId: scope.groupId,
      amount: DEPOSIT_AMOUNT,
      status,
      paidAt,
      createdAt,
    },
  };
}

async function postDepositAction(params: {
  apiOrigin: string;
  path: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl: FetchLike;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const accessToken = await params.getAccessToken();
  if (!accessToken) throw new DepositApiError('auth_required', 401);

  let response: Response;
  try {
    response = await params.fetchImpl(`${params.apiOrigin}${params.path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(params.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    });
  } catch {
    throw new DepositApiError('network_error');
  }

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const code = readErrorCode(payload) ?? (response.status === 401 ? 'auth_required' : 'request_failed');
    throw new DepositApiError(code, response.status);
  }
  return payload;
}

function requireMatchId(value: string): string {
  const matchId = value.trim();
  if (!matchId) throw new DepositApiError('deposit_scope_invalid', 400);
  return matchId;
}

function normalizeOrigin(origin: string, allowInsecureLoopbackHttp: boolean): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new DepositApiError('invalid_api_origin');
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || (url.protocol !== 'https:' && !(allowInsecureLoopbackHttp && url.protocol === 'http:' && isLoopback))
  ) {
    throw new DepositApiError('invalid_api_origin');
  }
  return normalized;
}

function readIsoDate(value: unknown): string | undefined {
  return readString(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function readErrorCode(value: unknown): string | null {
  return isRecord(value) && readString(value.error) ? value.error : null;
}

function readString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

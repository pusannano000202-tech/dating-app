import { DEPOSIT_AMOUNT } from '../constants'

// Sungjun's current payment layer is Toss-only. Keep mock for local review.
export const DEPOSIT_PAYMENT_PROVIDERS = ['mock', 'toss'] as const

export type DepositPaymentProvider = typeof DEPOSIT_PAYMENT_PROVIDERS[number]

export type DepositPaymentReadiness =
  | { ok: true; provider: DepositPaymentProvider }
  | {
      ok: false
      provider: DepositPaymentProvider
      error: 'payment_provider_not_configured'
      missing: string[]
      invalid: string[]
    }

export interface DepositPaymentRequestDraft {
  provider: DepositPaymentProvider
  groupId: string
  userId: string
  amount: number
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
}

export function resolveDepositPaymentProvider(input?: unknown): DepositPaymentProvider {
  const raw = typeof input === 'string' && input.trim()
    ? input
    : process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || 'mock'
  const normalized = raw.toLowerCase()

  return isDepositPaymentProvider(normalized) ? normalized : 'mock'
}

export function getDepositPaymentReadiness(provider: DepositPaymentProvider): DepositPaymentReadiness {
  if (provider === 'mock') {
    return { ok: true, provider }
  }

  const checks = [
    {
      key: 'NEXT_PUBLIC_TOSS_CLIENT_KEY',
      validate: (value: string) => isTossKey(value, 'ck'),
    },
    {
      key: 'TOSS_SECRET_KEY',
      validate: (value: string) => isTossKey(value, 'sk'),
    },
    {
      key: 'PAYMENT_INTERNAL_SECRET',
      validate: (value: string) => value.length >= 12 && !hasUnsafeEnvValueCharacters(value),
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      validate: (value: string) => isSupabaseJwtWithRole(value, 'service_role'),
    },
  ] as const
  const missing = checks
    .filter((check) => !process.env[check.key])
    .map((check) => check.key)
  const invalid = checks
    .filter((check) => {
      const value = process.env[check.key]
      return typeof value === 'string' && !check.validate(value)
    })
    .map((check) => check.key)

  if (missing.length > 0 || invalid.length > 0) {
    return { ok: false, provider, error: 'payment_provider_not_configured', missing, invalid }
  }

  return { ok: true, provider }
}

export function buildDepositPaymentRequestDraft(params: {
  provider: DepositPaymentProvider
  groupId: string
  matchId?: string
  userId: string
  origin: string
  amount?: number
  orderId?: string
  returnPath?: string
}): DepositPaymentRequestDraft {
  const amount = params.amount ?? DEPOSIT_AMOUNT
  const orderId = params.orderId ?? buildDepositOrderId(params.groupId, params.userId)
  const base = params.origin.replace(/\/$/, '')
  const returnPath = normalizeDepositReturnPath(params.returnPath)
  const returnPathQuery = `return_path=${encodeURIComponent(returnPath)}`
  const matchQuery = params.matchId
    ? `&match_id=${encodeURIComponent(params.matchId)}`
    : ''

  return {
    provider: params.provider,
    groupId: params.groupId,
    userId: params.userId,
    amount,
    orderId,
    orderName: `부팅 보증금 ${amount.toLocaleString('ko-KR')}원`,
    successUrl: `${base}/api/payments/deposit/confirm?provider=${params.provider}&group_id=${encodeURIComponent(params.groupId)}${matchQuery}&${returnPathQuery}`,
    failUrl: `${base}/api/payments/deposit/cancel?provider=${params.provider}&group_id=${encodeURIComponent(params.groupId)}${matchQuery}&reason=checkout_failed&${returnPathQuery}`,
  }
}

export function isDepositPaymentAmountValid(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount === DEPOSIT_AMOUNT
}

export function normalizeDepositReturnPath(value: unknown) {
  if (typeof value !== 'string') return '/group/create'

  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/group/create'
  }

  if (trimmed === '/group/create' || trimmed.startsWith('/group/create?')) {
    return trimmed
  }
  if (/^\/match\/[^/?#]+(?:[?#].*)?$/.test(trimmed)) {
    return trimmed
  }

  return '/group/create'
}

function isDepositPaymentProvider(value: string): value is DepositPaymentProvider {
  return (DEPOSIT_PAYMENT_PROVIDERS as readonly string[]).includes(value)
}

function buildDepositOrderId(groupId: string, userId: string) {
  const compactGroup = groupId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  const compactUser = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  return `deposit_${compactGroup}_${compactUser}_${Date.now()}`
}

export function buildDepositCustomerKey(userId: string) {
  const compactUser = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 42)
  return `deposit_${compactUser || 'user'}`
}

export function isDepositOrderIdForContext(orderId: string, groupId: string, userId: string) {
  const compactGroup = groupId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  const compactUser = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  return orderId.startsWith(`deposit_${compactGroup}_${compactUser}_`)
}

function isTossKey(value: string, kind: 'ck' | 'sk') {
  if (hasUnsafeEnvValueCharacters(value)) return false
  return new RegExp(`^(?:test|live)_(?:g)?${kind}_[A-Za-z0-9_-]{12,}$`).test(value)
}

function isSupabaseJwtWithRole(value: string, role: string) {
  if (hasUnsafeEnvValueCharacters(value)) return false
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) return false

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown }
    return payload.role === role
  } catch {
    return false
  }
}

function hasUnsafeEnvValueCharacters(value: string) {
  return /\s/.test(value) || /[^\x21-\x7e]/.test(value)
}

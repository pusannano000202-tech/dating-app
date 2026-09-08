export type ContinuationFeePurpose = 'next_occurrence' | 'friend_request'
export type ContinuationFeeProvider = 'local_verified_simulator' | 'toss_sandbox' | 'toss'
export type ContinuationFeeStatus = 'prepared' | 'verifying' | 'verified' | 'cancelled' | 'recovery_required'

export const CONTINUATION_FEE_AMOUNT_KRW = 1000 as const

export type ContinuationFeeProviderChoice =
  | { available: true; provider: 'toss_sandbox'; localOnly: false }
  | { available: true; provider: 'local_verified_simulator'; localOnly: true }
  | { available: false; provider: null; localOnly: false }

export interface ContinuationFeeOrder {
  orderId: string
  ownerUserId: string
  transitionId: string
  purpose: ContinuationFeePurpose
  provider: ContinuationFeeProvider
  amountKrw: 1000
  currency: 'KRW'
}

export interface ContinuationFeeCheckoutDraft {
  amount: typeof CONTINUATION_FEE_AMOUNT_KRW
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
  method: 'CARD'
}

export interface ContinuationFeeEvent {
  eventId: string
  providerTransactionId: string
  orderId: string
  ownerUserId: string
  transitionId: string
  purpose: ContinuationFeePurpose
  provider: ContinuationFeeProvider
  amountKrw: number
  currency: string
  providerVerified: boolean
}

export function createContinuationFeeOrder(input: Omit<ContinuationFeeOrder, 'amountKrw' | 'currency'>): ContinuationFeeOrder {
  return { ...input, amountKrw: CONTINUATION_FEE_AMOUNT_KRW, currency: 'KRW' }
}

export function chooseContinuationFeeProvider(availability: {
  tossSandbox: boolean
  localSimulator: boolean
}): ContinuationFeeProviderChoice {
  if (availability.tossSandbox) {
    return { available: true, provider: 'toss_sandbox', localOnly: false }
  }
  if (availability.localSimulator) {
    return { available: true, provider: 'local_verified_simulator', localOnly: true }
  }
  return { available: false, provider: null, localOnly: false }
}

export function buildContinuationFeeCheckoutDraft(params: {
  orderId: string
  providerOrderId: string
  ownerUserId: string
  transitionId: string
  purpose: ContinuationFeePurpose
  origin: string
  returnPath: string
  state: string
}): ContinuationFeeCheckoutDraft {
  const origin = normalizeAppOrigin(params.origin)
  if (!isContinuationProviderOrderId(params.providerOrderId)) {
    throw new TypeError('invalid_continuation_provider_order_id')
  }
  if (!isContinuationReturnPath(params.returnPath)) {
    throw new TypeError('invalid_continuation_return_path')
  }
  if (!UUID_PATTERN.test(params.orderId) || !UUID_PATTERN.test(params.ownerUserId)
    || !UUID_PATTERN.test(params.transitionId) || params.state.length < 16) {
    throw new TypeError('invalid_continuation_checkout_context')
  }
  const common = new URLSearchParams({
    provider: 'toss_sandbox',
    fee_order_id: params.orderId,
    return_path: params.returnPath,
    state: params.state,
  })
  const failed = new URLSearchParams(common)
  failed.set('reason', 'checkout_failed')
  return {
    amount: CONTINUATION_FEE_AMOUNT_KRW,
    orderId: params.providerOrderId,
    orderName: params.purpose === 'friend_request'
      ? '퀀텀 친구 요청 이용권 1,000원'
      : '퀀텀 계속 만나기 참가비 1,000원',
    successUrl: `${origin}/api/payments/continuation/confirm?${common.toString()}`,
    failUrl: `${origin}/api/payments/continuation/cancel?${failed.toString()}`,
    method: 'CARD',
  }
}

export function isVerifiedContinuationTossPayment(
  payment: { paymentKey: string; orderId: string; status: string; totalAmount: number },
  expected: { paymentKey: string; providerOrderId: string },
): boolean {
  return payment.paymentKey === expected.paymentKey
    && payment.orderId === expected.providerOrderId
    && payment.status === 'DONE'
    && payment.totalAmount === CONTINUATION_FEE_AMOUNT_KRW
}

export function isContinuationProviderOrderId(value: unknown): value is string {
  return typeof value === 'string'
    && /^ct_[0-9a-f]{32}$/i.test(value)
    && value.length <= 64
}

export function isContinuationReturnPath(value: unknown): value is string {
  return typeof value === 'string' && (
    /^\/match\/series\/[0-9a-f-]{36}$/i.test(value)
    || /^\/match\/occurrences\/[0-9a-f-]{36}\/after$/i.test(value)
  )
}

export function verifyContinuationFeeEvent(
  order: ContinuationFeeOrder,
  event: ContinuationFeeEvent,
  processedEventIds: ReadonlySet<string>,
):
  | { ok: true; eventId: string; providerTransactionId: string }
  | { ok: false; error: string } {
  if (processedEventIds.has(event.eventId)) return { ok: false, error: 'payment_event_replayed' }
  if (!event.providerVerified) return { ok: false, error: 'provider_verification_failed' }
  if (event.orderId !== order.orderId) return { ok: false, error: 'payment_order_mismatch' }
  if (event.ownerUserId !== order.ownerUserId) return { ok: false, error: 'payment_owner_mismatch' }
  if (event.transitionId !== order.transitionId) return { ok: false, error: 'payment_transition_mismatch' }
  if (event.purpose !== order.purpose) return { ok: false, error: 'payment_purpose_mismatch' }
  if (event.provider !== order.provider) return { ok: false, error: 'payment_provider_mismatch' }
  if (event.amountKrw !== order.amountKrw) return { ok: false, error: 'payment_amount_mismatch' }
  if (event.currency !== order.currency) return { ok: false, error: 'payment_currency_mismatch' }
  if (!event.eventId || !event.providerTransactionId) return { ok: false, error: 'payment_identity_missing' }
  return { ok: true, eventId: event.eventId, providerTransactionId: event.providerTransactionId }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeAppOrigin(value: string): string {
  const url = new URL(value)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new TypeError('invalid_app_origin')
  }
  return url.origin
}

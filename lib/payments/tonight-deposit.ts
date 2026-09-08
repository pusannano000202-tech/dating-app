import { createHash, randomUUID } from 'node:crypto'

import { DEPOSIT_AMOUNT } from '../constants'
import type { DepositPaymentProvider } from './deposit'

export interface TonightDepositPaymentRequestDraft {
  provider: DepositPaymentProvider
  applicationId: string
  userId: string
  amount: number
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
}

function identityDigest(value: string): string {
  if (typeof value !== 'string' || value.trim().length < 8) {
    throw new TypeError('invalid_tonight_payment_identity')
  }
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 12)
}

function normalizeAppOrigin(value: string): string {
  const url = new URL(value)
  const localhost = url.hostname === 'localhost'
  if (
    url.username
    || url.password
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost))
  ) {
    throw new TypeError('invalid_app_origin')
  }
  return url.origin
}

function orderPrefix(applicationId: string, userId: string): string {
  return `tn_${identityDigest(applicationId)}_${identityDigest(userId)}_`
}

export function normalizeTonightDepositReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/tonight'
  const normalized = value.trim()
  if (normalized === '/tonight' || normalized.startsWith('/tonight?')) return normalized
  return '/tonight'
}

export function buildTonightDepositPaymentRequestDraft(params: {
  provider: DepositPaymentProvider
  applicationId: string
  userId: string
  origin: string
  orderId?: string
  returnPath?: string
  paymentState: string
}): TonightDepositPaymentRequestDraft {
  const origin = normalizeAppOrigin(params.origin)
  const orderId = params.orderId ?? `${orderPrefix(params.applicationId, params.userId)}${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  if (!isTonightDepositOrderIdForContext(orderId, params.applicationId, params.userId)) {
    throw new TypeError('invalid_tonight_order_id')
  }

  const returnPath = normalizeTonightDepositReturnPath(params.returnPath)
  const common = new URLSearchParams({
    provider: params.provider,
    application_id: params.applicationId,
    return_path: returnPath,
  })
  common.set('state', params.paymentState)
  const failed = new URLSearchParams(common)
  failed.set('reason', 'checkout_failed')

  return {
    provider: params.provider,
    applicationId: params.applicationId,
    userId: params.userId,
    amount: DEPOSIT_AMOUNT,
    orderId,
    orderName: `퀀텀 오늘밤 보증금 ${DEPOSIT_AMOUNT.toLocaleString('ko-KR')}원`,
    successUrl: `${origin}/api/payments/tonight-deposit/confirm?${common.toString()}`,
    failUrl: `${origin}/api/payments/tonight-deposit/cancel?${failed.toString()}`,
  }
}

export function isTonightDepositOrderIdForContext(
  orderId: string,
  applicationId: string,
  userId: string,
): boolean {
  return typeof orderId === 'string'
    && orderId.length >= 6
    && orderId.length <= 64
    && /^[A-Za-z0-9_-]+$/.test(orderId)
    && orderId.startsWith(orderPrefix(applicationId, userId))
}

export function buildTonightDepositCustomerKey(userId: string): string {
  return `tn_${identityDigest(userId)}`
}

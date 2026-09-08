import { createHash } from 'node:crypto'

function digest(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length < 8 || normalized.length > 256) throw new TypeError(`invalid_${field}`)
  return createHash('sha256').update(normalized).digest('hex')
}

export function buildTonightDepositOrderId(params: {
  applicationId: string
  userId: string
  idempotencyKey: string
}): string {
  return `tn_${digest(params.applicationId, 'application_id').slice(0, 12)}_${digest(params.userId, 'user_id').slice(0, 12)}_${digest(params.idempotencyKey, 'idempotency_key').slice(0, 12)}`
}

export function hashTonightPaymentKey(paymentKey: string): string {
  return digest(paymentKey, 'payment_key')
}

export function buildTonightDepositIdempotencyKey(
  status: 'paid' | 'held' | 'reconciliation_required' | 'cancelled',
  orderId: string,
): string {
  if (!/^tn_[A-Za-z0-9_-]{8,61}$/.test(orderId) || orderId.length > 64) {
    throw new TypeError('invalid_tonight_order_id')
  }
  return `tonight-${status}-${orderId}`
}

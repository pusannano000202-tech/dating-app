import { createHash } from 'node:crypto'

export function hashContinuationPaymentKey(paymentKey: string): string {
  const normalized = paymentKey.trim()
  if (normalized.length < 8 || normalized.length > 256) {
    throw new TypeError('invalid_payment_key')
  }
  return createHash('sha256').update(normalized).digest('hex')
}

export function continuationProviderEventId(paymentKeyHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(paymentKeyHash)) throw new TypeError('invalid_payment_key_hash')
  return `toss_done:${paymentKeyHash}`
}

export function continuationProviderTransactionId(paymentKeyHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(paymentKeyHash)) throw new TypeError('invalid_payment_key_hash')
  return `toss_payment:${paymentKeyHash}`
}

export function buildContinuationFeeCustomerKey(userId: string): string {
  const normalized = userId.trim()
  if (normalized.length < 8 || normalized.length > 128) throw new TypeError('invalid_user_id')
  return `ct_${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`
}

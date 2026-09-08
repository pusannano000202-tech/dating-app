import { createHmac, timingSafeEqual } from 'node:crypto'

import type { ContinuationFeePurpose } from './continuation-fee'

type ContinuationFeeReturnContext = {
  orderId: string
  providerOrderId: string
  ownerUserId: string
  transitionId: string
  purpose: ContinuationFeePurpose
  returnPath: string
}

export function signContinuationFeeReturnState(
  context: ContinuationFeeReturnContext,
  secret: string,
): string {
  assertSecret(secret)
  const payload = encode(context)
  return `${payload}.${signature(payload, secret)}`
}

export function verifyContinuationFeeReturnState(
  value: string,
  expected: ContinuationFeeReturnContext,
  secret: string,
): boolean {
  try {
    assertSecret(secret)
    const [payload, providedSignature, extra] = value.split('.')
    if (!payload || !providedSignature || extra !== undefined) return false
    const wanted = Buffer.from(signature(payload, secret), 'utf8')
    const provided = Buffer.from(providedSignature, 'utf8')
    if (wanted.length !== provided.length || !timingSafeEqual(wanted, provided)) return false
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown
    return isSameContext(decoded, expected)
  } catch {
    return false
  }
}

function encode(context: ContinuationFeeReturnContext): string {
  return Buffer.from(JSON.stringify({
    order_id: context.orderId,
    provider_order_id: context.providerOrderId,
    owner_user_id: context.ownerUserId,
    transition_id: context.transitionId,
    purpose: context.purpose,
    return_path: context.returnPath,
  })).toString('base64url')
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function isSameContext(value: unknown, expected: ContinuationFeeReturnContext): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.order_id === expected.orderId
    && row.provider_order_id === expected.providerOrderId
    && row.owner_user_id === expected.ownerUserId
    && row.transition_id === expected.transitionId
    && row.purpose === expected.purpose
    && row.return_path === expected.returnPath
}

function assertSecret(secret: string) {
  if (secret.length < 32) throw new TypeError('invalid_payment_state_secret')
}

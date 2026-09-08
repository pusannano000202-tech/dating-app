import {
  isContinuationProviderOrderId,
  type ContinuationFeeProvider,
  type ContinuationFeePurpose,
  type ContinuationFeeStatus,
} from './continuation-fee'

export type ContinuationFeeOrderProjection = {
  orderId: string
  ownerUserId: string
  transitionId: string
  purpose: ContinuationFeePurpose
  provider: ContinuationFeeProvider
  providerOrderId: string
  amountKrw: 1000
  currency: 'KRW'
  status: ContinuationFeeStatus
  providerVerified: boolean
  checkoutExpiresAt: string
  noticeVersion: '2026-09-05'
  revision: number
}

export type ContinuationFeeVerificationStartDecision =
  | 'verify_provider'
  | 'paid'
  | 'recovery_required'
  | 'invalid'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function readContinuationFeeOrder(value: unknown): ContinuationFeeOrderProjection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (!uuid(row.order_id) || !uuid(row.owner_user_id) || !uuid(row.transition_id)
    || !isPurpose(row.purpose) || !isProvider(row.provider)
    || !isContinuationProviderOrderId(row.provider_order_id)
    || row.amount_krw !== 1000 || row.currency !== 'KRW'
    || !isStatus(row.status) || typeof row.provider_verified !== 'boolean'
    || typeof row.checkout_expires_at !== 'string' || !Number.isFinite(Date.parse(row.checkout_expires_at))
    || row.notice_version !== '2026-09-05'
    || !Number.isInteger(row.revision) || (row.revision as number) < 0) return null
  return {
    orderId: row.order_id,
    ownerUserId: row.owner_user_id,
    transitionId: row.transition_id,
    purpose: row.purpose,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    amountKrw: 1000,
    currency: 'KRW',
    status: row.status,
    providerVerified: row.provider_verified,
    checkoutExpiresAt: row.checkout_expires_at,
    noticeVersion: '2026-09-05',
    revision: row.revision as number,
  }
}

export function decideContinuationFeeVerificationStart(
  value: unknown,
): ContinuationFeeVerificationStartDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid'
  const row = value as Record<string, unknown>
  if (typeof row.provider_verified !== 'boolean'
    || !Number.isInteger(row.revision) || (row.revision as number) < 0) return 'invalid'
  if (row.status === 'verifying') return row.provider_verified ? 'invalid' : 'verify_provider'
  if (row.status === 'verified') return row.provider_verified ? 'paid' : 'invalid'
  if (row.status === 'recovery_required' || row.status === 'cancelled') return 'recovery_required'
  return 'invalid'
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function isPurpose(value: unknown): value is ContinuationFeePurpose {
  return value === 'next_occurrence' || value === 'friend_request'
}

function isProvider(value: unknown): value is ContinuationFeeProvider {
  return value === 'local_verified_simulator' || value === 'toss_sandbox' || value === 'toss'
}

function isStatus(value: unknown): value is ContinuationFeeStatus {
  return value === 'prepared' || value === 'verifying' || value === 'verified'
    || value === 'cancelled' || value === 'recovery_required'
}

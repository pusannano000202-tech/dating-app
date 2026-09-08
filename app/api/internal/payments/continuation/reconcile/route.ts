import { randomUUID } from 'node:crypto'

import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationProviderEventId, continuationProviderTransactionId, hashContinuationPaymentKey } from '@/lib/payments/continuation-fee-server'
import { getContinuationFeeProviderAvailability } from '@/lib/payments/continuation-fee-provider'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  TossPaymentError,
  cancelTossPayment,
  getTossPaymentByOrderId,
  verifyTossRefundEvidence,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import { privateJson } from '@/lib/server/tonight/api-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROVIDER_ORDER = /^ct_[0-9a-f]{32}$/i
const MAX_JOBS = 5

type Service = NonNullable<ReturnType<typeof createPaymentServiceClient>>
type Outcome = 'verified' | 'no_charge' | 'cancelled' | 'retrying' | 'manual_review' | 'transition_failed'

type RecoveryClaim = {
  jobId: string
  feeOrderId: string
  ownerUserId: string
  transitionId: string
  purpose: 'next_occurrence' | 'friend_request'
  provider: 'toss_sandbox'
  providerOrderId: string
  amountKrw: 1000
  currency: 'KRW'
  orderStatus: 'prepared' | 'verifying' | 'verified' | 'cancelled' | 'recovery_required'
  providerVerified: boolean
  desiredAction: 'reconcile' | 'cancel'
  attempts: number
  providerNotFoundCount: number
  jobRevision: number
}

export async function GET(request: Request) {
  return processQueue(request, process.env.CRON_SECRET)
}

export async function POST(request: Request) {
  return processQueue(request, process.env.PAYMENT_INTERNAL_SECRET)
}

async function processQueue(request: Request, secret: string | undefined) {
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)
  const expired = await service.rpc('service_expire_continuation_fee_orders', {
    p_now: new Date().toISOString(),
    p_limit: 25,
  })
  if (expired.error) return privateJson({ error: 'expiry_sweep_failed' }, 503)
  if (!getContinuationFeeProviderAvailability().tossSandbox) {
    return privateJson({
      error: 'payment_unavailable',
      expired: typeof expired.data === 'number' ? expired.data : 0,
    }, 503)
  }
  const leaseId = randomUUID()
  const claimed = await service.rpc('service_claim_continuation_fee_recoveries', {
    p_lease_id: leaseId,
    p_limit: MAX_JOBS,
    p_lease_seconds: 120,
  })
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > MAX_JOBS) {
    return privateJson({ error: 'recovery_claim_failed' }, 503)
  }
  const results: Array<{ job_id: string | null; outcome: Outcome }> = []
  for (const value of claimed.data) {
    const claim = readClaim(value)
    if (!claim) {
      results.push({ job_id: null, outcome: 'transition_failed' })
      continue
    }
    results.push({ job_id: claim.jobId, outcome: await processClaim(service, leaseId, claim) })
  }
  const count = (outcome: Outcome) => results.filter((row) => row.outcome === outcome).length
  const transitionFailed = count('transition_failed')
  return privateJson({
    expired: typeof expired.data === 'number' ? expired.data : 0,
    claimed: results.length,
    verified: count('verified'),
    no_charge: count('no_charge'),
    cancelled: count('cancelled'),
    retrying: count('retrying'),
    manual_review: count('manual_review'),
    transition_failed: transitionFailed,
    results,
  }, transitionFailed > 0 ? 503 : 200)
}

async function processClaim(service: Service, leaseId: string, claim: RecoveryClaim): Promise<Outcome> {
  let payment: TossPaymentObject
  try {
    payment = await getTossPaymentByOrderId(claim.providerOrderId)
  } catch (error) {
    if (error instanceof TossPaymentError && error.status === 404) {
      if (claim.providerNotFoundCount >= 2) {
        return await finalize(service, leaseId, claim, 'no_charge', 'provider_not_found', null, null)
          ? 'no_charge' : 'transition_failed'
      }
      return releaseForOutcome(service, leaseId, claim, 'provider_not_found', 60, true)
    }
    if (error instanceof TossPaymentError && error.status >= 400 && error.status < 500) {
      return await finalize(service, leaseId, claim, 'manual_review', 'provider_request_rejected', null, null)
        ? 'manual_review' : 'transition_failed'
    }
    return releaseForOutcome(service, leaseId, claim, 'provider_unavailable', 300, false)
  }
  if (payment.orderId !== claim.providerOrderId || payment.totalAmount !== claim.amountKrw) {
    return await finalize(service, leaseId, claim, 'manual_review', 'provider_evidence_mismatch', null, null)
      ? 'manual_review' : 'transition_failed'
  }
  if (payment.status === 'CANCELED') return finalizeCancelledPayment(service, leaseId, claim, payment)
  if (payment.status === 'READY' || payment.status === 'EXPIRED' || payment.status === 'ABORTED') {
    return await finalize(service, leaseId, claim, 'no_charge', null, null, null)
      ? 'no_charge' : 'transition_failed'
  }
  if (payment.status !== 'DONE') {
    if (payment.status === 'IN_PROGRESS' || payment.status === 'WAITING_FOR_DEPOSIT') {
      return releaseForOutcome(service, leaseId, claim, 'provider_pending', 120, false)
    }
    return await finalize(service, leaseId, claim, 'manual_review', 'provider_evidence_mismatch', null, null)
      ? 'manual_review' : 'transition_failed'
  }
  if (!payment.paymentKey || payment.paymentKey.length < 8) {
    return await finalize(service, leaseId, claim, 'manual_review', 'provider_evidence_mismatch', null, null)
      ? 'manual_review' : 'transition_failed'
  }
  if (claim.desiredAction === 'cancel' || claim.orderStatus === 'cancelled') {
    return cancelVerifiedPayment(service, leaseId, claim, payment)
  }
  const paymentKeyHash = hashContinuationPaymentKey(payment.paymentKey)
  const confirmed = await service.rpc('confirm_my_continuation_fee_for_service', {
    p_order_id: claim.feeOrderId,
    p_owner_user_id: claim.ownerUserId,
    p_transition_id: claim.transitionId,
    p_purpose: claim.purpose,
    p_provider: claim.provider,
    p_provider_event_id: continuationProviderEventId(paymentKeyHash),
    p_provider_transaction_id: continuationProviderTransactionId(paymentKeyHash),
    p_amount_krw: claim.amountKrw,
    p_currency: claim.currency,
    p_provider_verified: true,
  })
  if (confirmed.error || !confirmed.data || typeof confirmed.data !== 'object' || Array.isArray(confirmed.data)) {
    return releaseForOutcome(service, leaseId, claim, 'record_unavailable', 300, false)
  }
  if ((confirmed.data as Record<string, unknown>).recovery_required === true) {
    return cancelVerifiedPayment(service, leaseId, claim, payment)
  }
  return await finalize(service, leaseId, claim, 'verified', null, null, null)
    ? 'verified' : 'transition_failed'
}

async function cancelVerifiedPayment(
  service: Service,
  leaseId: string,
  claim: RecoveryClaim,
  payment: TossPaymentObject,
): Promise<Outcome> {
  try {
    const cancelled = await cancelTossPayment({
      paymentKey: payment.paymentKey,
      cancelReason: '계속 만나기 주문 취소 또는 미성립 복구',
      cancelAmount: claim.amountKrw,
      idempotencyKey: `continuation-cancel-${claim.jobId}`,
    })
    return finalizeCancelledPayment(service, leaseId, claim, cancelled)
  } catch (error) {
    if (error instanceof TossPaymentError && error.status >= 400 && error.status < 500) {
      try {
        const current = await getTossPaymentByOrderId(claim.providerOrderId)
        if (current.status === 'CANCELED') return finalizeCancelledPayment(service, leaseId, claim, current)
      } catch {
        // A later leased retry must establish provider truth.
      }
    }
    return releaseForOutcome(service, leaseId, claim, 'provider_cancel_failed', 300, false)
  }
}

async function finalizeCancelledPayment(
  service: Service,
  leaseId: string,
  claim: RecoveryClaim,
  payment: TossPaymentObject,
): Promise<Outcome> {
  const evidence = verifyTossRefundEvidence(payment, {
    requestedRefundAmount: claim.amountKrw,
    depositAmount: claim.amountKrw,
  })
  if (!evidence.ok) {
    return await finalize(service, leaseId, claim, 'manual_review', 'provider_evidence_mismatch', null, null)
      ? 'manual_review' : 'transition_failed'
  }
  return await finalize(
    service,
    leaseId,
    claim,
    'cancelled',
    null,
    `toss_cancel:${evidence.transactionKey}`,
    `toss_cancel_tx:${evidence.transactionKey}`,
  ) ? 'cancelled' : 'transition_failed'
}

async function release(
  service: Service,
  leaseId: string,
  claim: RecoveryClaim,
  errorCode: string,
  retryAfterSeconds: number,
  providerNotFound: boolean,
) {
  const result = await service.rpc('service_release_continuation_fee_recovery', {
    p_job_id: claim.jobId,
    p_lease_id: leaseId,
    p_expected_revision: claim.jobRevision,
    p_error_code: errorCode,
    p_retry_after_seconds: retryAfterSeconds,
    p_provider_not_found: providerNotFound,
  })
  return !result.error && Number.isInteger(result.data)
}

async function releaseForOutcome(
  service: Service,
  leaseId: string,
  claim: RecoveryClaim,
  errorCode: string,
  retryAfterSeconds: number,
  providerNotFound: boolean,
): Promise<Outcome> {
  const released = await release(
    service,
    leaseId,
    claim,
    errorCode,
    retryAfterSeconds,
    providerNotFound,
  )
  if (!released) return 'transition_failed'
  return claim.attempts >= 20 ? 'manual_review' : 'retrying'
}

async function finalize(
  service: Service,
  leaseId: string,
  claim: RecoveryClaim,
  outcome: 'verified' | 'no_charge' | 'cancelled' | 'manual_review',
  errorCode: string | null,
  providerEventId: string | null,
  providerTransactionId: string | null,
) {
  const result = await service.rpc('service_finalize_continuation_fee_recovery', {
    p_job_id: claim.jobId,
    p_lease_id: leaseId,
    p_expected_revision: claim.jobRevision,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_provider_event_id: providerEventId,
    p_provider_transaction_id: providerTransactionId,
    p_idempotency_key: `continuation-recovery:${claim.jobId}:${outcome}`,
  })
  return !result.error && Number.isInteger(result.data)
}

function readClaim(value: unknown): RecoveryClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (!uuid(row.job_id) || !uuid(row.fee_order_id) || !uuid(row.owner_user_id) || !uuid(row.transition_id)
    || (row.purpose !== 'next_occurrence' && row.purpose !== 'friend_request')
    || row.provider !== 'toss_sandbox' || !PROVIDER_ORDER.test(String(row.provider_order_id ?? ''))
    || row.amount_krw !== 1000 || row.currency !== 'KRW'
    || !isOrderStatus(row.order_status) || typeof row.provider_verified !== 'boolean'
    || (row.desired_action !== 'reconcile' && row.desired_action !== 'cancel')
    || !nonNegativeInteger(row.attempts) || !nonNegativeInteger(row.provider_not_found_count)
    || !Number.isInteger(row.job_revision) || (row.job_revision as number) < 1) return null
  return {
    jobId: row.job_id,
    feeOrderId: row.fee_order_id,
    ownerUserId: row.owner_user_id,
    transitionId: row.transition_id,
    purpose: row.purpose,
    provider: 'toss_sandbox',
    providerOrderId: row.provider_order_id as string,
    amountKrw: 1000,
    currency: 'KRW',
    orderStatus: row.order_status,
    providerVerified: row.provider_verified,
    desiredAction: row.desired_action,
    attempts: row.attempts as number,
    providerNotFoundCount: row.provider_not_found_count as number,
    jobRevision: row.job_revision as number,
  }
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isOrderStatus(value: unknown): value is RecoveryClaim['orderStatus'] {
  return value === 'prepared' || value === 'verifying' || value === 'verified'
    || value === 'cancelled' || value === 'recovery_required'
}

import { randomUUID } from 'node:crypto'

import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { reconcileTonightPreparedOrder } from '@/lib/payments/tonight-reconciliation'
import { buildTonightDepositIdempotencyKey } from '@/lib/payments/tonight-deposit-server'
import { getTossPaymentByOrderId } from '@/lib/payments/toss'
import { privateJson } from '@/lib/server/tonight/api-contract'
import {
  readTonightReconciliationWorkerConfig,
  runBoundedBatchDrain,
} from '@/lib/server/tonight/worker-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORDER_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

type PaymentServiceClient = NonNullable<ReturnType<typeof createPaymentServiceClient>>
type ReconciliationOutcome = 'reconciled' | 'no_charge' | 'manual_review' | 'retrying' | 'transition_failed'

type ReconciliationClaim = {
  jobId: string
  depositId: string
  applicationId: string
  userId: string
  amount: number
  depositStatus: 'pending' | 'reconciliation_required' | 'cancelled' | 'refund_requested'
  providerOrderId: string
  jobRevision: number
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  if (!getDepositPaymentReadiness('toss').ok) {
    return privateJson({ error: 'payment_unavailable' }, 503)
  }
  const config = readTonightReconciliationWorkerConfig()
  if (!config) return privateJson({ error: 'service_unavailable' }, 503)
  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)
  try {
    const swept = await service.rpc('service_sweep_tonight_terminal_worker_claims', {
      p_now: new Date().toISOString(),
    })
    if (swept.error) return privateJson({ error: 'service_unavailable' }, 503)
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  const leaseId = randomUUID()
  let work
  try {
    work = await runBoundedBatchDrain({
      batchSize: config.batchSize,
      maxBatches: config.maxBatches,
      concurrency: config.concurrency,
      deadlineAt: Date.now() + config.budgetMs,
      key: (row) => readUuidField(row, 'job_id') ?? `invalid:${safeStableValue(row)}`,
      claim: async () => {
        const claimed = await service.rpc('service_claim_tonight_deposit_reconciliations', {
          p_lease_id: leaseId,
          p_limit: config.batchSize,
          p_lease_seconds: 120,
        })
        if (
          claimed.error || !Array.isArray(claimed.data)
          || claimed.data.length > config.batchSize
        ) throw new TypeError('reconciliation_claim_unavailable')
        return claimed.data
      },
      task: (row) => processClaim(service, leaseId, row),
    })
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }
  const outcomes = work.completed.map((entry) => entry.value)
  let retrying = outcomes.filter((outcome) => outcome === 'retrying').length
  let transitionFailed = outcomes.filter((outcome) => outcome === 'transition_failed').length

  const deferred = await Promise.all(work.deferred.map(async (row) => {
    const claim = readReconciliationClaim(row)
    if (!claim) return false
    return releaseClaim(service, claim, leaseId, 'provider_unavailable', 60)
  }))
  retrying += deferred.filter(Boolean).length
  transitionFailed += deferred.filter((released) => !released).length

  return privateJson({
    claimed: work.claimed,
    batches: work.batchCount,
    reconciled: outcomes.filter((outcome) => outcome === 'reconciled').length,
    no_charge: outcomes.filter((outcome) => outcome === 'no_charge').length,
    manual_review: outcomes.filter((outcome) => outcome === 'manual_review').length,
    retrying,
    transition_failed: transitionFailed,
    deadline_deferred: work.deferred.length,
    repeated_claims: work.repeated,
    stop_reason: work.stopReason,
    backlog_slo: config.backlogSlo,
    backlog_slo_status: work.stopReason === 'queue_exhausted' ? 'met' : 'unverified',
  }, transitionFailed > 0 || work.stopReason === 'repeated_claim' ? 503 : 200)
}

async function processClaim(
  service: PaymentServiceClient,
  leaseId: string,
  value: unknown,
): Promise<ReconciliationOutcome> {
  const claim = readReconciliationClaim(value)
  if (!claim) return 'transition_failed'
  const evidence = await reconcileTonightPreparedOrder({
    providerOrderId: claim.providerOrderId,
    amount: claim.amount,
  }, { getPaymentByOrderId: getTossPaymentByOrderId })

  if (evidence.kind === 'retry') {
    return await releaseClaim(service, claim, leaseId, evidence.errorCode, 60)
      ? 'retrying'
      : 'transition_failed'
  }
  if (evidence.kind === 'not_found') {
    const recorded = await service.rpc('service_record_tonight_reconciliation_not_found', {
      p_job_id: claim.jobId,
      p_lease_id: leaseId,
      p_expected_revision: claim.jobRevision,
      p_idempotency_key: `tonight-reconciliation-${claim.jobId}-not-found-${claim.jobRevision}`,
    })
    const result = readNotFoundResult(recorded.data)
    if (recorded.error || !result) return 'transition_failed'
    return result.terminal ? 'no_charge' : 'retrying'
  }
  if (evidence.kind === 'manual_review') {
    return await finalizeClaim(service, claim, leaseId, 'manual_review', evidence.errorCode)
      ? 'manual_review'
      : 'transition_failed'
  }
  if (evidence.kind === 'no_charge') {
    if (claim.depositStatus === 'pending' || claim.depositStatus === 'cancelled') {
      const cancelled = await service.rpc('service_record_tonight_deposit_result', {
        p_application_id: claim.applicationId,
        p_user_id: claim.userId,
        p_status: 'cancelled',
        p_provider_order_id: claim.providerOrderId,
        p_provider_payment_key_hash: null,
        p_amount: DEPOSIT_AMOUNT,
        p_idempotency_key: buildTonightDepositIdempotencyKey('cancelled', claim.providerOrderId),
      })
      if (cancelled.error || typeof cancelled.data !== 'string') {
        return await releaseClaim(service, claim, leaseId, 'record_unavailable', 60)
          ? 'retrying'
          : 'transition_failed'
      }
      return await finalizeClaim(service, claim, leaseId, 'no_charge', null)
        ? 'no_charge'
        : 'transition_failed'
    }

    // A provider-side cancellation is not enough to rewrite an already
    // charged/refund-requested ledger without the refund transaction evidence.
    // Keep it visible until the dedicated refund worker reconciles that proof.
    return await finalizeClaim(
      service,
      claim,
      leaseId,
      'manual_review',
      'provider_cancelled_state_conflict',
    ) ? 'manual_review' : 'transition_failed'
  }

  const checkpoint = await service.rpc('service_record_tonight_deposit_result', {
    p_application_id: claim.applicationId,
    p_user_id: claim.userId,
    p_status: 'reconciliation_required',
    p_provider_order_id: claim.providerOrderId,
    p_provider_payment_key_hash: evidence.paymentKeyHash,
    p_amount: DEPOSIT_AMOUNT,
    p_idempotency_key: buildTonightDepositIdempotencyKey(
      'reconciliation_required',
      claim.providerOrderId,
    ),
  })
  if (checkpoint.error || typeof checkpoint.data !== 'string') {
    return await releaseClaim(service, claim, leaseId, 'record_unavailable', 60)
      ? 'retrying'
      : 'transition_failed'
  }

  const paid = await service.rpc('service_record_tonight_deposit_result', {
    p_application_id: claim.applicationId,
    p_user_id: claim.userId,
    p_status: 'paid',
    p_provider_order_id: claim.providerOrderId,
    p_provider_payment_key_hash: evidence.paymentKeyHash,
    p_amount: DEPOSIT_AMOUNT,
    p_idempotency_key: buildTonightDepositIdempotencyKey('paid', claim.providerOrderId),
  })
  if (paid.error || typeof paid.data !== 'string') {
    return await releaseClaim(service, claim, leaseId, 'record_unavailable', 60)
      ? 'retrying'
      : 'transition_failed'
  }
  return await finalizeClaim(service, claim, leaseId, 'reconciled', null)
    ? 'reconciled'
    : 'transition_failed'
}

function readReconciliationClaim(value: unknown): ReconciliationClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const jobId = readUuid(row.job_id)
  const depositId = readUuid(row.deposit_id)
  const applicationId = readUuid(row.application_id)
  const userId = readUuid(row.user_id)
  if (
    !jobId || !depositId || !applicationId || !userId
    || row.amount !== DEPOSIT_AMOUNT
    || !isReconciliationDepositStatus(row.deposit_status)
    || typeof row.provider_order_id !== 'string'
    || !ORDER_PATTERN.test(row.provider_order_id)
    || !Number.isInteger(row.job_revision)
    || (row.job_revision as number) < 1
  ) return null
  return {
    jobId,
    depositId,
    applicationId,
    userId,
    amount: row.amount,
    depositStatus: row.deposit_status,
    providerOrderId: row.provider_order_id,
    jobRevision: row.job_revision as number,
  }
}

function isReconciliationDepositStatus(
  value: unknown,
): value is ReconciliationClaim['depositStatus'] {
  return value === 'pending'
    || value === 'reconciliation_required'
    || value === 'cancelled'
    || value === 'refund_requested'
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null
}

function readUuidField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return readUuid((value as Record<string, unknown>)[field])
}

function safeStableValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function readNotFoundResult(value: unknown): {
  terminal: boolean
  revision: number
  providerNotFoundCount: number
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    typeof row.terminal !== 'boolean'
    || !Number.isInteger(row.revision)
    || (row.revision as number) < 1
    || !Number.isInteger(row.provider_not_found_count)
    || (row.provider_not_found_count as number) < 0
    || (row.provider_not_found_count as number) > 3
  ) return null
  return {
    terminal: row.terminal,
    revision: row.revision as number,
    providerNotFoundCount: row.provider_not_found_count as number,
  }
}

async function releaseClaim(
  service: PaymentServiceClient,
  claim: ReconciliationClaim,
  leaseId: string,
  errorCode: 'provider_unavailable' | 'record_unavailable',
  retryAfterSeconds: number,
): Promise<boolean> {
  const result = await service.rpc('service_release_tonight_deposit_reconciliation', {
    p_job_id: claim.jobId,
    p_lease_id: leaseId,
    p_expected_revision: claim.jobRevision,
    p_error_code: errorCode,
    p_retry_after_seconds: retryAfterSeconds,
  })
  return !result.error && Number.isInteger(result.data)
}

async function finalizeClaim(
  service: PaymentServiceClient,
  claim: ReconciliationClaim,
  leaseId: string,
  outcome: 'reconciled' | 'no_charge' | 'manual_review',
  errorCode:
    | 'provider_evidence_mismatch'
    | 'provider_request_rejected'
    | 'provider_cancelled_state_conflict'
    | null,
): Promise<boolean> {
  const result = await service.rpc('service_finalize_tonight_deposit_reconciliation', {
    p_job_id: claim.jobId,
    p_lease_id: leaseId,
    p_expected_revision: claim.jobRevision,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_idempotency_key: `tonight-reconciliation-${claim.jobId}-${outcome}`,
  })
  return !result.error && Number.isInteger(result.data)
}

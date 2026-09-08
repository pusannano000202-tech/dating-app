import { randomUUID } from 'node:crypto'

import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  settleTonightRefundWithProvider,
  type TonightRefundClaim,
} from '@/lib/payments/tonight-refund'
import { cancelTossPayment, getTossPaymentByOrderId } from '@/lib/payments/toss'
import { privateJson } from '@/lib/server/tonight/api-contract'
import {
  readTonightRefundWorkerConfig,
  runBoundedBatchDrain,
} from '@/lib/server/tonight/worker-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/

type PaymentServiceClient = NonNullable<ReturnType<typeof createPaymentServiceClient>>
type RefundWorkOutcome = 'processed' | 'retrying' | 'dead_lettered' | 'transition_failed'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  if (!getDepositPaymentReadiness('toss').ok) {
    return privateJson({ error: 'payment_unavailable' }, 503)
  }
  const workerConfig = readTonightRefundWorkerConfig()
  if (!workerConfig) return privateJson({ error: 'service_unavailable' }, 503)

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
      batchSize: workerConfig.batchSize,
      maxBatches: workerConfig.maxBatches,
      concurrency: workerConfig.concurrency,
      deadlineAt: Date.now() + workerConfig.budgetMs,
      key: (rawRow) => readWorkKey(rawRow, 'request_id'),
      claim: async () => {
        const claimed = await service.rpc('service_claim_tonight_refund_requests', {
          p_lease_id: leaseId,
          p_limit: workerConfig.batchSize,
          p_lease_seconds: 120,
        })
        if (claimed.error || !Array.isArray(claimed.data)) {
          throw new TypeError('refund_claim_unavailable')
        }
        return claimed.data
      },
      task: (rawRow) => processClaim(service, leaseId, rawRow),
    })
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }
  const outcomes = work.completed.map((entry) => entry.value)
  const processed = outcomes.filter((outcome) => outcome === 'processed').length
  let retrying = outcomes.filter((outcome) => outcome === 'retrying').length
  const deadLettered = outcomes.filter((outcome) => outcome === 'dead_lettered').length
  const transitionFailed = outcomes.filter((outcome) => outcome === 'transition_failed').length

  const deferredReleases = await Promise.all(work.deferred.map(async (rawRow) => {
    const requestId = readUuidField(rawRow, 'request_id')
    if (!requestId) return false
    return releaseClaim(service, requestId, leaseId, 'worker_deadline_budget', 60)
  }))
  retrying += deferredReleases.filter(Boolean).length

  const queueCounts = await readRefundQueueCounts(service)
  if (!queueCounts) return privateJson({ error: 'service_unavailable' }, 503)
  const backlogSloExceeded = queueCounts.backlog > workerConfig.backlogSlo

  return privateJson({
    claimed: work.claimed,
    batches: work.batchCount,
    processed,
    retrying,
    dead_lettered: deadLettered,
    transition_failed: transitionFailed,
    deadline_deferred: work.deferred.length,
    repeated_claims: work.repeated,
    stop_reason: work.stopReason,
    remaining_backlog: queueCounts.backlog,
    backlog_slo: workerConfig.backlogSlo,
    backlog_slo_exceeded: backlogSloExceeded,
    dead_letter_count: queueCounts.deadLetters,
  }, transitionFailed > 0 || backlogSloExceeded || work.stopReason === 'repeated_claim' ? 503 : 200)
}

async function processClaim(
  service: PaymentServiceClient,
  leaseId: string,
  rawRow: unknown,
): Promise<RefundWorkOutcome> {
  const claim = readRefundClaim(rawRow)
  if (!claim) {
    const requestId = readUuidField(rawRow, 'request_id')
    const requestRevision = readIntegerField(rawRow, 'request_revision')
    if (!requestId || requestRevision === null) return 'transition_failed'
    return await deadLetterClaim(
      service,
      requestId,
      leaseId,
      requestRevision,
      'invalid_refund_claim',
    ) ? 'dead_lettered' : 'transition_failed'
  }

  const settlement = await settleTonightRefundWithProvider(claim, {
    getPaymentByOrderId: getTossPaymentByOrderId,
    cancelPayment: cancelTossPayment,
  })
  if (!settlement.ok) {
    const transitioned = settlement.retryable
      ? await releaseClaim(service, claim.refundRequestId, leaseId, settlement.error, 300)
      : await deadLetterClaim(
        service,
        claim.refundRequestId,
        leaseId,
        claim.requestRevision,
        settlement.error,
      )
    if (!transitioned) return 'transition_failed'
    return settlement.retryable ? 'retrying' : 'dead_lettered'
  }

  const finalized = await service.rpc('service_finalize_tonight_refund_request', {
    p_request_id: claim.refundRequestId,
    p_lease_id: leaseId,
    p_expected_revision: claim.requestRevision,
    p_provider_order_id: settlement.evidence.providerOrderId,
    p_provider_payment_key_hash: settlement.evidence.providerPaymentKeyHash,
    p_provider_refund_transaction_key: settlement.evidence.providerTransactionKey,
    p_refunded_amount: settlement.evidence.refundedAmount,
    p_idempotency_key: `tonight-refund-${claim.refundRequestId}-v${claim.requestRevision}`,
  })
  if (finalized.error || typeof finalized.data !== 'string') {
    return await releaseClaim(
      service,
      claim.refundRequestId,
      leaseId,
      'refund_finalize_failed',
      300,
    ) ? 'retrying' : 'transition_failed'
  }
  return 'processed'
}

function readRefundClaim(value: unknown): TonightRefundClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const refundRequestId = readUuidField(row, 'request_id')
  const depositId = readUuidField(row, 'deposit_id')
  const applicationId = readUuidField(row, 'application_id')
  const userId = readUuidField(row, 'user_id')
  if (
    !refundRequestId
    || !depositId
    || !applicationId
    || !userId
    || row.amount !== 10_000
    || !Number.isInteger(row.request_revision)
    || (row.request_revision as number) < 0
    || typeof row.provider_order_id !== 'string'
    || typeof row.provider_payment_key_hash !== 'string'
    || !SHA256_PATTERN.test(row.provider_payment_key_hash)
  ) return null
  return {
    refundRequestId,
    depositId,
    applicationId,
    userId,
    requestRevision: row.request_revision as number,
    amount: row.amount,
    providerOrderId: row.provider_order_id,
    providerPaymentKeyHash: row.provider_payment_key_hash,
  }
}

function readUuidField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[field]
  return typeof candidate === 'string' && UUID_PATTERN.test(candidate)
    ? candidate.toLowerCase()
    : null
}

function readIntegerField(value: unknown, field: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[field]
  return Number.isInteger(candidate) && (candidate as number) >= 0
    ? candidate as number
    : null
}

function readWorkKey(value: unknown, field: string): string {
  return readUuidField(value, field) ?? `invalid:${safeStableValue(value)}`
}

function safeStableValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

async function releaseClaim(
  service: PaymentServiceClient,
  requestId: string,
  leaseId: string,
  error: string,
  retryAfterSeconds: number,
): Promise<boolean> {
  const result = await service.rpc('service_release_tonight_refund_request', {
    p_request_id: requestId,
    p_lease_id: leaseId,
    p_error: error,
    p_retry_after_seconds: retryAfterSeconds,
  })
  return !result.error && result.data === true
}

async function deadLetterClaim(
  service: PaymentServiceClient,
  requestId: string,
  leaseId: string,
  expectedRevision: number,
  error: 'invalid_refund_claim' | 'provider_evidence_mismatch' | 'provider_request_rejected',
): Promise<boolean> {
  const result = await service.rpc('service_dead_letter_tonight_refund_request', {
    p_request_id: requestId,
    p_lease_id: leaseId,
    p_expected_revision: expectedRevision,
    p_error: error,
    p_idempotency_key: `tonight-refund-dead-letter-${requestId}-v${expectedRevision}`,
  })
  return !result.error && Number.isInteger(result.data) && (result.data as number) >= 0
}

async function readRefundQueueCounts(
  service: PaymentServiceClient,
): Promise<{ backlog: number; deadLetters: number } | null> {
  const [backlog, deadLetters] = await Promise.all([
    service
      .from('tonight_deposit_refund_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['requested', 'failed', 'processing'])
      .lt('settlement_attempt_count', 10),
    service
      .from('tonight_deposit_refund_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('settlement_attempt_count', 10),
  ])
  if (backlog.error || deadLetters.error) return null
  if (!Number.isInteger(backlog.count) || !Number.isInteger(deadLetters.count)) return null
  return { backlog: backlog.count as number, deadLetters: deadLetters.count as number }
}

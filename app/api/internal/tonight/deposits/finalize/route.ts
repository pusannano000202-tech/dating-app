import { randomUUID } from 'node:crypto'
import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { privateJson } from '@/lib/server/tonight/api-contract'
import {
  readTonightDatabaseWorkerConfig,
  runBoundedBatchDrain,
  runBoundedWorkerPool,
} from '@/lib/server/tonight/worker-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type DepositDispositionWork = {
  jobId: string
  jobRevision: number
  depositId: string
  expectedRevision: number
  expectedAttendanceRevision: number
}

type DepositDispositionResult = {
  disposition: 'refund_queued' | 'manual_review'
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
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
  const config = readTonightDatabaseWorkerConfig('deposit_finalize')
  if (!config) return privateJson({ error: 'service_unavailable' }, 503)
  const leaseId = randomUUID()
  const deadlineAt = Date.now() + config.budgetMs
  const releaseClaim = async (
    jobId: string,
    jobRevision: number,
    errorCode: 'business_transition_failed' | 'worker_deadline',
  ): Promise<boolean> => {
    try {
      const released = await service.rpc('service_release_tonight_deposit_disposition', {
        p_job_id: jobId,
        p_lease_id: leaseId,
        p_expected_revision: jobRevision,
        p_error_code: errorCode,
      })
      return !released.error && released.data === true
    } catch {
      return false
    }
  }

  let work
  try {
    work = await runBoundedBatchDrain({
      batchSize: config.batchSize,
      maxBatches: config.maxBatches,
      concurrency: config.concurrency,
      deadlineAt,
      key: (value) => readJobId(value) ?? `invalid:${safeStableValue(value)}`,
      claim: async () => {
        const due = await service.rpc('service_claim_tonight_deposit_dispositions', {
          p_lease_id: leaseId,
          p_limit: config.batchSize,
          p_lease_seconds: 120,
        })
        if (due.error || !Array.isArray(due.data) || due.data.length > config.batchSize) {
          throw new TypeError('deposit_finalize_claim_unavailable')
        }
        return due.data
      },
      task: async (value): Promise<DepositDispositionResult['disposition'] | 'retrying' | 'failed'> => {
        const item = readDepositDispositionWork(value)
        if (!item) return 'failed'
        const {
          jobId,
          jobRevision,
          depositId,
          expectedRevision,
          expectedAttendanceRevision,
        } = item
        try {
          const result = await service.rpc('service_finalize_tonight_deposit_disposition', {
            p_deposit_id: depositId,
            p_expected_revision: expectedRevision,
            p_expected_attendance_revision: expectedAttendanceRevision,
            p_idempotency_key: `tonight-deposit-disposition-${depositId}-${expectedAttendanceRevision}`,
          })
          const disposition = readDispositionResult(result.data)
          if (result.error || !disposition) {
            return await releaseClaim(jobId, jobRevision, 'business_transition_failed')
              ? 'retrying'
              : 'failed'
          }
          const completed = await service.rpc('service_complete_tonight_deposit_disposition', {
            p_job_id: jobId,
            p_lease_id: leaseId,
            p_expected_revision: jobRevision,
          })
          if (completed.error || completed.data !== true) {
            return await releaseClaim(jobId, jobRevision, 'business_transition_failed')
              ? 'retrying'
              : 'failed'
          }
          return disposition.disposition
        } catch {
          return await releaseClaim(jobId, jobRevision, 'business_transition_failed')
            ? 'retrying'
            : 'failed'
        }
      },
    })
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  const deferredRelease = await runBoundedWorkerPool({
    items: work.deferred,
    concurrency: config.concurrency,
    deadlineAt: deadlineAt + 10_000,
    task: async (value) => {
      const item = readDepositDispositionWork(value)
      return item
        ? releaseClaim(item.jobId, item.jobRevision, 'worker_deadline')
        : false
    },
  })
  const outcomes = work.completed.map((entry) => entry.value)
  const refundQueued = outcomes.filter((outcome) => outcome === 'refund_queued').length
  const manualReview = outcomes.filter((outcome) => outcome === 'manual_review').length
  const retrying = outcomes.filter((outcome) => outcome === 'retrying').length
  const deferredReleaseFailures = deferredRelease.completed.filter((entry) => !entry.value).length
    + deferredRelease.deferred.length
  const failed = outcomes.filter((outcome) => outcome === 'failed').length
    + retrying
    + deferredReleaseFailures
  const finalized = refundQueued + manualReview

  return privateJson({
    claimed: work.claimed,
    batches: work.batchCount,
    finalized,
    refund_queued: refundQueued,
    manual_review: manualReview,
    retrying,
    failed,
    deadline_deferred: work.deferred.length,
    deadline_released: deferredRelease.completed.filter((entry) => entry.value).length,
    deadline_release_failed: deferredReleaseFailures,
    repeated_claims: work.repeated,
    stop_reason: work.stopReason,
    backlog_slo: config.backlogSlo,
    backlog_slo_status: work.stopReason === 'queue_exhausted' ? 'met' : 'unverified',
  }, failed > 0 || work.stopReason === 'repeated_claim' ? 503 : 200)

}

function readJobId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const jobId = (value as Record<string, unknown>).job_id
  return typeof jobId === 'string' && UUID_PATTERN.test(jobId)
    ? jobId.toLowerCase()
    : null
}

function readDepositDispositionWork(value: unknown): DepositDispositionWork | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    typeof row.job_id !== 'string'
    || !UUID_PATTERN.test(row.job_id)
    || !Number.isInteger(row.job_revision)
    || (row.job_revision as number) < 0
    || typeof row.deposit_id !== 'string'
    || !UUID_PATTERN.test(row.deposit_id)
    || !Number.isInteger(row.deposit_revision)
    || (row.deposit_revision as number) < 0
    || !Number.isInteger(row.attendance_revision)
    || (row.attendance_revision as number) < 0
  ) {
    return null
  }
  return {
    jobId: row.job_id.toLowerCase(),
    jobRevision: row.job_revision as number,
    depositId: row.deposit_id.toLowerCase(),
    expectedRevision: row.deposit_revision as number,
    expectedAttendanceRevision: row.attendance_revision as number,
  }
}

function readDispositionResult(value: unknown): DepositDispositionResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const disposition = (value as Record<string, unknown>).disposition
  return disposition === 'refund_queued' || disposition === 'manual_review'
    ? { disposition }
    : null
}

function safeStableValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

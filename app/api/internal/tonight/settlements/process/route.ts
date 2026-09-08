import { randomUUID } from 'node:crypto'
import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { privateJson } from '@/lib/server/tonight/api-contract'
import {
  readTonightDatabaseWorkerConfig,
  runBoundedBatchDrain,
  runBoundedWorkerPool,
} from '@/lib/server/tonight/worker-pool'
import { readTonightSettlementConfig } from '@/lib/server/tonight/settlement-runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SettlementWork = {
  jobId: string
  jobRevision: number
  teamId: string
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  const config = readTonightSettlementConfig()
  if (!config) return privateJson({ error: 'service_unavailable' }, 503)
  const workerConfig = readTonightDatabaseWorkerConfig('settlement')
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
  const deadlineAt = Date.now() + workerConfig.budgetMs
  const releaseClaim = async (
    jobId: string,
    jobRevision: number,
    errorCode: 'business_transition_failed' | 'worker_deadline',
  ): Promise<boolean> => {
    try {
      const released = await service.rpc('service_release_tonight_settlement', {
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
      batchSize: workerConfig.batchSize,
      maxBatches: workerConfig.maxBatches,
      concurrency: workerConfig.concurrency,
      deadlineAt,
      key: (value) => readJobId(value) ?? `invalid:${safeStableValue(value)}`,
      claim: async () => {
        const due = await service.rpc('service_claim_tonight_settlements', {
          p_lease_id: leaseId,
          p_limit: workerConfig.batchSize,
          p_lease_seconds: 120,
        })
        if (
          due.error || !Array.isArray(due.data)
          || due.data.length > workerConfig.batchSize
        ) throw new TypeError('settlement_claim_unavailable')
        return due.data
      },
      task: async (value): Promise<'finalized' | 'retrying' | 'failed'> => {
        const item = readSettlementWork(value)
        if (!item) return 'failed'
        const { jobId, jobRevision, teamId } = item
        try {
          const result = await service.rpc('service_finalize_tonight_settlement', {
            p_team_id: teamId,
            p_fee_per_attendee: config.feePerAttendee,
            p_idempotency_key: `tonight-settlement-${teamId}`,
          })
          if (result.error || typeof result.data !== 'string') {
            return await releaseClaim(jobId, jobRevision, 'business_transition_failed')
              ? 'retrying'
              : 'failed'
          }
          const completed = await service.rpc('service_complete_tonight_settlement', {
            p_job_id: jobId,
            p_lease_id: leaseId,
            p_expected_revision: jobRevision,
          })
          if (completed.error || completed.data !== true) {
            return await releaseClaim(jobId, jobRevision, 'business_transition_failed')
              ? 'retrying'
              : 'failed'
          }
          return 'finalized'
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
    concurrency: workerConfig.concurrency,
    deadlineAt: deadlineAt + 10_000,
    task: async (value) => {
      const item = readSettlementWork(value)
      return item
        ? releaseClaim(item.jobId, item.jobRevision, 'worker_deadline')
        : false
    },
  })
  const outcomes = work.completed.map((entry) => entry.value)
  const finalized = outcomes.filter((outcome) => outcome === 'finalized').length
  const retrying = outcomes.filter((outcome) => outcome === 'retrying').length
  const deferredReleaseFailures = deferredRelease.completed.filter((entry) => !entry.value).length
    + deferredRelease.deferred.length
  const failed = outcomes.filter((outcome) => outcome === 'failed').length
    + retrying
    + deferredReleaseFailures

  return privateJson({
    claimed: work.claimed,
    batches: work.batchCount,
    finalized,
    retrying,
    failed,
    deadline_deferred: work.deferred.length,
    deadline_released: deferredRelease.completed.filter((entry) => entry.value).length,
    deadline_release_failed: deferredReleaseFailures,
    repeated_claims: work.repeated,
    stop_reason: work.stopReason,
    backlog_slo: workerConfig.backlogSlo,
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

function readSettlementWork(value: unknown): SettlementWork | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    typeof row.job_id !== 'string'
    || !UUID_PATTERN.test(row.job_id)
    || !Number.isInteger(row.job_revision)
    || (row.job_revision as number) < 0
    || typeof row.team_id !== 'string'
    || !UUID_PATTERN.test(row.team_id)
  ) return null
  return {
    jobId: row.job_id.toLowerCase(),
    jobRevision: row.job_revision as number,
    teamId: row.team_id.toLowerCase(),
  }
}

function safeStableValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

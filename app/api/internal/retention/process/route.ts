import { randomUUID } from 'node:crypto'

import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import {
  parseRetentionWorkItem,
  processRetentionWork,
  scheduledRetentionInput,
  type AuthRetentionWorkItem,
  type RetentionWorkItem,
  type StorageRetentionWorkItem,
} from '@/lib/account/retention-worker'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const denied = authorizeRetentionRequest(request)
  if (denied) return denied
  return runRetention(scheduledRetentionInput(process.env.ACCOUNT_DELETION_WORKER_ENABLED))
}

export async function POST(request: Request) {
  const denied = authorizeRetentionRequest(request)
  if (denied) return denied
  const input = await readWorkerInput(request)
  if (!input) return internalJson({ error: 'invalid_input' }, 400)
  return runRetention(input)
}

function authorizeRetentionRequest(request: Request): Response | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return internalJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return internalJson({ error: 'unauthorized' }, 401)
  }
  return null
}

async function runRetention(input: { dryRun: boolean; limit: number }) {
  const admin = createSupabaseAdminClient()
  if (!admin) return internalJson({ error: 'service_unavailable' }, 503)

  if (input.dryRun) {
    const preview = await admin.rpc('preview_retention_cleanup_jobs_for_service', { p_limit: input.limit })
    if (preview.error || !isPreview(preview.data)) return internalJson({ error: 'service_unavailable' }, 503)
    return internalJson({ dryRun: true, ...preview.data })
  }
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== 'true') {
    return internalJson({ error: 'destructive_worker_disabled' }, 503)
  }

  const workerToken = randomUUID()
  const claimed = await admin.rpc('claim_retention_cleanup_jobs_for_service', {
    p_worker_token: workerToken,
    p_limit: input.limit,
  })
  if (claimed.error || !Array.isArray(claimed.data)) {
    return internalJson({ error: 'service_unavailable' }, 503)
  }
  const work = claimed.data.map(parseRetentionWorkItem)
  if (work.some((item) => item === null)) {
    // Fail the batch closed. The leases expire so a corrected worker can retry;
    // no unvalidated bucket, path, or auth-user id reaches a destructive API.
    return internalJson({ error: 'invalid_retention_job' }, 503)
  }

  const result = await processRetentionWork(work as RetentionWorkItem[], {
    async removeStorageObject(item: StorageRetentionWorkItem) {
      const removed = await admin.storage.from(item.bucket).remove([item.storagePath])
      if (removed.error) throw new Error('storage_failed')
    },
    async confirmAuthDeletionReady(item: AuthRetentionWorkItem) {
      const ready = await admin.rpc('confirm_account_auth_delete_ready_for_service', {
        p_request_id: item.requestId,
        p_user_id: item.userId,
        p_worker_token: item.claimToken,
      })
      return !ready.error && ready.data === true
    },
    async deleteAuthUser(item: AuthRetentionWorkItem) {
      const deleted = await admin.auth.admin.deleteUser(item.userId)
      if (deleted.error && !/not[ _-]?found|does not exist/i.test(deleted.error.message)) {
        throw new Error('provider_failed')
      }
    },
    async completeJob(item: RetentionWorkItem) {
      const completed = await admin.rpc('complete_retention_cleanup_job_for_service', {
        p_job_id: item.jobId,
        p_claim_token: item.claimToken,
      })
      if (completed.error || completed.data !== true) throw new Error('cleanup_failed')
    },
    async retryJob(item: RetentionWorkItem, errorCode: string, retryAfterSeconds: number) {
      const retried = await admin.rpc('retry_retention_cleanup_job_for_service', {
        p_job_id: item.jobId,
        p_claim_token: item.claimToken,
        p_error_code: errorCode,
        p_retry_after_seconds: retryAfterSeconds,
      })
      if (retried.error || retried.data !== true) throw new Error('retry_schedule_failed')
    },
  })
  return internalJson({ dryRun: false, ...result })
}

async function readWorkerInput(request: Request): Promise<{ dryRun: boolean; limit: number } | null> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 2048) return null
  const raw = await request.text()
  if (raw.length > 2048) return null
  if (!raw.trim()) return { dryRun: true, limit: 25 }
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const body = value as Record<string, unknown>
    if (Object.keys(body).some((key) => key !== 'dryRun' && key !== 'limit')) return null
    const dryRun = body.dryRun === undefined ? true : body.dryRun
    const limit = body.limit === undefined ? 25 : body.limit
    if (typeof dryRun !== 'boolean' || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50) return null
    return { dryRun, limit: Number(limit) }
  } catch {
    return null
  }
}

function isPreview(value: unknown): value is { storage_jobs: number; auth_jobs: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return Number.isInteger(row.storage_jobs) && Number(row.storage_jobs) >= 0
    && Number.isInteger(row.auth_jobs) && Number(row.auth_jobs) >= 0
}

function internalJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

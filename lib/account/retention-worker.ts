const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID}$`, 'i')
const CONTINUATION_PATH_RE = new RegExp(`^continuation-series/${UUID}/(?:source|occurrence)/${UUID}/${UUID}\\.jpg$`, 'i')
const MEETING_PATH_RE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i
const CAMPUS_SEVEN_PATH_RE = new RegExp(`^${UUID}/${UUID}/[A-Za-z0-9._-]+\\.(?:jpe?g|png|webp)$`, 'i')

export type StorageRetentionWorkItem = {
  kind: 'storage_object'
  jobId: string
  userId: string
  requestId: string | null
  bucket: 'photos' | 'meeting-evidence' | 'campus-seven-attendance'
  storagePath: string
  claimToken: string
  attempt: number
}

export type AuthRetentionWorkItem = {
  kind: 'auth_user'
  jobId: string
  userId: string
  requestId: string
  claimToken: string
  attempt: number
}

export type RetentionWorkItem = StorageRetentionWorkItem | AuthRetentionWorkItem

export type RetentionWorkerDependencies = {
  removeStorageObject(item: StorageRetentionWorkItem): Promise<void>
  confirmAuthDeletionReady(item: AuthRetentionWorkItem): Promise<boolean>
  deleteAuthUser(item: AuthRetentionWorkItem): Promise<void>
  completeJob(item: RetentionWorkItem): Promise<void>
  retryJob(item: RetentionWorkItem, errorCode: string, retryAfterSeconds: number): Promise<void>
}

export function scheduledRetentionInput(workerEnabled: string | undefined): { dryRun: boolean; limit: number } {
  return { dryRun: workerEnabled !== 'true', limit: 25 }
}

export function parseRetentionWorkItem(value: unknown): RetentionWorkItem | null {
  if (!isRecord(value)) return null
  const kind = value.kind
  const jobId = asUuid(value.job_id)
  const userId = asUuid(value.user_id)
  const requestId = value.request_id === null ? null : asUuid(value.request_id)
  const claimToken = asUuid(value.claim_token)
  const attempt = Number.isInteger(value.attempt_count) && Number(value.attempt_count) > 0
    ? Number(value.attempt_count)
    : 1
  if (!jobId || !userId || !claimToken || (value.request_id !== null && !requestId)) return null

  if (kind === 'auth_user') {
    if (!requestId || value.bucket !== null || value.storage_path !== null) return null
    return { kind, jobId, userId, requestId, claimToken, attempt }
  }
  if (kind !== 'storage_object' || !isStorageBucket(value.bucket) || typeof value.storage_path !== 'string') {
    return null
  }
  if (!isAllowedStoragePath(value.bucket, value.storage_path, userId)) return null
  return {
    kind,
    jobId,
    userId,
    requestId,
    bucket: value.bucket,
    storagePath: value.storage_path,
    claimToken,
    attempt,
  }
}

export async function processRetentionWork(
  items: readonly RetentionWorkItem[],
  dependencies: RetentionWorkerDependencies,
): Promise<{ processed: number; completed: number; retryScheduled: number }> {
  let completed = 0
  let retryScheduled = 0
  for (const item of items) {
    try {
      if (item.kind === 'storage_object') {
        await dependencies.removeStorageObject(item)
      } else {
        const ready = await dependencies.confirmAuthDeletionReady(item)
        if (!ready) throw new Error('account_not_ready')
        await dependencies.deleteAuthUser(item)
      }
      await dependencies.completeJob(item)
      completed += 1
    } catch (error) {
      const errorCode = retentionErrorCode(error)
      await dependencies.retryJob(item, errorCode, retentionRetryDelaySeconds(item.attempt))
      retryScheduled += 1
    }
  }
  return { processed: items.length, completed, retryScheduled }
}

export function retentionRetryDelaySeconds(attempt: number): number {
  const safeAttempt = Number.isInteger(attempt) ? Math.max(1, attempt) : 1
  return Math.min(21_600, 60 * 2 ** (safeAttempt - 1))
}

function retentionErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error'
  if (message === 'account_not_ready') return message
  if (/provider/i.test(message)) return 'provider_failed'
  if (/storage/i.test(message)) return 'storage_failed'
  return 'cleanup_failed'
}

function isAllowedStoragePath(bucket: StorageRetentionWorkItem['bucket'], path: string, userId: string): boolean {
  if (path.length < 3 || path.length > 512 || path.includes('..') || path.startsWith('/')) return false
  if (bucket === 'photos') {
    const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped}/[A-Za-z0-9._-]+$`, 'i').test(path)
  }
  if (bucket === 'campus-seven-attendance') {
    return path.startsWith(`${userId}/`) && CAMPUS_SEVEN_PATH_RE.test(path)
  }
  return CONTINUATION_PATH_RE.test(path) || MEETING_PATH_RE.test(path)
}

function isStorageBucket(value: unknown): value is StorageRetentionWorkItem['bucket'] {
  return value === 'photos' || value === 'meeting-evidence' || value === 'campus-seven-attendance'
}

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

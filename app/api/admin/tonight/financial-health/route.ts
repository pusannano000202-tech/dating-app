import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertStrictSearchParams } from '@/lib/server/tonight/access-directory'
import {
  TonightApiInputError,
  asInteger,
  asUuid,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const TEAM_CODE_PATTERN = /^[A-Z0-9_-]{1,160}$/
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,80}$/

const COUNT_KEYS = [
  'deposit_disposition_active_count',
  'deposit_dead_letter_count',
  'settlement_active_count',
  'settlement_dead_letter_count',
  'refund_active_count',
  'refund_failed_count',
  'reconciliation_active_count',
  'reconciliation_failed_count',
  'notification_active_count',
  'notification_failed_count',
  'push_active_count',
  'push_failed_count',
] as const

const TIMESTAMP_KEYS = [
  'oldest_deposit_disposition_active_at',
  'oldest_settlement_active_at',
  'oldest_refund_active_at',
  'oldest_reconciliation_active_at',
  'oldest_notification_active_at',
  'oldest_push_active_at',
] as const

type FinancialCursor = Readonly<{
  updatedAt: string
  jobKind: 'deposit_disposition' | 'settlement'
  jobId: string
}>

type SafeFinancialJob = Readonly<{
  job_kind: 'deposit_disposition' | 'settlement'
  job_id: string
  job_revision: number
  team_id: string
  team_code: string
  job_status: 'dead_letter'
  attempt_count: number
  last_error_code: string | null
  created_at: string
  updated_at: string
}>

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = assertStrictSearchParams(request, ['round_id', 'limit', 'cursor'])
    const roundId = asUuid(searchParams.get('round_id'), 'round_id')
    const rawLimit = searchParams.get('limit')
    if (rawLimit !== null && !/^\d+$/.test(rawLimit)) {
      throw new TonightApiInputError('invalid_field', 'limit')
    }
    const limit = rawLimit === null
      ? 50
      : asInteger(Number(rawLimit), 'limit', { min: 1, max: 50 })
    const cursor = decodeFinancialCursor(searchParams.get('cursor'))
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_get_tonight_financial_worker_health', {
      p_round_id: roundId,
      p_before_updated_at: cursor?.updatedAt ?? null,
      p_before_job_kind: cursor?.jobKind ?? null,
      p_before_job_id: cursor?.jobId ?? null,
      p_limit: limit,
    })
    if (error) return tonightRpcErrorResponse(error)
    const page = sanitizeFinancialHealth(data, limit)
    if (!page) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson({ health: page.health, next_cursor: page.nextCursor })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

function decodeFinancialCursor(value: string | null): FinancialCursor | null {
  if (value === null) return null
  if (!CURSOR_PATTERN.test(value)) {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid')
    const row = decoded as Record<string, unknown>
    if (
      Object.keys(row).length !== 3
      || typeof row.updatedAt !== 'string'
      || !validTimestamp(row.updatedAt)
      || (row.jobKind !== 'deposit_disposition' && row.jobKind !== 'settlement')
      || typeof row.jobId !== 'string'
      || !UUID_PATTERN.test(row.jobId)
    ) throw new Error('invalid')
    return {
      updatedAt: row.updatedAt,
      jobKind: row.jobKind,
      jobId: row.jobId.toLowerCase(),
    }
  } catch {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
}

function encodeFinancialCursor(cursor: FinancialCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function sanitizeFinancialHealth(value: unknown, limit: number): {
  health: Record<string, unknown>
  nextCursor: string | null
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const health: Record<string, unknown> = {}

  for (const key of COUNT_KEYS) {
    const count = row[key]
    if (!Number.isInteger(count) || (count as number) < 0) return null
    health[key] = count
  }
  for (const key of TIMESTAMP_KEYS) {
    const timestamp = row[key]
    if (timestamp !== null && (typeof timestamp !== 'string' || !validTimestamp(timestamp))) return null
    health[key] = timestamp
  }

  if (!Array.isArray(row.jobs) || row.jobs.length > limit + 1) return null
  const jobs = row.jobs.map(sanitizeFinancialJob)
  if (jobs.some((job) => job === null)) return null
  const safeJobs = jobs as SafeFinancialJob[]
  const visibleJobs = safeJobs.slice(0, limit)
  const last = visibleJobs.at(-1)
  health.jobs = visibleJobs

  return {
    health,
    nextCursor: safeJobs.length > limit && last
      ? encodeFinancialCursor({
        updatedAt: last.updated_at,
        jobKind: last.job_kind,
        jobId: last.job_id,
      })
      : null,
  }
}

function sanitizeFinancialJob(value: unknown): SafeFinancialJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const kind = row.job_kind
  const jobId = row.job_id
  const revision = row.job_revision
  const teamId = row.team_id
  const teamCode = row.team_code
  const status = row.job_status
  const attemptCount = row.attempt_count
  const lastErrorCode = row.last_error_code
  const createdAt = row.created_at
  const updatedAt = row.updated_at

  if (kind !== 'deposit_disposition' && kind !== 'settlement') return null
  if (typeof jobId !== 'string' || !UUID_PATTERN.test(jobId)) return null
  if (!Number.isInteger(revision) || (revision as number) < 0) return null
  if (typeof teamId !== 'string' || !UUID_PATTERN.test(teamId)) return null
  if (typeof teamCode !== 'string' || !TEAM_CODE_PATTERN.test(teamCode)) return null
  if (status !== 'dead_letter') return null
  if (!Number.isInteger(attemptCount) || (attemptCount as number) < 0) return null
  if (
    lastErrorCode !== null
    && (typeof lastErrorCode !== 'string' || !ERROR_CODE_PATTERN.test(lastErrorCode))
  ) return null
  if (typeof createdAt !== 'string' || !validTimestamp(createdAt)) return null
  if (typeof updatedAt !== 'string' || !validTimestamp(updatedAt)) return null

  return {
    job_kind: kind,
    job_id: jobId.toLowerCase(),
    job_revision: revision as number,
    team_id: teamId.toLowerCase(),
    team_code: teamCode,
    job_status: status,
    attempt_count: attemptCount as number,
    last_error_code: lastErrorCode,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

function validTimestamp(value: string): boolean {
  return TIMESTAMPTZ_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

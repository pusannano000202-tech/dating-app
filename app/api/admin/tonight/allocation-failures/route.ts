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
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,80}$/

type AllocatorFailureCursor = Readonly<{
  attemptedAt: string
  roundId: string
}>

type SafeAllocatorFailure = Readonly<{
  round_id: string
  lower_bound_team_count: number
  upper_bound_team_count: number
  applicant_count: number
  attempted_at: string
  error_code: string
  status: 'open' | 'resolved'
  revision: number
}>

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = assertStrictSearchParams(request, ['round_id', 'limit', 'cursor'])
    const rawRoundId = searchParams.get('round_id')
    const roundId = rawRoundId === null ? null : asUuid(rawRoundId, 'round_id')
    const rawLimit = searchParams.get('limit')
    if (rawLimit !== null && !/^\d+$/.test(rawLimit)) {
      throw new TonightApiInputError('invalid_field', 'limit')
    }
    const limit = rawLimit === null
      ? 50
      : asInteger(Number(rawLimit), 'limit', { min: 1, max: 50 })
    const cursor = decodeAllocatorFailureCursor(searchParams.get('cursor'))
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_list_tonight_allocator_failures', {
      p_round_id: roundId,
      p_before_attempted_at: cursor?.attemptedAt ?? null,
      p_before_round_id: cursor?.roundId ?? null,
      p_limit: limit,
    })
    if (error) return tonightRpcErrorResponse(error)

    if (!Array.isArray(data)) return privateJson({ error: 'service_unavailable' }, 503)
    const rows = data.map(sanitizeAllocatorFailure)
    if (rows.some((row) => row === null) || rows.length > limit + 1) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    const safeRows = rows as SafeAllocatorFailure[]
    const failures = safeRows.slice(0, limit)
    const last = failures.at(-1)
    return privateJson({
      failures,
      next_cursor: rows.length > limit && last
        ? encodeAllocatorFailureCursor({
          attemptedAt: last.attempted_at,
          roundId: last.round_id,
        })
        : null,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

function sanitizeAllocatorFailure(value: unknown): SafeAllocatorFailure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.round_id !== 'string' || !UUID_PATTERN.test(row.round_id)) return null
  if (!isBoundedCount(row.lower_bound_team_count, 0, 2_000)) return null
  if (!isBoundedCount(row.upper_bound_team_count, 0, 2_000)) return null
  if ((row.lower_bound_team_count as number) > (row.upper_bound_team_count as number)) return null
  if (!isBoundedCount(row.applicant_count, 0, 10_000)) return null
  if (typeof row.attempted_at !== 'string' || !validTimestamp(row.attempted_at)) return null
  if (typeof row.error_code !== 'string' || !ERROR_CODE_PATTERN.test(row.error_code)) return null
  if (row.status !== 'open' && row.status !== 'resolved') return null
  if (!isBoundedCount(row.revision, 0, 2_147_483_647)) return null
  return {
    round_id: row.round_id.toLowerCase(),
    lower_bound_team_count: row.lower_bound_team_count as number,
    upper_bound_team_count: row.upper_bound_team_count as number,
    applicant_count: row.applicant_count as number,
    attempted_at: row.attempted_at,
    error_code: row.error_code,
    status: row.status,
    revision: row.revision as number,
  }
}

function decodeAllocatorFailureCursor(value: string | null): AllocatorFailureCursor | null {
  if (value === null) return null
  if (!CURSOR_PATTERN.test(value)) throw new TonightApiInputError('invalid_field', 'cursor')
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid')
    const row = decoded as Record<string, unknown>
    if (
      Object.keys(row).length !== 2
      || typeof row.attemptedAt !== 'string'
      || !validTimestamp(row.attemptedAt)
      || typeof row.roundId !== 'string'
      || !UUID_PATTERN.test(row.roundId)
    ) throw new Error('invalid')
    return { attemptedAt: row.attemptedAt, roundId: row.roundId.toLowerCase() }
  } catch {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
}

function encodeAllocatorFailureCursor(cursor: AllocatorFailureCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function validTimestamp(value: string): boolean {
  return TIMESTAMPTZ_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

function isBoundedCount(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

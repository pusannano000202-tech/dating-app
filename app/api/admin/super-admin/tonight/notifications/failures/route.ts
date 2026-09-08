import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asUuid,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set(['round_id', 'limit', 'cursor'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const RECIPIENT_REF_PATTERN = /^usr_[0-9a-f]{12}$/
const TEAM_REF_PATTERN = /^team_[0-9a-f]{12}$/
const EVENT_TYPES = new Set([
  'allocation_published',
  'deposit_due',
  'partner_acceptance_due',
  'venue_revealed',
  'arrival_due',
])
const FAILURE_CODES = new Set([
  'in_app_delivery_failed',
  'invalid_completion_result',
  'lease_expired_after_max_attempts',
  'notification_delivery_failed',
  'push_send_failed',
  'push_delivery_failed',
  'resubscribe_required',
])

type SafeNotificationFailure = {
  failure_kind: 'in_app' | 'push'
  failure_id: string
  failure_revision: number
  round_id: string
  team_id: string | null
  event_type: string
  recipient_ref: string
  team_ref: string | null
  failure_code: string
  attempt_count: number
  failed_at: string
  resubscribe_required: boolean
}

type FailureCursor = {
  failedAt: string
  failureId: string
}

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
    const url = new URL(request.url)
    for (const key of url.searchParams.keys()) {
      if (!QUERY_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) {
        throw new TonightApiInputError('unexpected_field', key)
      }
    }

    const roundId = asUuid(url.searchParams.get('round_id'), 'round_id')
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? 50 : Number(rawLimit)
    if (!/^\d+$/.test(rawLimit ?? '50') || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new TonightApiInputError('invalid_field', 'limit')
    }
    const cursor = decodeFailureCursor(url.searchParams.get('cursor'))

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc(
      'super_admin_list_tonight_notification_failures',
      {
        p_round_id: roundId,
        p_before_failed_at: cursor?.failedAt ?? null,
        p_before_failure_id: cursor?.failureId ?? null,
        p_limit: limit,
      },
    )
    if (error) return tonightRpcErrorResponse(error)
    if (!Array.isArray(data)) return privateJson({ error: 'service_unavailable' }, 503)

    const failures = data.map(sanitizeNotificationFailure)
    if (failures.some((failure) => failure === null)) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    const safeFailures = failures as SafeNotificationFailure[]
    const last = safeFailures.at(-1)
    return privateJson({
      failures: safeFailures,
      next_cursor: safeFailures.length === limit && last
        ? encodeFailureCursor({ failedAt: last.failed_at, failureId: last.failure_id })
        : null,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

function decodeFailureCursor(value: string | null): FailureCursor | null {
  if (value === null) return null
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid')
    const row = decoded as Record<string, unknown>
    if (
      Object.keys(row).length !== 2
      || typeof row.failedAt !== 'string'
      || !TIMESTAMPTZ_PATTERN.test(row.failedAt)
      || !Number.isFinite(Date.parse(row.failedAt))
      || typeof row.failureId !== 'string'
      || !UUID_PATTERN.test(row.failureId)
    ) throw new Error('invalid')
    return {
      failedAt: row.failedAt,
      failureId: row.failureId.toLowerCase(),
    }
  } catch {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
}

function encodeFailureCursor(cursor: FailureCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function sanitizeNotificationFailure(value: unknown): SafeNotificationFailure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const kind = row.failure_kind
  const failureId = row.failure_id
  const revision = row.failure_revision
  const roundId = row.round_id
  const teamId = row.team_id
  const eventType = row.event_type
  const recipientRef = row.recipient_ref
  const teamRef = row.team_ref
  const failureCode = row.failure_code
  const attemptCount = row.attempt_count
  const failedAt = row.failed_at
  const resubscribeRequired = row.resubscribe_required

  if (kind !== 'in_app' && kind !== 'push') return null
  if (typeof failureId !== 'string' || !UUID_PATTERN.test(failureId)) return null
  if (!Number.isInteger(revision) || (revision as number) < 0) return null
  if (typeof roundId !== 'string' || !UUID_PATTERN.test(roundId)) return null
  if (teamId !== null && (typeof teamId !== 'string' || !UUID_PATTERN.test(teamId))) return null
  if (typeof eventType !== 'string' || !EVENT_TYPES.has(eventType)) return null
  if (typeof recipientRef !== 'string' || !RECIPIENT_REF_PATTERN.test(recipientRef)) return null
  if (teamRef !== null && (typeof teamRef !== 'string' || !TEAM_REF_PATTERN.test(teamRef))) return null
  if (
    typeof failureCode !== 'string'
    || (!FAILURE_CODES.has(failureCode) && !/^push_http_[0-9]{3}$/.test(failureCode))
  ) return null
  if (!Number.isInteger(attemptCount) || (attemptCount as number) < 0) return null
  if (
    typeof failedAt !== 'string'
    || !TIMESTAMPTZ_PATTERN.test(failedAt)
    || !Number.isFinite(Date.parse(failedAt))
  ) return null
  if (typeof resubscribeRequired !== 'boolean') return null

  return {
    failure_kind: kind,
    failure_id: failureId.toLowerCase(),
    failure_revision: revision as number,
    round_id: roundId.toLowerCase(),
    team_id: typeof teamId === 'string' ? teamId.toLowerCase() : null,
    event_type: eventType,
    recipient_ref: recipientRef,
    team_ref: typeof teamRef === 'string' ? teamRef : null,
    failure_code: failureCode,
    attempt_count: attemptCount as number,
    failed_at: failedAt,
    resubscribe_required: resubscribeRequired,
  }
}

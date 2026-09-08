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

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const AUDIT_ID_PATTERN = /^[1-9]\d{0,18}$/
const MAX_POSTGRES_BIGINT = '9223372036854775807'

type AuditCursor = Readonly<{
  occurredAt: string
  id: string
}>

type SafeAuditRow = Readonly<{
  event: Record<string, unknown>
  cursorOccurredAt: string
  cursorId: string
}>

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
    const searchParams = assertStrictSearchParams(request, ['round_id', 'limit', 'cursor'])
    const roundValue = searchParams.get('round_id')
    const roundId = roundValue === null ? null : asUuid(roundValue, 'round_id')
    const rawLimit = searchParams.get('limit')
    if (rawLimit !== null && !/^\d{1,2}$/.test(rawLimit)) {
      throw new TonightApiInputError('invalid_field', 'limit')
    }
    const limit = rawLimit === null
      ? 50
      : asInteger(Number(rawLimit), 'limit', { min: 1, max: 50 })
    const cursor = decodeAuditCursor(searchParams.get('cursor'))

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_list_tonight_audit_events', {
      p_round_id: roundId,
      p_before_occurred_at: cursor?.occurredAt ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: limit,
    })
    if (error) return tonightRpcErrorResponse(error)
    const page = normalizeAuditPage(data, limit)
    if (!page) return privateJson({ error: 'service_unavailable' }, 503)
    return privateJson({ audit: page.audit, next_cursor: page.nextCursor })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

function decodeAuditCursor(value: string | null): AuditCursor | null {
  if (value === null) return null
  if (!CURSOR_PATTERN.test(value)) {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid')
    const row = decoded as Record<string, unknown>
    if (
      Object.keys(row).length !== 2
      || typeof row.occurredAt !== 'string'
      || !validTimestamp(row.occurredAt)
      || typeof row.id !== 'string'
      || !validAuditId(row.id)
    ) throw new Error('invalid')
    return { occurredAt: row.occurredAt, id: row.id }
  } catch {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
}

function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function normalizeAuditPage(value: unknown, limit: number): {
  audit: Record<string, unknown>[]
  nextCursor: string | null
} | null {
  if (!Array.isArray(value) || value.length > limit + 1) return null
  const rows = value.map(sanitizeAuditRow)
  if (rows.some((row) => row === null)) return null
  const safeRows = rows as SafeAuditRow[]
  const visibleRows = safeRows.slice(0, limit)
  const last = visibleRows.at(-1)
  return {
    audit: visibleRows.map((row) => row.event),
    nextCursor: safeRows.length > limit && last
      ? encodeAuditCursor({ occurredAt: last.cursorOccurredAt, id: last.cursorId })
      : null,
  }
}

function sanitizeAuditRow(value: unknown): SafeAuditRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const cursorId = row.audit_cursor_id
  const occurredAt = row.audit_occurred_at
  if (
    typeof cursorId !== 'string'
    || !validAuditId(cursorId)
    || typeof occurredAt !== 'string'
    || !validTimestamp(occurredAt)
  ) return null
  return {
    event: {
      audit_id: cursorId,
      audit_entity_type: row.audit_entity_type,
      audit_entity_id: row.audit_entity_id,
      audit_action: row.audit_action,
      audit_actor_user_id: row.audit_actor_user_id,
      audit_actor_kind: row.audit_actor_kind,
      audit_occurred_at: occurredAt,
      audit_before_state: sanitizeAuditState(row.audit_before_state),
      audit_after_state: sanitizeAuditState(row.audit_after_state),
    },
    cursorOccurredAt: occurredAt,
    cursorId,
  }
}

function sanitizeAuditState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditState)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(?:payment_key|secret|token|password|phone|photo|idempotency)/i.test(key))
      .map(([key, nested]) => [key, sanitizeAuditState(nested)]),
  )
}

function validTimestamp(value: string): boolean {
  return TIMESTAMPTZ_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

function validAuditId(value: string): boolean {
  if (!AUDIT_ID_PATTERN.test(value)) return false
  return value.length < MAX_POSTGRES_BIGINT.length
    || (value.length === MAX_POSTGRES_BIGINT.length && value <= MAX_POSTGRES_BIGINT)
}

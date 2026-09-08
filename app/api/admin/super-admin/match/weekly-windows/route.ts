import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asInteger,
  asIsoTimestamp,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

const MUTATION_KEYS = [
  'action', 'window_id', 'activity_id', 'activity_kind', 'week_key', 'title', 'summary',
  'starts_at', 'ends_at', 'application_closes_at', 'location_name', 'capacity',
  'activity_snapshot', 'expected_revision', 'idempotency_key',
] as const

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const rawWeekKey = new URL(request.url).searchParams.get('week_key')
    const weekKey = rawWeekKey ? asWeekKey(rawWeekKey) : null
    const { data, error } = await createSupabaseRequestClient(request).rpc('admin_list_weekly_activity_windows', {
      p_week_key: weekKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'], requireRecentAuth: true, checkMutationOrigin: true,
    })
    const body = await readStrictJson(request, MUTATION_KEYS)
    const action = asRequiredString(body.action, 'action', { maxLength: 20 })
    const supabase = createSupabaseRequestClient(request)
    if (action === 'create') {
      const { data, error } = await supabase.rpc('admin_create_weekly_activity_window', {
        p_activity_id: asRequiredString(body.activity_id, 'activity_id', { maxLength: 80, pattern: /^[a-z0-9][a-z0-9-]*$/ }),
        p_activity_kind: asActivityKind(body.activity_kind),
        p_week_key: asWeekKey(body.week_key),
        p_title: asRequiredString(body.title, 'title', { maxLength: 80 }),
        p_summary: asRequiredString(body.summary, 'summary', { maxLength: 280 }),
        p_starts_at: asIsoTimestamp(body.starts_at, 'starts_at'),
        p_ends_at: asIsoTimestamp(body.ends_at, 'ends_at'),
        p_application_closes_at: asIsoTimestamp(body.application_closes_at, 'application_closes_at'),
        p_location_name: asRequiredString(body.location_name, 'location_name', { maxLength: 160 }),
        p_capacity: asInteger(body.capacity, 'capacity', { min: 5, max: 60 }),
        p_activity_snapshot: asRecord(body.activity_snapshot, 'activity_snapshot'),
        p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
      })
      return error ? tonightRpcErrorResponse(error) : privateJson(data, 201)
    }
    if (action === 'update') {
      const { data, error } = await supabase.rpc('admin_update_weekly_activity_window', {
        p_window_id: asUuid(body.window_id, 'window_id'),
        p_title: asRequiredString(body.title, 'title', { maxLength: 80 }),
        p_summary: asRequiredString(body.summary, 'summary', { maxLength: 280 }),
        p_starts_at: asIsoTimestamp(body.starts_at, 'starts_at'),
        p_ends_at: asIsoTimestamp(body.ends_at, 'ends_at'),
        p_application_closes_at: asIsoTimestamp(body.application_closes_at, 'application_closes_at'),
        p_location_name: asRequiredString(body.location_name, 'location_name', { maxLength: 160 }),
        p_capacity: asInteger(body.capacity, 'capacity', { min: 5, max: 60 }),
        p_activity_snapshot: asRecord(body.activity_snapshot, 'activity_snapshot'),
        p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
        p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
      })
      return error ? tonightRpcErrorResponse(error) : privateJson(data)
    }
    if (action === 'publish') {
      const { data, error } = await supabase.rpc('admin_publish_weekly_activity_window', {
        p_window_id: asUuid(body.window_id, 'window_id'),
        p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
        p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
      })
      return error ? tonightRpcErrorResponse(error) : privateJson(data)
    }
    throw new TonightApiInputError('invalid_field', 'action')
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

function asWeekKey(value: unknown) {
  const text = asRequiredString(value, 'week_key', { maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ })
  const date = new Date(`${text}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.getUTCDay() !== 1) throw new TonightApiInputError('invalid_field', 'week_key')
  return text
}

function asActivityKind(value: unknown) {
  const kind = asRequiredString(value, 'activity_kind', { maxLength: 20 })
  if (!['board_game', 'walk', 'meal', 'bowling', 'other'].includes(kind)) {
    throw new TonightApiInputError('invalid_field', 'activity_kind')
  }
  return kind
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TonightApiInputError('invalid_field', field)
  return value as Record<string, unknown>
}

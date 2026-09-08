import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { assertStrictSearchParams } from '@/lib/server/tonight/access-directory'
import {
  asIdempotencyKey,
  asInteger,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const ARRIVAL_HELP_ACTIONS = new Set(['acknowledge', 'resolve', 'escalate'])

function readAction(value: unknown): string | null {
  const action = asRequiredString(value, 'action', {
    maxLength: 16,
    pattern: /^[a-z]+$/,
  })
  return ARRIVAL_HELP_ACTIONS.has(action) ? action : null
}

export async function GET(request: Request) {
  try {
    const searchParams = assertStrictSearchParams(request, ['round_id', 'venue_id'])
    const venueId = asUuid(searchParams.get('venue_id'), 'venue_id')
    await requireRequestAccess(request, {
      allowedRoles: ['partner'],
      partnerVenueId: venueId,
    })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('partner_get_tonight_arrival_help_queue', {
      p_round_id: asUuid(searchParams.get('round_id'), 'round_id'),
      p_venue_id: venueId,
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ arrival_help: Array.isArray(data) ? data : [] })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await readStrictJson(request, ['venue_id', 'request_id', 'action', 'expected_revision', 'idempotency_key'])
    const venueId = asUuid(body.venue_id, 'venue_id')
    await requireRequestAccess(request, {
      allowedRoles: ['partner'],
      partnerVenueId: venueId,
    })
    const action = readAction(body.action)
    if (!action) return privateJson({ error: 'invalid_request', field: 'action' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('partner_update_tonight_arrival_help', {
      p_venue_id: venueId,
      p_request_id: asUuid(body.request_id, 'request_id'),
      p_action: action,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 0,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    const arrivalHelp = Array.isArray(data) ? data[0] ?? null : data ?? null
    return privateJson({ arrival_help: arrivalHelp })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

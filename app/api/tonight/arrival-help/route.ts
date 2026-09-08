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

const ARRIVAL_HELP_CATEGORIES = new Set(['entrance', 'team', 'venue'])

function readCategory(value: unknown): string | null {
  const category = asRequiredString(value, 'category', {
    maxLength: 16,
    pattern: /^[a-z]+$/,
  })
  return ARRIVAL_HELP_CATEGORIES.has(category) ? category : null
}

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const searchParams = assertStrictSearchParams(request, ['team_id'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_tonight_arrival_help', {
      p_team_id: asUuid(searchParams.get('team_id'), 'team_id'),
    })
    if (error) return tonightRpcErrorResponse(error)
    const arrivalHelp = Array.isArray(data) ? data[0] ?? null : data ?? null
    return privateJson({ arrival_help: arrivalHelp })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, ['team_id', 'category', 'idempotency_key'])
    const category = readCategory(body.category)
    if (!category) return privateJson({ error: 'invalid_request', field: 'category' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('request_my_tonight_arrival_help', {
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_category: category,
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    const arrivalHelp = Array.isArray(data) ? data[0] ?? null : data ?? null
    return privateJson({ arrival_help: arrivalHelp }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, ['request_id', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('cancel_my_tonight_arrival_help', {
      p_request_id: asUuid(body.request_id, 'request_id'),
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

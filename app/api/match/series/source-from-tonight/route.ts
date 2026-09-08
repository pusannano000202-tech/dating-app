import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { TrustedOriginError, assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asUuid,
  readStrictJson,
  tonightInputErrorResponse,
} from '@/lib/server/tonight/api-contract'

function continuationJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function rpcMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

function sourceRegistrationError(error: unknown) {
  const message = rpcMessage(error)
  if (/source_attendee_required/.test(message)) return continuationJson({ error: 'forbidden' }, 403)
  if (/tonight_(?:team|activity)_not_found/.test(message)) return continuationJson({ error: 'not_found' }, 404)
  if (/invalid_/.test(message)) return continuationJson({ error: 'invalid_request' }, 400)
  if (/not_completed|actual_attendance_unknown|attendance_mismatch|snapshot_changed|idempotency_key_reused/.test(message)) {
    return continuationJson({ error: 'source_not_ready' }, 409)
  }
  return continuationJson({ error: 'service_unavailable' }, 503)
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['team_id', 'idempotency_key'])
    const teamId = asUuid(body.team_id, 'team_id')
    const idempotencyKey = asUuid(body.idempotency_key, 'idempotency_key')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('register_my_tonight_continuation_source', {
      p_team_id: teamId,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return sourceRegistrationError(error)
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.source_id !== 'string') {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    return continuationJson(data, data.replayed === true ? 200 : 201)
  } catch (error) {
    if (error instanceof TrustedOriginError) {
      return continuationJson({ error: error.status === 503 ? 'service_unavailable' : 'forbidden' }, error.status)
    }
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return continuationJson({ error: 'invalid_request' }, 400)
  }
}

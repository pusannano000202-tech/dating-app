import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

const CALL_OUTCOMES = new Set(['answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled'])

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const body = await readStrictJson(request, ['team_id', 'subject_user_id', 'outcome', 'idempotency_key'])
    const outcome = asRequiredString(body.outcome, 'outcome', { maxLength: 32, pattern: /^[a-z_]+$/ })
    if (!CALL_OUTCOMES.has(outcome)) return privateJson({ error: 'invalid_request', field: 'outcome' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_record_tonight_call_attempt', {
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_subject_user_id: asUuid(body.subject_user_id, 'subject_user_id'),
      p_outcome: outcome,
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ call_attempt_id: data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

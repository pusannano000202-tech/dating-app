import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asInteger,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const rawSeriesId = new URL(request.url).searchParams.get('series_id')
    const { data, error } = await createSupabaseRequestClient(request).rpc('admin_list_continuation_join_options', {
      p_series_id: rawSeriesId ? asUuid(rawSeriesId, 'series_id') : null,
    })
    return error ? tonightRpcErrorResponse(error) : privateJson(data)
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
    const body = await readStrictJson(request, [
      'action', 'series_id', 'candidate_user_id', 'expected_series_revision',
      'proposal_id', 'expected_revision', 'idempotency_key',
    ])
    const action = asRequiredString(body.action, 'action', { maxLength: 12 })
    const supabase = createSupabaseRequestClient(request)
    if (action === 'propose') {
      if (body.proposal_id !== undefined || body.expected_revision !== undefined) throw new TonightApiInputError('unexpected_field')
      const { data, error } = await supabase.rpc('propose_continuation_join_for_admin', {
        p_series_id: asUuid(body.series_id, 'series_id'),
        p_candidate_user_id: asUuid(body.candidate_user_id, 'candidate_user_id'),
        p_expected_series_revision: asInteger(body.expected_series_revision, 'expected_series_revision', { min: 0, max: 2_147_483_647 }),
        p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
      })
      return error ? tonightRpcErrorResponse(error) : privateJson(data, 201)
    }
    if (action === 'cancel') {
      if (body.series_id !== undefined || body.candidate_user_id !== undefined || body.expected_series_revision !== undefined) throw new TonightApiInputError('unexpected_field')
      const { data, error } = await supabase.rpc('cancel_continuation_join_for_admin', {
        p_proposal_id: asUuid(body.proposal_id, 'proposal_id'),
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

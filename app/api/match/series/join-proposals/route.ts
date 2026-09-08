import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asInteger, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { data, error } = await createSupabaseRequestClient(request).rpc('get_my_continuation_join_proposals')
    return error ? continuationRpcErrorResponse(error) : continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, [
      'proposal_id', 'decision', 'expected_revision', 'idempotency_key',
    ])
    const decision = asRequiredString(body.decision, 'decision', { maxLength: 8 })
    if (decision !== 'accept' && decision !== 'reject') throw new TonightApiInputError('invalid_field', 'decision')
    const { data, error } = await createSupabaseRequestClient(request).rpc('set_my_continuation_join_consent', {
      p_proposal_id: asUuid(body.proposal_id, 'proposal_id'),
      p_decision: decision,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    return error ? continuationRpcErrorResponse(error) : continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

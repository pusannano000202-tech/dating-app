import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'
import { parseDepartmentChallengeInviteState } from '@/lib/community/challenges'

type Context = { params: Promise<{ id: string; inviteId: string }> }

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id, inviteId } = await context.params
    const challengeId = asUuid(id, 'challenge_id')
    const acceptedInviteId = asUuid(inviteId, 'invite_id')
    const body = await readStrictJson(request, ['expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    // The scoped state read prevents a valid invite id from being used as a
    // cross-challenge capability. The acceptance RPC repeats ownership checks.
    const { data: inviteState, error: stateError } = await supabase.rpc(
      'get_my_department_challenge_invite_state',
      { p_challenge_id: challengeId },
    )
    if (stateError) return meetupRpcErrorResponse(stateError)
    const parsedState = parseDepartmentChallengeInviteState(inviteState)
    if (!parsedState) return meetupJson({ error: 'community_request_failed' }, 503)
    if (!parsedState.incoming.some((row) => row.invite_id === acceptedInviteId)) {
      return meetupJson({ error: 'department_challenge_invite_not_found' }, 404)
    }
    const { data, error } = await supabase.rpc('accept_my_department_challenge_invite', {
      p_invite_id: acceptedInviteId,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ invite: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

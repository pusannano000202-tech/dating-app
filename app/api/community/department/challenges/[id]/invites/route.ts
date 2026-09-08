import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  try {
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('get_my_department_challenge_invite_state', {
      p_challenge_id: asUuid(id, 'challenge_id'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ invite_state: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, [
      'team_id', 'friend_user_id', 'expected_revision', 'idempotency_key',
    ])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('invite_friend_to_department_challenge', {
      p_challenge_id: asUuid(id, 'challenge_id'),
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_friend_user_id: asUuid(body.friend_user_id, 'friend_user_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ invite: data }, 201)
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

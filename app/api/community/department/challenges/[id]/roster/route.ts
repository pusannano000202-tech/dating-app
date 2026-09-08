import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  return mutate(request, context, 'request_department_challenge_roster')
}

export async function DELETE(request: Request, context: Context) {
  return mutate(request, context, 'leave_my_department_challenge_roster')
}

async function mutate(request: Request, context: Context, rpc: 'request_department_challenge_roster' | 'leave_my_department_challenge_roster') {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, ['team_id', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc(rpc, {
      p_challenge_id: asUuid(id, 'challenge_id'),
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ challenge: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
  try {
    const { id } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('get_my_activity_meetup_guide', { p_meetup_id: asUuid(id, 'meetup_id') })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ guide: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, ['action', 'scene_id', 'expected_revision', 'idempotency_key'])
    const action = asRequiredString(body.action, 'action', { maxLength: 40, pattern: /^(acknowledge|advance_shared)$/ })
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const rpc = action === 'advance_shared'
      ? 'advance_my_activity_meetup_shared_guide'
      : 'acknowledge_my_activity_meetup_guide'
    const { data, error } = await supabase.rpc(rpc, {
      p_meetup_id: asUuid(id, 'meetup_id'),
      p_scene_id: asRequiredString(body.scene_id, 'scene_id', { maxLength: 40 }),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ guide: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


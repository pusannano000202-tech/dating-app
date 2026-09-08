import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
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
    const { data, error } = await supabase.rpc('get_my_activity_meetup_chat', { p_meetup_id: asUuid(id, 'meetup_id') })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ chat: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, ['message', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('send_my_activity_meetup_chat_message', {
      p_meetup_id: asUuid(id, 'meetup_id'),
      p_message: asRequiredString(body.message, 'message', { maxLength: 1000 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ message: data }, 201)
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


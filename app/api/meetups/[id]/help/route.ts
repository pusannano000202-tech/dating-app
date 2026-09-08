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
    const { data, error } = await supabase.rpc('get_my_activity_meetup_personal_actions', { p_meetup_id: asUuid(id, 'meetup_id') })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ actions: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, ['action', 'note', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('record_my_activity_meetup_personal_action', {
      p_meetup_id: asUuid(id, 'meetup_id'),
      p_action: asRequiredString(body.action, 'action', { maxLength: 40, pattern: /^(report_late|request_help|take_break)$/ }),
      p_note: asRequiredString(body.note, 'note', { minLength: 0, maxLength: 240 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ action: data }, 201)
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


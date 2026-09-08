import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asUuid } from '@/lib/server/tonight/api-contract'
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
    const { data, error } = await supabase.rpc('get_my_department_challenge', { p_challenge_id: asUuid(id, 'challenge_id') })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ challenge: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


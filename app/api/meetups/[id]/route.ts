import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'
import { asUuid } from '@/lib/server/tonight/api-contract'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
  try {
    const { id } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('get_my_activity_meetup_detail', { p_meetup_id: asUuid(id, 'meetup_id') })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ meetup: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


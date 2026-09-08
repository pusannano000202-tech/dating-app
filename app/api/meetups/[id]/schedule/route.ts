import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asIsoTimestamp, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const { id } = await context.params
    const body = await readStrictJson(request, ['scheduled_at', 'ends_at', 'place_name', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('update_my_activity_meetup_schedule', {
      p_meetup_id: asUuid(id, 'meetup_id'),
      p_scheduled_at: asIsoTimestamp(body.scheduled_at, 'scheduled_at'),
      p_ends_at: asIsoTimestamp(body.ends_at, 'ends_at'),
      p_place_name: asRequiredString(body.place_name, 'place_name', { minLength: 2, maxLength: 80 }),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ meetup: data })
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}


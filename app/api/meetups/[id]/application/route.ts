import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { parseAdmissionApplicationInput, parseAdmissionRoomTarget } from '@/lib/meetups/admission-contract'
import { AdmissionServerError, getMeetupAdmissionContext, prepareMeetupAdmission } from '@/lib/meetups/admission-server'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) { return handle(request, context, false) }
export async function POST(request: Request, context: Context) { return handle(request, context, true) }

async function handle(request: Request, context: Context, prepare: boolean) {
  try {
    assertTrustedMutationOrigin(request)
    const { id } = await context.params
    const room = parseAdmissionRoomTarget({ kind: 'custom_meetup', id })
    if (!room) return meetupJson({ error: 'invalid_meetup_id' }, 400)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const client = createSupabaseRequestClient(request)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError) return meetupJson({ error: 'community_unavailable' }, 503)
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await client.rpc('get_my_activity_meetup_detail', { p_meetup_id: room.id })
    if (error) return meetupRpcErrorResponse(error)
    if (!data || data.id !== room.id || typeof data.title !== 'string'
      || typeof data.category !== 'string' || typeof data.joined !== 'boolean' || typeof data.is_host !== 'boolean'
      || !Number.isInteger(data.capacity) || !Number.isInteger(data.member_count)) return meetupJson({ error: 'meetup_context_unavailable' }, 503)
    if (data.joined || data.is_host) return meetupJson({ error: 'already_meetup_member' }, 409)
    if (data.status !== 'open' || data.member_count >= data.capacity) return meetupJson({ error: 'meetup_not_available' }, 409)

    if (prepare) {
      if (Number(request.headers.get('content-length') ?? 0) > 4096) return meetupJson({ error: 'request_too_large' }, 413)
      const raw = await request.text()
      if (new TextEncoder().encode(raw).length > 4096) return meetupJson({ error: 'request_too_large' }, 413)
      let body: unknown
      try { body = JSON.parse(raw) } catch { return meetupJson({ error: 'invalid_request' }, 400) }
      const parsed = parseAdmissionApplicationInput(body)
      if (!parsed.ok) return meetupJson({ error: parsed.error, field: parsed.field }, 400)
      // The RPC rechecks ownership, room state and the canonical policy atomically.
      // This only prepares an intent: it never charges, admits, or marks it submitted.
      return meetupJson(await prepareMeetupAdmission(client, room.id, parsed.value))
    }

    const admission = await getMeetupAdmissionContext(client, room.id)
    return meetupJson({
      ...admission,
      accountKey: user.id,
      meetup: {
        id: data.id, title: data.title, category: data.category,
        activity_key: typeof data.activity_key === 'string' ? data.activity_key : null,
        description: typeof data.description === 'string' ? data.description : '',
        scheduled_at: typeof data.scheduled_at === 'string' ? data.scheduled_at : null,
        place_name: typeof data.place_name === 'string' ? data.place_name : null,
        member_count: data.member_count, capacity: data.capacity,
      },
    })
  } catch (error) {
    if (error instanceof AdmissionServerError) return meetupJson({ error: error.code }, error.status)
    if (error instanceof TypeError) return meetupJson({ error: 'community_unavailable' }, 503)
    return meetupInputErrorResponse(error)
  }
}

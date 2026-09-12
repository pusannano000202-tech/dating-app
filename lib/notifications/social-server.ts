import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const uuid = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${UUID}$`, 'i').test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export function isSocialResolvedHref(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return new RegExp(`^/meetups/(?:${UUID}|rooms/${UUID})$`, 'i').test(value)
    || new RegExp(`^/meetups/candidates\\?kind=(?:league|study|mentoring|meetup)&key=(?:[a-z0-9_-]|%3a){1,100}(?:&invite=${UUID})?$`, 'i').test(value)
    || new RegExp(`^/meetups/participation/(?:study|mentoring)/${UUID}/(?:applications|apply)$`, 'i').test(value)
    || new RegExp(`^/meetups/${UUID}/(?:applications|apply)$`, 'i').test(value)
    || new RegExp(`^/chat/(?:league-team/${UUID}|rooms/(?:league_match|meetup|activity_room|study_room|mentoring)/${UUID})$`, 'i').test(value)
    || new RegExp(`^/meetups/study\\?room=${UUID}$`, 'i').test(value)
    || new RegExp(`^/meetups/department/mentoring\\?(?:party|session)=${UUID}$`, 'i').test(value)
    || new RegExp(`^/meetups/league\\?sport=(?:lol|futsal|football)&challenge=${UUID}&team=${UUID}(?:&panel=applications(?:&slot=[a-z][a-z0-9_]{0,20})?)?$`, 'i').test(value)
}

function validPage(value: unknown): boolean {
  if (!object(value) || !Array.isArray(value.notifications) || value.notifications.length > 100 || typeof value.has_more !== 'boolean') return false
  if (!value.notifications.every(row => object(row) && uuid(row.id) && typeof row.kind === 'string' && row.kind.length <= 80 && object(row.payload) && timestamp(row.created_at) && (row.read_at === null || timestamp(row.read_at)))) return false
  if (!value.has_more) return value.next_cursor === null
  if (!value.notifications.length || !object(value.next_cursor) || !uuid(value.next_cursor.id) || !timestamp(value.next_cursor.created_at)) return false
  const last = value.notifications[value.notifications.length - 1]
  return last.id === value.next_cursor.id && last.created_at === value.next_cursor.created_at
}

export async function handleSocialNotificationRead(request: Request, mode: 'resolve' | 'chat' | 'page'): Promise<Response> {
  const params = new URL(request.url).searchParams
  const keys = mode !== 'page' ? ['id'] : ['limit', 'before_created_at', 'before_id']
  if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1)) return json({ error: 'invalid_notification_query' }, 400)
  let args: Record<string, unknown>
  if (mode !== 'page') {
    if (!uuid(params.get('id'))) return json({ error: 'invalid_notification_query' }, 400)
    args = { p_notification_id: params.get('id') }
  } else {
    const limit = params.get('limit') ?? '50', before = params.get('before_created_at'), id = params.get('before_id')
    if (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100 || (before === null) !== (id === null) || (before !== null && (!timestamp(before) || !uuid(id)))) return json({ error: 'invalid_notification_query' }, 400)
    args = { p_limit: Number(limit), p_before_created_at: before, p_before_id: id }
  }
  if (!isSupabaseConfigured()) return json({ error: 'notification_unavailable' }, 503)
  try {
    const client = createSupabaseRequestClient(request)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError) return json({ error: 'notification_unavailable' }, 503)
    if (!user) return json({ error: 'not_authenticated' }, 401)
    const { data, error } = await client.rpc(mode === 'resolve' ? 'get_activity_meetup_admission_notification' : mode === 'chat' ? 'resolve_my_social_chat_notification' : 'get_my_notifications_page', args)
    if (error) {
      if (error.message === 'notification_not_found') return json({ error: 'notification_not_found' }, 404)
      if (error.message === 'invalid_notification_cursor') return json({ error: 'invalid_notification_cursor' }, 400)
      return json({ error: 'notification_unavailable' }, 503)
    }
    const valid = mode === 'page' ? validPage(data) : object(data) && ((data.status === 'ended' && data.href === null) || (data.status === 'current' && isSocialResolvedHref(data.href)))
    if (!valid) return json({ error: 'notification_unavailable' }, 503)
    return json({ ...data, owner_id: user.id })
  } catch {
    return json({ error: 'notification_unavailable' }, 503)
  }
}

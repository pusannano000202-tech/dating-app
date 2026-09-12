import { NextRequest } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { isSupabaseConfigured } from '@/lib/utils'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { meetupJson } from './http'
import { classifyStudyRoomError } from './study-room-contract'

/** Never uses a service key: DB independently derives actor, department and membership. */
export async function studyRoomRpc(req: NextRequest, action: string, args: Record<string, unknown>, mutation = false) {
  if (!isCommunityFeatureEnabled()) return meetupJson({ error: 'community_unavailable' }, 503)
  if (mutation) {
    try { assertTrustedMutationOrigin(req) }
    catch (error) { return meetupJson({ error: 'request_not_allowed' }, error instanceof TrustedOriginError ? error.status : 403) }
  }
  if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
  try {
    const client = createSupabaseRequestClient(req)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError && ![400, 401, 403].includes(authError.status ?? 0)) return meetupJson({ error: 'community_unavailable' }, 503)
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    if(action==='create_hosted'&&req.headers.get('x-quantum-owner')!==user.id)return meetupJson({error:'account_changed'},409)
    const { data, error } = await client.rpc('study_room_action', { p_action: action, p_args: args })
    if (error) {
      const classified = classifyStudyRoomError(error)
      return meetupJson({ error: classified.error }, classified.status)
    }
    return meetupJson({ data })
  } catch { return meetupJson({ error: 'community_unavailable' }, 503) }
}

/** Bound before JSON parsing, including chunked requests without Content-Length. */
export async function readStudyRoomBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null
  const announcedLength = Number(req.headers.get('content-length') ?? 0)
  if (!Number.isFinite(announcedLength) || announcedLength > 16000) return null
  const reader = req.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder(); let bytes = 0; let source = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16000) { await reader.cancel(); return null }
      source += decoder.decode(value, { stream: true })
    }
    source += decoder.decode()
    const parsed: unknown = JSON.parse(source)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch { return null } finally { reader.releaseLock() }
}

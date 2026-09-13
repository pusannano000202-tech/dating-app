import { NextRequest } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { isSupabaseConfigured } from '@/lib/utils'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { meetupJson } from './http'

export async function activityRoomRpc(req: NextRequest, name: string, args: Record<string, unknown>, mutation = false) {
  if (!isCommunityFeatureEnabled()) return meetupJson({ error: 'community_unavailable' }, 503)
  if (mutation) {
    try { assertTrustedMutationOrigin(req) }
    catch (error) { return meetupJson({ error: 'request_not_allowed' }, error instanceof TrustedOriginError ? error.status : 403) }
  }
  if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
  try {
    const client = createSupabaseRequestClient(req)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError && authError.status !== 400 && authError.status !== 401 && authError.status !== 403) return meetupJson({ error: 'community_unavailable' }, 503)
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const expectedAccount = req.headers.get('X-Expected-Account')
    if (expectedAccount !== null && expectedAccount !== user.id) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await client.rpc(name, args)
    if (error) {
      const message = error.message.toLowerCase()
      if (/does not exist|schema cache|undefined_|42p01|42883/.test(message)) return meetupJson({ error: 'community_schema_unavailable' }, 503)
      const code = message.match(/(?:activity_|meetup_|community_)?(?:room_|profile_|gender_|membership_|account_|invalid_|already_|blocked|not_authenticated|forbidden|contact_sharing_|idempotency_key_)[a-z_]*/)?.[0] ?? 'community_unavailable'
      const status = /rate_limited/.test(message) ? 429 : /not_authenticated/.test(message) ? 401
        : /profile_required|gender_required|full|already_joined|idempotency_key_reused/.test(message) ? 409
        : /not_joinable|restricted|blocked|forbidden|membership_required|account_/.test(message) ? 403
        : /not_found/.test(message) ? 404
        : /invalid_|contact_sharing_not_allowed/.test(message) ? 400 : 503
      return meetupJson({ error: code }, status)
    }
    return meetupJson({ data })
  } catch { return meetupJson({ error: 'community_unavailable' }, 503) }
}

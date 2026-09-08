import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const userId = asUuid(new URL(request.url).searchParams.get('user_id'), 'user_id')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_get_user_profile', { p_user_id: userId })
    if (error) return tonightRpcErrorResponse(error)
    const profile = Array.isArray(data) ? data[0] ?? null : data
    if (!profile || typeof profile !== 'object') return privateJson({ profile: null })
    const signed = await signPrivateProfilePhotos([userId], 3)
    if (!signed.ok) return privateJson({ error: 'photo_service_unavailable' }, 503)
    return privateJson({ profile: { ...(profile as Record<string, unknown>), photo_urls: signed.urlsByUser[userId] ?? [] } })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

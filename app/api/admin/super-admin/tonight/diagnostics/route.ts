import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const teamId = asUuid(new URL(request.url).searchParams.get('team_id'), 'team_id')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_get_tonight_team_diagnostics', { p_team_id: teamId })
    if (error) return tonightRpcErrorResponse(error)
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    const userIds = rows
      .map((row) => row.diagnostic_user_id)
      .filter((value): value is string => typeof value === 'string')
    const signed = await signPrivateProfilePhotos(userIds, 3)
    if (!signed.ok) return privateJson({ error: 'photo_service_unavailable' }, 503)
    const diagnostics = rows.map(({ diagnostic_photo_storage_paths: _privatePaths, ...row }) => ({
      ...row,
      photo_urls: typeof row.diagnostic_user_id === 'string'
        ? signed.urlsByUser[row.diagnostic_user_id] ?? []
        : [],
    }))
    return privateJson({ diagnostics })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

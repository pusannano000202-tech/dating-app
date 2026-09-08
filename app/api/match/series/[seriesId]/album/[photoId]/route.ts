import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import { buildContinuationSeriesAlbumPath } from '@/lib/matching/continuation-series-album'
import { MEETING_EVIDENCE_BUCKET } from '@/lib/matching/meeting-evidence'
import { asUuid } from '@/lib/server/tonight/api-contract'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ seriesId: string; photoId: string }> },
) {
  try {
    assertTrustedMutationOrigin(request)
    const access = await requireRequestAccess(request, {
      allowedRoles: ['user'],
      checkMutationOrigin: false,
    })
    const params = await context.params
    const seriesId = asUuid(params.seriesId, 'series_id')
    const photoId = asUuid(params.photoId, 'photo_id')
    const admin = createSupabaseAdminClient()
    if (!admin) return continuationJson({ error: 'service_unavailable' }, 503)

    const reserved = await admin.rpc('reserve_continuation_series_album_delete_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
      p_photo_id: photoId,
    })
    if (reserved.error) {
      const message = isRecord(reserved.error) && typeof reserved.error.message === 'string'
        ? reserved.error.message.toLowerCase()
        : ''
      if (message.includes('series_album_upload_busy')) {
        return continuationJson({ error: 'not_ready' }, 409)
      }
      return continuationRpcErrorResponse(reserved.error)
    }
    if (!isRecord(reserved.data) || typeof reserved.data.status !== 'string') {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    if (reserved.data.status === 'deleted') {
      return continuationJson({ photoId, status: 'deleted', replayed: true })
    }
    if (reserved.data.status !== 'delete_pending' || typeof reserved.data.storage_path !== 'string') {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    const storageParts = reserved.data.storage_path.split('/')
    if (storageParts.length !== 5) return continuationJson({ error: 'service_unavailable' }, 503)
    let expectedPath: string
    try {
      expectedPath = buildContinuationSeriesAlbumPath(
        seriesId,
        storageParts[2] as 'source' | 'occurrence',
        storageParts[3] ?? '',
        photoId,
      )
    } catch {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    if (reserved.data.storage_path !== expectedPath) {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }

    const removed = await admin.storage
      .from(MEETING_EVIDENCE_BUCKET)
      .remove([expectedPath])
    if (removed.error) {
      return continuationJson({ photoId, status: 'delete_pending', retryable: true }, 503)
    }
    const finalized = await admin.rpc('finalize_continuation_series_album_delete_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
      p_photo_id: photoId,
    })
    if (finalized.error) return continuationRpcErrorResponse(finalized.error)
    if (!isRecord(finalized.data) || finalized.data.status !== 'deleted') {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    return continuationJson({ photoId, status: 'deleted', replayed: finalized.data.replayed === true })
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

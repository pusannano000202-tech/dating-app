import { createHash, randomUUID } from 'node:crypto'

import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import {
  CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS,
  buildContinuationSeriesAlbumPath,
  parseContinuationSeriesAlbumPayload,
  parseContinuationSeriesAlbumUploadTarget,
} from '@/lib/matching/continuation-series-album'
import {
  ContinuationSeriesAlbumFormError,
  readStrictContinuationSeriesAlbumForm,
} from '@/lib/matching/continuation-series-album-multipart'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import {
  MEETING_EVIDENCE_BUCKET,
  sanitizeMeetingEvidenceImage,
  validateMeetingEvidenceFile,
  validateMeetingEvidenceSignature as assertMeetingEvidenceImageSignature,
} from '@/lib/matching/meeting-evidence'
import { asUuid } from '@/lib/server/tonight/api-contract'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>

export async function GET(request: Request, context: { params: Promise<{ seriesId: string }> }) {
  try {
    const access = await requireRequestAccess(request, {
      allowedRoles: ['user'],
      checkMutationOrigin: false,
    })
    const { seriesId: rawSeriesId } = await context.params
    const seriesId = asUuid(rawSeriesId, 'series_id')
    const admin = createSupabaseAdminClient()
    if (!admin) return continuationJson({ error: 'service_unavailable' }, 503)

    const projection = await admin.rpc('get_continuation_series_album_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
    })
    if (projection.error) return albumRpcErrorResponse(projection.error)

    const payload = await signProjection(admin, projection.data, seriesId)
    if (!payload) return continuationJson({ error: 'service_unavailable' }, 503)
    return continuationJson(payload)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function POST(request: Request, context: { params: Promise<{ seriesId: string }> }) {
  try {
    assertTrustedMutationOrigin(request)
    const access = await requireRequestAccess(request, {
      allowedRoles: ['user'],
      checkMutationOrigin: false,
    })
    const { seriesId: rawSeriesId } = await context.params
    const seriesId = asUuid(rawSeriesId, 'series_id')
    const admin = createSupabaseAdminClient()
    if (!admin) return continuationJson({ error: 'service_unavailable' }, 503)

    const form = await readStrictContinuationSeriesAlbumForm(request)
    const target = parseContinuationSeriesAlbumUploadTarget({
      targetKind: form.get('targetKind'),
      targetId: form.get('targetId'),
      idempotencyKey: form.get('idempotencyKey'),
    })
    const photo = form.get('photo')
    if (!(photo instanceof File)) return continuationJson({ error: 'invalid_request' }, 400)
    const validation = validateMeetingEvidenceFile({ contentType: photo.type, byteSize: photo.size })
    if (!validation.ok) return continuationJson({ error: validation.error }, 422)

    const targetAccess = await admin.rpc('get_continuation_series_album_upload_target_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
      p_target_kind: target.targetKind,
      p_target_id: target.targetId,
    })
    if (targetAccess.error) return albumRpcErrorResponse(targetAccess.error)
    if (
      !isRecord(targetAccess.data) ||
      targetAccess.data.target_kind !== target.targetKind ||
      targetAccess.data.target_id !== target.targetId
    ) return continuationJson({ error: 'service_unavailable' }, 503)
    if (targetAccess.data.can_upload !== true) {
      return continuationJson({ error: 'not_ready' }, 409)
    }

    const sourceBytes = Buffer.from(await photo.arrayBuffer())
    const signature = assertMeetingEvidenceImageSignature(sourceBytes, photo.type)
    if (!signature.ok) return continuationJson({ error: signature.error }, 422)
    let sanitizedBytes: Buffer
    try {
      sanitizedBytes = await sanitizeMeetingEvidenceImage(sourceBytes)
    } catch {
      return continuationJson({ error: 'photo_content_invalid' }, 422)
    }
    const sanitizedValidation = validateMeetingEvidenceFile({
      contentType: 'image/jpeg',
      byteSize: sanitizedBytes.length,
    })
    if (!sanitizedValidation.ok) {
      return continuationJson({ error: sanitizedValidation.error }, 422)
    }

    const photoId = randomUUID()
    const processingToken = randomUUID()
    const sourceSha256 = createHash('sha256').update(sanitizedBytes).digest('hex')
    const reservation = await admin.rpc('reserve_continuation_series_album_upload_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
      p_target_kind: target.targetKind,
      p_target_id: target.targetId,
      p_photo_id: photoId,
      p_idempotency_key: target.idempotencyKey,
      p_source_sha256: sourceSha256,
      p_processing_token: processingToken,
    })
    if (reservation.error) return albumRpcErrorResponse(reservation.error)
    const reserved = parseReservation(reservation.data)
    if (!reserved) return continuationJson({ error: 'service_unavailable' }, 503)
    if (reserved.status === 'active') {
      return continuationJson({ photoId: reserved.photoId, status: 'active', replayed: true })
    }
    if (!reserved.ownsProcessing) {
      return continuationJson({ photoId: reserved.photoId, status: 'uploading', retryable: true }, 202)
    }

    const expectedPath = buildContinuationSeriesAlbumPath(
      seriesId,
      target.targetKind,
      target.targetId,
      reserved.photoId,
    )
    if (reserved.storagePath !== expectedPath) {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    const upload = await admin.storage
      .from(MEETING_EVIDENCE_BUCKET)
      .upload(expectedPath, sanitizedBytes, { contentType: 'image/jpeg', upsert: true })
    if (upload.error) {
      return continuationJson(
        { photoId: reserved.photoId, status: 'uploading', retryable: true },
        503,
      )
    }

    const finalized = await admin.rpc('finalize_continuation_series_album_upload_for_service', {
      p_actor_user_id: access.userId,
      p_series_id: seriesId,
      p_photo_id: reserved.photoId,
      p_processing_token: processingToken,
      p_byte_size: sanitizedBytes.length,
    })
    if (finalized.error) return albumRpcErrorResponse(finalized.error)
    if (
      isRecord(finalized.data) &&
      finalized.data.cleanup_required === true &&
      (finalized.data.status === 'delete_pending' || finalized.data.status === 'deleted') &&
      finalized.data.storage_path === expectedPath
    ) {
      const removed = await admin.storage.from(MEETING_EVIDENCE_BUCKET).remove([expectedPath])
      if (removed.error) {
        return continuationJson(
          { photoId: reserved.photoId, status: finalized.data.status, retryable: true },
          503,
        )
      }
      const deleted = await finalizeDelete(admin, access.userId, seriesId, reserved.photoId)
      if (!deleted) return continuationJson({ error: 'service_unavailable' }, 503)
      return continuationJson({ error: 'not_ready' }, 409)
    }
    if (!isRecord(finalized.data) || finalized.data.status !== 'active') {
      return continuationJson({ error: 'service_unavailable' }, 503)
    }
    return continuationJson(
      { photoId: reserved.photoId, status: 'active', replayed: finalized.data.replayed === true },
      reserved.replayed ? 200 : 201,
    )
  } catch (error) {
    if (error instanceof ContinuationSeriesAlbumFormError) {
      return continuationJson({ error: error.publicCode }, error.status)
    }
    return continuationRouteErrorResponse(error)
  }
}

function parseReservation(value: unknown): {
  photoId: string
  storagePath: string
  status: 'uploading' | 'active'
  replayed: boolean
  ownsProcessing: boolean
} | null {
  if (
    !isRecord(value) ||
    typeof value.photo_id !== 'string' ||
    typeof value.storage_path !== 'string' ||
    (value.status !== 'uploading' && value.status !== 'active') ||
    typeof value.replayed !== 'boolean' ||
    typeof value.owns_processing !== 'boolean'
  ) return null
  try {
    return {
      photoId: asUuid(value.photo_id, 'photo_id'),
      storagePath: value.storage_path,
      status: value.status,
      replayed: value.replayed,
      ownsProcessing: value.owns_processing,
    }
  } catch {
    return null
  }
}

async function signProjection(admin: AdminClient, value: unknown, seriesId: string) {
  if (
    !isRecord(value) ||
    value.series_id !== seriesId ||
    !Array.isArray(value.days) ||
    !Array.isArray(value.pending_deletion_photo_ids) ||
    !Array.isArray(value.pending_uploads)
  ) return null
  const pendingUploads = []
  for (const rawUpload of value.pending_uploads) {
    if (
      !isRecord(rawUpload) ||
      (rawUpload.target_kind !== 'source' && rawUpload.target_kind !== 'occurrence') ||
      typeof rawUpload.photo_id !== 'string' ||
      typeof rawUpload.target_id !== 'string' ||
      typeof rawUpload.lease_expires_at !== 'string' ||
      typeof rawUpload.can_cancel !== 'boolean'
    ) return null
    try {
      pendingUploads.push({
        photoId: asUuid(rawUpload.photo_id, 'photo_id'),
        targetKind: rawUpload.target_kind,
        targetId: asUuid(rawUpload.target_id, 'target_id'),
        leaseExpiresAt: rawUpload.lease_expires_at,
        canCancel: rawUpload.can_cancel,
      })
    } catch {
      return null
    }
  }
  const days = []
  for (const rawDay of value.days) {
    if (!isRecord(rawDay) || !Array.isArray(rawDay.photos)) return null
    const photos = []
    for (const rawPhoto of rawDay.photos) {
      if (
        !isRecord(rawPhoto) ||
        typeof rawPhoto.id !== 'string' ||
        typeof rawPhoto.storage_path !== 'string' ||
        typeof rawPhoto.created_at !== 'string' ||
        typeof rawPhoto.mine !== 'boolean'
      ) return null
      let expectedPath: string
      try {
        expectedPath = buildContinuationSeriesAlbumPath(
          seriesId,
          rawDay.target_kind as 'source' | 'occurrence',
          rawDay.target_id as string,
          rawPhoto.id,
        )
      } catch {
        return null
      }
      if (rawPhoto.storage_path !== expectedPath) return null
      const signed = await admin.storage
        .from(MEETING_EVIDENCE_BUCKET)
        .createSignedUrl(rawPhoto.storage_path, CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS)
      if (signed.error || !signed.data.signedUrl) return null
      photos.push({
        id: rawPhoto.id,
        signedUrl: signed.data.signedUrl,
        createdAt: rawPhoto.created_at,
        mine: rawPhoto.mine,
        expiresIn: CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS,
      })
    }
    days.push({
      targetKind: rawDay.target_kind,
      targetId: rawDay.target_id,
      programDay: rawDay.program_day,
      physicalMeetingNo: rawDay.physical_meeting_no,
      happenedAt: rawDay.happened_at,
      uploadClosesAt: rawDay.upload_closes_at,
      canUpload: rawDay.can_upload,
      photos,
    })
  }
  try {
    return parseContinuationSeriesAlbumPayload({
      seriesId,
      serverNow: value.server_now,
      retentionDays: value.retention_days,
      pendingDeletionPhotoIds: value.pending_deletion_photo_ids,
      pendingUploads,
      days,
    })
  } catch {
    return null
  }
}

async function finalizeDelete(
  admin: AdminClient,
  actorUserId: string,
  seriesId: string,
  photoId: string,
) {
  const result = await admin.rpc('finalize_continuation_series_album_delete_for_service', {
    p_actor_user_id: actorUserId,
    p_series_id: seriesId,
    p_photo_id: photoId,
  })
  return !result.error && isRecord(result.data) && result.data.status === 'deleted'
}

function albumRpcErrorResponse(error: unknown) {
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  if (/series_album_(?:user|target)_limit|series_album_upload_closed/.test(message)) {
    return continuationJson({ error: 'not_ready' }, 409)
  }
  if (/series_album_target_not_available/.test(message)) {
    return continuationJson({ error: 'forbidden' }, 403)
  }
  return continuationRpcErrorResponse(error)
}

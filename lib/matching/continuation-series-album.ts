export const CONTINUATION_SERIES_ALBUM_MAX_BYTES = 12 * 1024 * 1024
export const CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES =
  CONTINUATION_SERIES_ALBUM_MAX_BYTES + 256 * 1024
export const CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS = 300
export const CONTINUATION_SERIES_ALBUM_RETENTION_DAYS = 90

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ContinuationSeriesAlbumTargetKind = 'source' | 'occurrence'

export type ContinuationSeriesAlbumPhoto = {
  id: string
  signedUrl: string
  createdAt: string
  mine: boolean
  expiresIn: number
}

export type ContinuationSeriesAlbumDay = {
  targetKind: ContinuationSeriesAlbumTargetKind
  targetId: string
  programDay: number
  physicalMeetingNo: number
  happenedAt: string | null
  uploadClosesAt: string | null
  canUpload: boolean
  photos: ContinuationSeriesAlbumPhoto[]
}

export type ContinuationSeriesAlbumPayload = {
  seriesId: string
  serverNow: string
  retentionDays: number
  pendingDeletionPhotoIds: string[]
  pendingUploads: ContinuationSeriesAlbumPendingUpload[]
  days: ContinuationSeriesAlbumDay[]
}

export type ContinuationSeriesAlbumPendingUpload = {
  photoId: string
  targetKind: ContinuationSeriesAlbumTargetKind
  targetId: string
  leaseExpiresAt: string
  canCancel: boolean
}

export type ContinuationSeriesAlbumUploadTarget = {
  targetKind: ContinuationSeriesAlbumTargetKind
  targetId: string
  idempotencyKey: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function failPayload(): never {
  throw new Error('invalid_series_album_payload')
}

function parsePhoto(value: unknown): ContinuationSeriesAlbumPhoto {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'signedUrl', 'createdAt', 'mine', 'expiresIn']) ||
    !isUuid(value.id) ||
    !isIsoDate(value.createdAt) ||
    typeof value.mine !== 'boolean' ||
    value.expiresIn !== CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS ||
    typeof value.signedUrl !== 'string'
  ) {
    return failPayload()
  }

  let signedUrl: URL
  try {
    signedUrl = new URL(value.signedUrl)
  } catch {
    return failPayload()
  }
  if (signedUrl.protocol !== 'https:' && signedUrl.protocol !== 'http:') return failPayload()

  return {
    id: value.id,
    signedUrl: value.signedUrl,
    createdAt: value.createdAt,
    mine: value.mine,
    expiresIn: value.expiresIn,
  }
}

function parseDay(value: unknown): ContinuationSeriesAlbumDay {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'targetKind',
      'targetId',
      'programDay',
      'physicalMeetingNo',
      'happenedAt',
      'uploadClosesAt',
      'canUpload',
      'photos',
    ]) ||
    (value.targetKind !== 'source' && value.targetKind !== 'occurrence') ||
    !isUuid(value.targetId) ||
    !Number.isInteger(value.programDay) ||
    !Number.isInteger(value.physicalMeetingNo) ||
    typeof value.canUpload !== 'boolean' ||
    (value.happenedAt !== null && !isIsoDate(value.happenedAt)) ||
    (value.uploadClosesAt !== null && !isIsoDate(value.uploadClosesAt)) ||
    !Array.isArray(value.photos)
  ) {
    return failPayload()
  }

  const programDay = value.programDay as number
  const physicalMeetingNo = value.physicalMeetingNo as number
  if (programDay < 1 || programDay > 5 || physicalMeetingNo < 1 || physicalMeetingNo > 6) {
    return failPayload()
  }
  if (value.targetKind === 'source' && (programDay !== 1 || physicalMeetingNo !== 1)) {
    return failPayload()
  }
  if (value.canUpload && value.uploadClosesAt === null) return failPayload()

  const photos = value.photos.map(parsePhoto)
  if (new Set(photos.map((photo) => photo.id)).size !== photos.length) return failPayload()

  return {
    targetKind: value.targetKind,
    targetId: value.targetId,
    programDay,
    physicalMeetingNo,
    happenedAt: value.happenedAt,
    uploadClosesAt: value.uploadClosesAt,
    canUpload: value.canUpload,
    photos,
  }
}

export function parseContinuationSeriesAlbumPayload(value: unknown): ContinuationSeriesAlbumPayload {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'seriesId', 'serverNow', 'retentionDays', 'pendingDeletionPhotoIds', 'pendingUploads', 'days',
    ]) ||
    !isUuid(value.seriesId) ||
    !isIsoDate(value.serverNow) ||
    value.retentionDays !== CONTINUATION_SERIES_ALBUM_RETENTION_DAYS ||
    !Array.isArray(value.days) ||
    !Array.isArray(value.pendingDeletionPhotoIds) ||
    !value.pendingDeletionPhotoIds.every(isUuid) ||
    !Array.isArray(value.pendingUploads)
  ) {
    return failPayload()
  }

  const days = value.days.map(parseDay)
  const targets = days.map((day) => `${day.targetKind}:${day.targetId}`)
  if (new Set(targets).size !== targets.length) return failPayload()
  if (new Set(value.pendingDeletionPhotoIds).size !== value.pendingDeletionPhotoIds.length) {
    return failPayload()
  }
  const pendingUploads = value.pendingUploads.map(parsePendingUpload)
  if (new Set(pendingUploads.map((upload) => upload.photoId)).size !== pendingUploads.length) {
    return failPayload()
  }
  for (let index = 1; index < days.length; index += 1) {
    if ((days[index - 1]?.programDay ?? 0) >= (days[index]?.programDay ?? 0)) return failPayload()
  }

  return {
    seriesId: value.seriesId,
    serverNow: value.serverNow,
    retentionDays: value.retentionDays,
    pendingDeletionPhotoIds: value.pendingDeletionPhotoIds,
    pendingUploads,
    days,
  }
}

function parsePendingUpload(value: unknown): ContinuationSeriesAlbumPendingUpload {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['photoId', 'targetKind', 'targetId', 'leaseExpiresAt', 'canCancel']) ||
    !isUuid(value.photoId) ||
    (value.targetKind !== 'source' && value.targetKind !== 'occurrence') ||
    !isUuid(value.targetId) ||
    !isIsoDate(value.leaseExpiresAt) ||
    typeof value.canCancel !== 'boolean'
  ) return failPayload()
  return {
    photoId: value.photoId,
    targetKind: value.targetKind,
    targetId: value.targetId,
    leaseExpiresAt: value.leaseExpiresAt,
    canCancel: value.canCancel,
  }
}

export function parseContinuationSeriesAlbumUploadTarget(
  value: unknown,
): ContinuationSeriesAlbumUploadTarget {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['targetKind', 'targetId', 'idempotencyKey']) ||
    (value.targetKind !== 'source' && value.targetKind !== 'occurrence') ||
    !isUuid(value.targetId) ||
    !isUuid(value.idempotencyKey)
  ) {
    throw new Error('invalid_series_album_upload_target')
  }
  return {
    targetKind: value.targetKind,
    targetId: value.targetId,
    idempotencyKey: value.idempotencyKey,
  }
}

export function buildContinuationSeriesAlbumPath(
  seriesId: string,
  targetKind: ContinuationSeriesAlbumTargetKind,
  targetId: string,
  photoId: string,
) {
  if (
    !isUuid(seriesId) ||
    (targetKind !== 'source' && targetKind !== 'occurrence') ||
    !isUuid(targetId) ||
    !isUuid(photoId)
  ) {
    throw new Error('invalid_series_album_path')
  }
  return `continuation-series/${seriesId}/${targetKind}/${targetId}/${photoId}.jpg`
}

export function asContinuationSeriesAlbumUuid(value: unknown, error = 'invalid_request') {
  if (!isUuid(value)) throw new Error(error)
  return value
}

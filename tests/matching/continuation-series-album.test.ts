import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  CONTINUATION_SERIES_ALBUM_MAX_BYTES,
  CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES,
  CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS,
  buildContinuationSeriesAlbumPath,
  parseContinuationSeriesAlbumPayload,
  parseContinuationSeriesAlbumUploadTarget,
} from '../../lib/matching/continuation-series-album'
import {
  ContinuationSeriesAlbumFormError,
  readStrictContinuationSeriesAlbumForm,
} from '../../lib/matching/continuation-series-album-multipart'

const seriesId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const occurrenceId = '33333333-3333-4333-8333-333333333333'
const photoId = '44444444-4444-4444-8444-444444444444'
const idempotencyKey = '55555555-5555-4555-8555-555555555555'

const workspaceRoot = join(__dirname, '..', '..', '..', '..')

test('client payload keeps program day, physical meeting, and source target distinct', () => {
  const parsed = parseContinuationSeriesAlbumPayload({
    seriesId,
    serverNow: '2026-09-06T12:00:00.000Z',
    retentionDays: 90,
    pendingDeletionPhotoIds: [],
    pendingUploads: [
      {
        photoId: '66666666-6666-4666-8666-666666666666',
        targetKind: 'occurrence',
        targetId: occurrenceId,
        leaseExpiresAt: '2026-09-06T12:05:00.000Z',
        canCancel: false,
      },
    ],
    days: [
      {
        targetKind: 'source',
        targetId: sourceId,
        programDay: 1,
        physicalMeetingNo: 1,
        happenedAt: '2026-09-05T12:00:00.000Z',
        uploadClosesAt: '2026-09-06T12:00:00.000Z',
        canUpload: true,
        photos: [
          {
            id: photoId,
            signedUrl: 'http://127.0.0.1:56421/storage/v1/object/sign/private/photo.jpg?token=test',
            createdAt: '2026-09-05T12:10:00.000Z',
            mine: true,
            expiresIn: 300,
          },
        ],
      },
      {
        targetKind: 'occurrence',
        targetId: occurrenceId,
        programDay: 2,
        physicalMeetingNo: 2,
        happenedAt: null,
        uploadClosesAt: null,
        canUpload: false,
        photos: [],
      },
    ],
  })

  assert.equal(parsed.days[0]?.targetKind, 'source')
  assert.equal(parsed.days[0]?.programDay, 1)
  assert.equal(parsed.days[0]?.physicalMeetingNo, 1)
  assert.equal(parsed.days[1]?.targetKind, 'occurrence')
  assert.equal(parsed.days[1]?.programDay, 2)
  assert.equal(parsed.pendingUploads[0]?.canCancel, false)
})

test('source rows cannot masquerade as a non-Day-1 program occurrence', () => {
  assert.throws(
    () =>
      parseContinuationSeriesAlbumPayload({
        seriesId,
        serverNow: '2026-09-06T12:00:00.000Z',
        retentionDays: 90,
        pendingDeletionPhotoIds: [],
        pendingUploads: [],
        days: [
          {
            targetKind: 'source',
            targetId: sourceId,
            programDay: 2,
            physicalMeetingNo: 1,
            happenedAt: null,
            uploadClosesAt: null,
            canUpload: false,
            photos: [],
          },
        ],
      }),
    /invalid_series_album_payload/,
  )
})

test('client projection rejects raw storage paths', () => {
  assert.throws(
    () =>
      parseContinuationSeriesAlbumPayload({
        seriesId,
        serverNow: '2026-09-06T12:00:00.000Z',
        retentionDays: 90,
        pendingDeletionPhotoIds: [],
        pendingUploads: [],
        days: [
          {
            targetKind: 'source',
            targetId: sourceId,
            programDay: 1,
            physicalMeetingNo: 1,
            happenedAt: '2026-09-05T12:00:00.000Z',
            uploadClosesAt: '2026-09-06T12:00:00.000Z',
            canUpload: true,
            photos: [
              {
                id: photoId,
                signedUrl: 'https://storage.invalid/signed/photo',
                createdAt: '2026-09-05T12:10:00.000Z',
                mine: true,
                expiresIn: 300,
                storagePath: 'continuation-series/raw-path-must-not-cross-client-boundary.jpg',
              },
            ],
          },
        ],
      }),
    /invalid_series_album_payload/,
  )
})

test('pending upload projection rejects private processing metadata', () => {
  assert.throws(
    () =>
      parseContinuationSeriesAlbumPayload({
        seriesId,
        serverNow: '2026-09-06T12:00:00.000Z',
        retentionDays: 90,
        pendingDeletionPhotoIds: [],
        pendingUploads: [
          {
            photoId,
            targetKind: 'source',
            targetId: sourceId,
            leaseExpiresAt: '2026-09-06T12:05:00.000Z',
            canCancel: false,
            storagePath: 'continuation-series/private-path.jpg',
          },
        ],
        days: [],
      }),
    /invalid_series_album_payload/,
  )
})

test('upload target and storage path are UUID-bound and private', () => {
  const target = parseContinuationSeriesAlbumUploadTarget({
    targetKind: 'occurrence',
    targetId: occurrenceId,
    idempotencyKey,
  })

  assert.deepEqual(target, {
    targetKind: 'occurrence',
    targetId: occurrenceId,
    idempotencyKey,
  })
  assert.equal(
    buildContinuationSeriesAlbumPath(seriesId, target.targetKind, target.targetId, photoId),
    `continuation-series/${seriesId}/occurrence/${occurrenceId}/${photoId}.jpg`,
  )
  assert.throws(
    () => buildContinuationSeriesAlbumPath('../series', 'occurrence', occurrenceId, photoId),
    /invalid_series_album_path/,
  )
  assert.equal(CONTINUATION_SERIES_ALBUM_MAX_BYTES, 12 * 1024 * 1024)
  assert.equal(CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES, 12 * 1024 * 1024 + 256 * 1024)
  assert.equal(CONTINUATION_SERIES_ALBUM_SIGNED_URL_TTL_SECONDS, 300)
})

test('multipart reader enforces the observed stream size even when content-length lies', async () => {
  const request = new Request('http://localhost/album', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=series-album-test',
      'Content-Length': '1',
    },
    body: new Uint8Array(CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES + 1),
  })
  await assert.rejects(
    () => readStrictContinuationSeriesAlbumForm(request),
    (error) => error instanceof ContinuationSeriesAlbumFormError && error.status === 413,
  )
})

test('multipart reader accepts only the four bounded album fields', async () => {
  const form = new FormData()
  form.set('targetKind', 'source')
  form.set('targetId', sourceId)
  form.set('idempotencyKey', idempotencyKey)
  form.set('photo', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' }))
  const parsed = await readStrictContinuationSeriesAlbumForm(new Request('http://localhost/album', {
    method: 'POST',
    body: form,
  }))
  assert.equal(parsed.get('targetKind'), 'source')
  assert.equal(parsed.getAll('photo').length, 1)
})

test('album API reuses protected image processing and never exposes public URLs', () => {
  const albumRoute = readFileSync(
    join(workspaceRoot, 'app/api/match/series/[seriesId]/album/route.ts'),
    'utf8',
  )
  const deleteRoute = readFileSync(
    join(workspaceRoot, 'app/api/match/series/[seriesId]/album/[photoId]/route.ts'),
    'utf8',
  )
  const multipart = readFileSync(
    join(workspaceRoot, 'lib/matching/continuation-series-album-multipart.ts'),
    'utf8',
  )

  assert.match(albumRoute, /requireRequestAccess/)
  assert.match(albumRoute, /assertTrustedMutationOrigin/)
  assert.match(albumRoute, /assertMeetingEvidenceImageSignature/)
  assert.match(albumRoute, /sanitizeMeetingEvidenceImage/)
  assert.match(albumRoute, /createSignedUrl/)
  assert.match(multipart, /request\.body\?\.getReader\(\)/)
  assert.match(multipart, /413/)
  assert.match(albumRoute, /get_continuation_series_album_upload_target_for_service/)
  assert.match(albumRoute, /cleanup_required === true/)
  assert.match(albumRoute, /finalizeDelete/)
  assert.ok(
    albumRoute.indexOf('get_continuation_series_album_upload_target_for_service')
      < albumRoute.indexOf('sanitizeMeetingEvidenceImage(sourceBytes)'),
    'target authorization must happen before sharp image work',
  )
  assert.doesNotMatch(albumRoute, /getPublicUrl/)
  assert.match(deleteRoute, /assertTrustedMutationOrigin/)
  assert.match(deleteRoute, /reserve_continuation_series_album_delete_for_service/)
  assert.match(deleteRoute, /finalize_continuation_series_album_delete_for_service/)
  assert.match(deleteRoute, /series_album_upload_busy/)
  assert.match(deleteRoute, /not_ready.*409/)
})

test('forward-only SQL keeps the album optional, private, bounded, and continuation-native', () => {
  const migrationName = readdirSync(join(workspaceRoot, 'supabase/migrations')).find((name) =>
    name.endsWith('_continuation_series_album.sql'),
  )
  assert.ok(migrationName, 'series album migration should exist')
  const sql = readFileSync(join(workspaceRoot, 'supabase/migrations', migrationName), 'utf8')

  assert.match(sql, /quantum_continuation_album_photos/)
  assert.match(sql, /quantum_continuation_series/)
  assert.match(sql, /quantum_continuation_occurrences/)
  assert.match(sql, /quantum_continuation_source_members/)
  assert.match(sql, /attendance_status\s*=\s*'present'/)
  assert.match(sql, /visible_from_program_day/)
  assert.match(sql, /activity_kind\s*=\s*'board_game'/)
  assert.match(sql, /source_completed_at/)
  assert.match(sql, /interval\s+'24 hours'/)
  assert.match(sql, /delete_pending/)
  assert.match(sql, /retention_until/)
  assert.match(sql, /pending_deletion_photo_ids/)
  assert.match(sql, /pending_uploads/)
  assert.match(sql, /processing_lease_expires_at\s*>\s*pg_catalog\.clock_timestamp\(\)/)
  assert.match(sql, /cleanup_required/)
  assert.match(sql, /count\(\*\)[\s\S]*10/i)
  assert.match(sql, /count\(\*\)[\s\S]*50/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all .* authenticated/i)
  assert.doesNotMatch(sql, /mission/i)
  assert.doesNotMatch(sql, /update\s+public\.quantum_continuation_occurrence_members/i)
})

test('series experience connects the album without coupling it to progression', () => {
  const experience = readFileSync(
    join(workspaceRoot, 'components/matching/FiveMeetingSeriesExperience.tsx'),
    'utf8',
  )
  const component = readFileSync(
    join(workspaceRoot, 'components/matching/ContinuationSeriesAlbum.tsx'),
    'utf8',
  )

  assert.match(experience, /ContinuationSeriesAlbum/)
  assert.match(component, /선택 기능/)
  assert.match(component, /불참|진행.*영향.*없/)
  assert.match(component, /프로그램 Day/)
  assert.match(component, /삭제 마저 처리/)
  assert.match(component, /미완료 업로드 정리/)
  assert.match(component, /삭제 상태를 확인하지 못했어요/)
  assert.match(component, /visibilitychange/)
  assert.match(component, /loadSequence/)
  assert.doesNotMatch(component, /미션|필수 인증/)
})

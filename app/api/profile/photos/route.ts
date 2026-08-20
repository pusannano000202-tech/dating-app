import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

import { isOwnedAppearanceStoragePath } from '@/lib/profile/appearance-score-storage'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const STORAGE_BUCKET = 'photos'
const SIGNED_URL_TTL_SECONDS = 5 * 60
const MAX_PHOTO_COUNT = 3
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

type StoredPhoto = { storage_path: string; sort_order: number }

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) return jsonError('unauthorized', 401)

  const { supabase, userId } = auth
  const storedPhotos = await readStoredPhotos(supabase, userId)
  if (!storedPhotos.ok) return jsonError(storedPhotos.error, storedPhotos.status)

  return signedPhotoResponse(supabase, storedPhotos.photos)
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) return jsonError('unauthorized', 401)
  const admin = createSupabaseAdminClient()
  if (!admin) return jsonError('photo_service_unavailable', 503)

  const { supabase, userId } = auth
  const storedPhotos = await readStoredPhotos(supabase, userId)
  if (!storedPhotos.ok) return jsonError(storedPhotos.error, storedPhotos.status)
  if (storedPhotos.photos.length === 0) return jsonError('photo_required', 409)

  const completed = await markProfileComplete(admin, userId)
  if (!completed.ok) return jsonError(completed.error, completed.status)
  return NextResponse.json({ ok: true })
}

export async function PUT(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) return jsonError('unauthorized', 401)
  const admin = createSupabaseAdminClient()
  if (!admin) return jsonError('photo_service_unavailable', 503)

  const { supabase, userId } = auth
  const files = await readPhotoFiles(request)
  if (!files.ok) return jsonError(files.error, files.status)

  const storedPhotos = await readStoredPhotos(supabase, userId)
  if (!storedPhotos.ok) return jsonError(storedPhotos.error, storedPhotos.status)

  const uploadedPaths: string[] = []
  for (const [index, file] of files.files.entries()) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      await cleanupStorage(admin, uploadedPaths)
      return jsonError('photo_type_invalid', 400)
    }
    let sanitizedPhoto: Buffer
    try {
      sanitizedPhoto = await sanitizeProfilePhoto(file)
    } catch {
      await cleanupStorage(admin, uploadedPaths)
      return jsonError('photo_content_invalid', 415)
    }
    const storagePath = `${userId}/${randomUUID()}-${index}.jpg`
    if (!isOwnedAppearanceStoragePath(storagePath, userId)) {
      await cleanupStorage(admin, uploadedPaths)
      return jsonError('photo_path_invalid', 400)
    }

    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, sanitizedPhoto, {
        contentType: 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      await cleanupStorage(admin, uploadedPaths)
      return jsonError('photo_upload_failed', 503)
    }
    uploadedPaths.push(storagePath)
  }

  const { error: deleteError } = await admin
    .from('photos')
    .delete()
    .eq('user_id', userId)
  if (deleteError) {
    await cleanupStorage(admin, uploadedPaths)
    return jsonError('photo_replace_failed', 503)
  }

  const nextRows = uploadedPaths.map((storagePath, index) => ({
    user_id: userId,
    storage_path: storagePath,
    sort_order: index,
  }))
  const { error: insertError } = await admin.from('photos').insert(nextRows)
  if (insertError) {
    const rollbackRows = storedPhotos.photos.map((photo) => ({
      user_id: userId,
      storage_path: photo.storage_path,
      sort_order: photo.sort_order,
    }))
    const rollback = rollbackRows.length > 0
      ? await admin.from('photos').insert(rollbackRows)
      : { error: null }
    await cleanupStorage(admin, uploadedPaths)
    return jsonError(rollback.error ? 'photo_replace_rollback_failed' : 'photo_replace_failed', 503)
  }

  const completed = await markProfileComplete(admin, userId)
  if (!completed.ok) {
    const rollbackRows = storedPhotos.photos.map((photo) => ({
      user_id: userId,
      storage_path: photo.storage_path,
      sort_order: photo.sort_order,
    }))
    await admin.from('photos').delete().eq('user_id', userId)
    const rollback = rollbackRows.length > 0
      ? await admin.from('photos').insert(rollbackRows)
      : { error: null }
    await cleanupStorage(admin, uploadedPaths)
    return jsonError(rollback.error ? 'photo_replace_rollback_failed' : completed.error, completed.status)
  }

  const oldPaths = storedPhotos.photos.map((photo) => photo.storage_path)
  const cleanupError = await cleanupStorage(admin, oldPaths)
  if (cleanupError) return jsonError('photo_storage_cleanup_failed', 503)
  return signedPhotoResponse(supabase, nextRows)
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) return jsonError('unauthorized', 401)
  const admin = createSupabaseAdminClient()
  if (!admin) return jsonError('photo_service_unavailable', 503)

  const { supabase, userId } = auth
  const deleteRequest = await readDeleteRequest(request)
  if (!deleteRequest) {
    return jsonError('photo_path_invalid', 400)
  }

  if (deleteRequest.all) {
    const storedPhotos = await readStoredPhotos(supabase, userId)
    if (!storedPhotos.ok) return jsonError(storedPhotos.error, storedPhotos.status)

    const { error: deleteAllError } = await admin.from('photos').delete().eq('user_id', userId)
    if (deleteAllError) return jsonError('photo_delete_failed', 503)
    const cleanupError = await cleanupStorage(admin, storedPhotos.photos.map((photo) => photo.storage_path))
    if (cleanupError) return jsonError('photo_storage_cleanup_failed', 503)
    return new NextResponse(null, { status: 204 })
  }

  const storagePath = deleteRequest.storagePath
  if (!isOwnedAppearanceStoragePath(storagePath, userId)) return jsonError('photo_path_invalid', 400)

  const { data: ownedPhoto, error: readError } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('storage_path', storagePath)
    .maybeSingle()
  if (readError) return jsonError('photo_read_failed', 503)
  if (!ownedPhoto) return jsonError('photo_not_found', 404)

  const { data: deletedPhoto, error: deleteError } = await admin
    .from('photos')
    .delete()
    .eq('user_id', userId)
    .eq('storage_path', storagePath)
    .select('storage_path')
    .maybeSingle()
  if (deleteError) return jsonError('photo_delete_failed', 503)
  if (!deletedPhoto) return jsonError('photo_not_found', 404)

  const cleanupError = await cleanupStorage(admin, [storagePath])
  if (cleanupError) return jsonError('photo_storage_cleanup_failed', 503)
  return NextResponse.json({ ok: true })
}

async function authenticate(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null
  return { supabase, userId: user.id }
}

async function readStoredPhotos(
  supabase: ReturnType<typeof createSupabaseRequestClient>,
  userId: string,
): Promise<{ ok: true; photos: StoredPhoto[] } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from('photos')
    .select('storage_path,sort_order')
    .eq('user_id', userId)
    .order('sort_order')
    .limit(MAX_PHOTO_COUNT)
  if (error) return { ok: false, error: 'photo_read_failed', status: 503 }

  const photos = (data ?? []) as StoredPhoto[]
  if (photos.some((photo) => !isOwnedAppearanceStoragePath(photo.storage_path, userId))) {
    return { ok: false, error: 'photo_path_invalid', status: 409 }
  }
  return { ok: true, photos }
}

async function signedPhotoResponse(
  supabase: ReturnType<typeof createSupabaseRequestClient>,
  photos: StoredPhoto[],
) {
  const items = await Promise.all(photos.map(async (photo) => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS)
    return error || !data?.signedUrl ? null : {
      storage_path: photo.storage_path,
      sort_order: photo.sort_order,
      signed_url: data.signedUrl,
    }
  }))
  if (items.some((item) => item === null)) return jsonError('photo_url_failed', 503)

  const safeItems = items.filter((item): item is NonNullable<typeof item> => item !== null)
  return NextResponse.json(
    { photos: safeItems.map((item) => item.signed_url), items: safeItems },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

async function readPhotoFiles(request: NextRequest): Promise<
  { ok: true; files: File[] } | { ok: false; error: string; status: number }
> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return { ok: false, error: 'invalid_request', status: 400 }
  }

  const values = formData.getAll('photos')
  if (values.length < 1 || values.length > MAX_PHOTO_COUNT || values.some((value) => !(value instanceof File))) {
    return { ok: false, error: 'photo_count_invalid', status: 400 }
  }
  const files = values as File[]
  if (files.some((file) => file.size < 1 || file.size > MAX_PHOTO_BYTES)) {
    return { ok: false, error: 'photo_size_invalid', status: 413 }
  }
  if (files.some((file) => !ALLOWED_PHOTO_TYPES.has(file.type))) {
    return { ok: false, error: 'photo_type_invalid', status: 415 }
  }
  for (const file of files) {
    const detectedType = await detectPhotoType(file)
    if (!detectedType || detectedType !== file.type) {
      return { ok: false, error: 'photo_content_invalid', status: 415 }
    }
  }
  return { ok: true, files }
}

async function detectPhotoType(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

async function sanitizeProfilePhoto(file: File): Promise<Buffer> {
  return sharp(Buffer.from(await file.arrayBuffer()), {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

async function readDeleteRequest(request: NextRequest): Promise<
  { all: true } | { all: false; storagePath: string } | null
> {
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object') return null
    if ('all' in value && (value as { all?: unknown }).all === true) return { all: true }
    if (!('storage_path' in value)) return null
    const storagePath = (value as { storage_path?: unknown }).storage_path
    return typeof storagePath === 'string' ? { all: false, storagePath } : null
  } catch {
    return null
  }
}

async function cleanupStorage(
  supabase: Pick<NonNullable<ReturnType<typeof createSupabaseAdminClient>>, 'storage'>,
  paths: string[],
): Promise<unknown | null> {
  if (paths.length === 0) return null
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths)
  return error ?? null
}

async function markProfileComplete(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await admin
    .from('profiles')
    .update({ is_profile_complete: true })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()
  if (error) return { ok: false, error: 'profile_update_failed', status: 503 }
  if (!data) return { ok: false, error: 'profile_record_missing', status: 409 }
  return { ok: true }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdminKey } from '../supabase-admin'
import { getSupabaseUrl } from '../utils'
import { isOwnedAppearanceStoragePath } from './appearance-score-storage'

const STORAGE_BUCKET = 'photos'
const SIGNED_URL_TTL_SECONDS = 5 * 60
const MAX_USERS_PER_REQUEST = 20
const MAX_PHOTOS_PER_USER = 3
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PrivatePhotoSigningFailureCode =
  | 'invalid_request'
  | 'server_unavailable'
  | 'photo_read_failed'
  | 'photo_path_invalid'
  | 'photo_url_failed'

export type PrivatePhotoSigningResult =
  | { ok: true; urlsByUser: Record<string, string[]> }
  | { ok: false; code: PrivatePhotoSigningFailureCode }

export async function signPrivateProfilePhotos(
  requestedUserIds: string[],
  requestedPhotoLimit = 1,
): Promise<PrivatePhotoSigningResult> {
  const userIds = [...new Set(requestedUserIds)]
  const photoLimit = Math.min(Math.max(Math.trunc(requestedPhotoLimit), 1), MAX_PHOTOS_PER_USER)

  if (
    userIds.length > MAX_USERS_PER_REQUEST
    || userIds.some((userId) => !UUID_PATTERN.test(userId))
  ) {
    return { ok: false, code: 'invalid_request' }
  }
  if (userIds.length === 0) return { ok: true, urlsByUser: {} }

  const adminKey = getSupabaseAdminKey()
  const supabaseUrl = getSupabaseUrl()
  if (!adminKey || !supabaseUrl) return { ok: false, code: 'server_unavailable' }

  const service = createClient(supabaseUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const photoReads = await Promise.all(userIds.map(async (userId) => {
    const result = await service
      .from('photos')
      .select('storage_path,sort_order')
      .eq('user_id', userId)
      .order('sort_order')
      .limit(photoLimit)
    return { userId, ...result }
  }))

  if (photoReads.some((read) => read.error)) {
    return { ok: false, code: 'photo_read_failed' }
  }

  const urlsByUser: Record<string, string[]> = {}
  for (const read of photoReads) {
    const userId = read.userId
    const rows = read.data ?? []
    if (rows.some((row) => !isOwnedAppearanceStoragePath(row.storage_path, userId))) {
      return { ok: false, code: 'photo_path_invalid' }
    }

    const signedUrls = await Promise.all(rows.map(async (row) => {
      const storagePath = row.storage_path as string
      const { data, error } = await service.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      return error ? '' : data?.signedUrl ?? ''
    }))
    if (signedUrls.some((url) => !url)) {
      return { ok: false, code: 'photo_url_failed' }
    }
    urlsByUser[userId] = signedUrls
  }

  return { ok: true, urlsByUser }
}

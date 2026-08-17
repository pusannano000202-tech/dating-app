import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdminKey } from '../supabase-admin'
import { getSupabaseUrl } from '../utils'

export const APPEARANCE_SCORE_TABLE = 'private_appearance_scores'
export const APPEARANCE_PHOTO_BUCKET = 'photos'

export function createAppearanceServiceClient() {
  const adminKey = getSupabaseAdminKey()
  const supabaseUrl = getSupabaseUrl()
  if (!adminKey || !supabaseUrl) return null

  return createClient(supabaseUrl, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function isOwnedAppearanceStoragePath(
  storagePath: unknown,
  userId: string,
): storagePath is string {
  if (typeof storagePath !== 'string') return false
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const uuidV4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  return new RegExp(
    `^${escapedUserId}/(?:photo_[0-2]|${uuidV4}-[0-2])\\.(?:jpe?g|png|webp)$`,
    'i',
  ).test(storagePath)
}

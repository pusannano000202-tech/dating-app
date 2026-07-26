import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from './utils'

export type SupabaseAdminKeyStatus =
  | { ok: true; key: string; source: 'secret' | 'legacy' }
  | { ok: false; reason: 'missing' | 'invalid' }

export function getSupabaseAdminKeyStatus(): SupabaseAdminKeyStatus {
  const modernKey = process.env.SUPABASE_SECRET_KEY
  if (modernKey) {
    return isSupabaseSecretKey(modernKey)
      ? { ok: true, key: modernKey, source: 'secret' }
      : { ok: false, reason: 'invalid' }
  }

  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!legacyKey) return { ok: false, reason: 'missing' }

  return isSupabaseJwtWithRole(legacyKey, 'service_role')
    ? { ok: true, key: legacyKey, source: 'legacy' }
    : { ok: false, reason: 'invalid' }
}

export function getSupabaseAdminKey() {
  const status = getSupabaseAdminKeyStatus()
  return status.ok ? status.key : null
}

export function createSupabaseAdminClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseAdminKey()
  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function isSupabaseSecretKey(value: string) {
  return /^sb_secret_[A-Za-z0-9_-]{12,}$/.test(value)
}

function isSupabaseJwtWithRole(value: string, role: string) {
  if (hasUnsafeEnvValueCharacters(value)) return false
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) return false

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown }
    return payload.role === role
  } catch {
    return false
  }
}

function hasUnsafeEnvValueCharacters(value: string) {
  return /\s/.test(value) || /[^\x21-\x7e]/.test(value)
}

/**
 * Returns the configured Supabase project URL.
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
}

/**
 * Returns the browser-safe Supabase API key.
 *
 * Supabase now recommends publishable keys for new projects, while older
 * projects often still expose the legacy anon key. Support both so local and
 * deployed auth can be wired from either dashboard value.
 */
export function getSupabasePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''
  )
}

export function getPublicAppOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim()
  return origin ? origin.replace(/\/+$/, '') : ''
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized.includes('placeholder') ||
    normalized.includes('your-') ||
    normalized.includes('your_')
  )
}

/**
 * Returns a human-readable setup issue when Supabase env vars are missing.
 */
export function getSupabaseConfigIssue(): string | null {
  const url = getSupabaseUrl()
  const publicKey = getSupabasePublicKey()

  if (isPlaceholder(url)) {
    return 'Supabase URL is not configured. Set NEXT_PUBLIC_SUPABASE_URL in .env.local.'
  }

  if (isPlaceholder(publicKey)) {
    return 'Supabase public key is not configured. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  }

  return null
}

/**
 * Returns true when Supabase env vars look like real values (not placeholders).
 * Use this to gate Supabase calls in dev/preview environments.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigIssue() === null
}

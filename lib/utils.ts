/**
 * Returns a human-readable setup issue when Supabase env vars are missing.
 */
export function getSupabaseConfigIssue(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || url.includes('placeholder')) {
    return 'Supabase URL is not configured. Set NEXT_PUBLIC_SUPABASE_URL in .env.local.'
  }

  if (!anonKey || anonKey.includes('placeholder')) {
    return 'Supabase anon key is not configured. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
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

/**
 * Returns true when Supabase env vars look like real values (not placeholders).
 * Use this to gate Supabase calls in dev/preview environments.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
  )
}

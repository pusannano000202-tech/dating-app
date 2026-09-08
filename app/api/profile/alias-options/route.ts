import { NextRequest, NextResponse } from 'next/server'

import {
  generateAliasOptions,
  getAliasSigningSecret,
  issueAliasTicket,
} from '@/lib/profile/alias-options'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const MAX_GENERATION_ROUNDS = 4

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const secret = getAliasSigningSecret()
  const admin = createSupabaseAdminClient()
  if (!secret || !admin) return jsonError('server_unavailable', 503)

  const [minimumResult, claimResult] = await Promise.all([
    supabase.rpc('get_my_minimum_signup'),
    admin
      .from('profile_display_name_claims')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (minimumResult.error || claimResult.error) return jsonError('profile_lookup_failed', 503)

  const companionAlias = firstRow<{ display_name?: unknown }>(minimumResult.data)?.display_name
  const current = typeof companionAlias === 'string' ? companionAlias : claimResult.data?.display_name
  const currentAlias = typeof current === 'string' && current.trim().length <= 20 ? current.trim() : ''
  let options: string[] = []

  for (let round = 0; round < MAX_GENERATION_ROUNDS && options.length < 3; round += 1) {
    const candidates = generateAliasOptions().filter((candidate) => !options.includes(candidate))
    const { data: claimedRows, error: claimedError } = await admin
      .from('profile_display_name_claims')
      .select('display_name, user_id')
      .in('display_name', candidates)
    if (claimedError) return jsonError('alias_options_unavailable', 503)

    const claimedByOther = new Set(
      (claimedRows ?? [])
        .filter((row) => row.user_id !== user.id)
        .map((row) => row.display_name),
    )
    options.push(...candidates.filter((candidate) => !claimedByOther.has(candidate)))
    options = [...new Set(options)].slice(0, 3)
  }

  if (currentAlias && !options.includes(currentAlias)) {
    options = [currentAlias, ...options].slice(0, 3)
  }
  if (options.length !== 3) return jsonError('alias_options_unavailable', 503)

  const ticket = issueAliasTicket({ userId: user.id, options, secret })
  const response = NextResponse.json({ options, ticket })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie, Authorization')
  return response
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return value && typeof value === 'object' ? value as T : null
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}

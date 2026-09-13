import { NextRequest, NextResponse } from 'next/server'

import { parseDailyIdentityResponse } from '@/lib/daily-identity'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)
  const expectedAccount = request.headers.get('X-Expected-Account')
  if (expectedAccount && expectedAccount !== user.id) return jsonError('account_changed', 403)

  const { data, error } = await supabase.rpc('get_my_daily_identity')
  if (error) return jsonError('daily_identity_unavailable', error.code === '42501' ? 403 : 503)
  const parsed = parseDailyIdentityResponse(data)
  if (!parsed) return jsonError('daily_identity_invalid', 503)

  return NextResponse.json({
    local_date: parsed.localDate,
    timezone: parsed.timezone,
    pool_version: parsed.poolVersion,
    tier: parsed.tier,
    character_key: parsed.characterKey,
    display_name: parsed.displayName,
    odds: parsed.odds,
  }, { headers: privateHeaders() })
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateHeaders() })
}

function privateHeaders() {
  return { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' }
}

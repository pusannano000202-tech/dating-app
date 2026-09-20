import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { calendarClient, calendarError, calendarJson } from '@/lib/matching/event-calendar-http'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const [{ data: party, error: partyError }, { data: friends, error: friendError }] = await Promise.all([
    supabase.rpc('get_my_quantum_couple_party'),
    supabase.rpc('get_friend_summaries'),
  ])
  if (partyError) return jsonError(translateError(partyError.message), 503)
  if (friendError) return jsonError('friend_list_failed', 503)

  return NextResponse.json({
    party: party ?? null,
    friends: (friends ?? []).map((friend: Record<string, unknown>) => ({
      user_id: friend.user_id,
      display_name: friend.display_name,
      status: friend.status,
    })),
  }, { headers: privateResponseHeaders() })
}

export async function POST(request: NextRequest) {
  try {
    await calendarClient(request)
    // create_quantum_couple_party had no chosen date/payment binding. Use the calendar endpoint.
    return calendarJson({ error: 'calendar_date_required' }, 400)
  } catch (error) { return calendarError(error) }
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const { data, error } = await supabase.rpc('cancel_quantum_couple_party')
  if (error) {
    const code = translateError(error.message)
    return jsonError(code, errorStatus(code))
  }
  return NextResponse.json(data ?? { cancelled: false }, { headers: privateResponseHeaders() })
}

function translateError(message = '') {
  const known = [
    'authentication_required',
    'invalid_partner',
    'active_friendship_required',
    'active_couple_party_exists',
    'couple_match_locked',
  ]
  return known.find((code) => message.includes(code)) ?? 'couple_party_unavailable'
}

function errorStatus(code: string) {
  if (code === 'authentication_required') return 401
  if (code === 'active_friendship_required') return 403
  if (code === 'active_couple_party_exists' || code === 'couple_match_locked') return 409
  if (code === 'couple_party_unavailable') return 503
  return 400
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateResponseHeaders() })
}

function privateResponseHeaders() {
  return { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' }
}

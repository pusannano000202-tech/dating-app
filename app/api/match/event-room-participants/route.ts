import { NextRequest, NextResponse } from 'next/server'

import { parseQuantumEventRoomParticipants } from '@/lib/matching/quantum-event-rooms'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie, Authorization',
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const { data, error } = await supabase.rpc('get_my_quantum_event_room_participants')
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    const message = error.message?.toLowerCase() ?? ''
    if (message.includes('room_membership_required')) return jsonError('room_membership_required', 403)
    if (message.includes('room_school_mismatch')) return jsonError('room_school_mismatch', 403)
    return jsonError('room_participant_lookup_failed', 500)
  }

  const participants = parseQuantumEventRoomParticipants(data)
  if (!participants) return jsonError('room_participant_response_invalid', 500)

  return NextResponse.json(
    { participants },
    { headers: PRIVATE_NO_STORE_HEADERS },
  )
}

function isSchemaUnavailable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_NO_STORE_HEADERS })
}

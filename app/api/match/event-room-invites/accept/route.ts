import { NextRequest, NextResponse } from 'next/server'

import { isQuantumEventLifecycle } from '@/lib/matching/quantum-event-lifecycle'
import { isQuantumRoomInviteToken } from '@/lib/matching/quantum-event-rooms'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(request)
  const token = isRecord(body) ? body.token : null
  if (!isQuantumRoomInviteToken(token)) return jsonError('invalid_invite', 400)

  const { data, error } = await supabase.rpc('accept_quantum_event_room_invite', {
    p_token: token,
  })
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    const mapped = mapAcceptError(error)
    return jsonError(mapped.error, mapped.status)
  }
  if (!isQuantumEventLifecycle(data)) return jsonError('room_invite_response_invalid', 500)

  return NextResponse.json({ participation: data })
}

function mapAcceptError(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('invite_not_found')) return { error: 'invite_not_found', status: 404 }
  for (const code of [
    'pre_match_card_required',
    'invite_expired',
    'application_closed',
    'active_friendship_required',
    'friend_gender_mismatch',
    'event_state_locked',
    'active_event_conflict',
    'friend_room_full',
  ]) {
    if (message.includes(code)) return { error: code, status: 409 }
  }
  return { error: 'room_invite_accept_failed', status: 500 }
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  return NextResponse.json({ error }, { status })
}

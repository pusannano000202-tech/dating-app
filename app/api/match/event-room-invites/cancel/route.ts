import { NextRequest, NextResponse } from 'next/server'

import { isQuantumRoomInviteToken } from '@/lib/matching/quantum-event-rooms'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(request)
  const token = isRecord(body) ? body.token : null
  if (!isQuantumRoomInviteToken(token)) return jsonError('invalid_invite', 400)

  const { data, error } = await supabase.rpc('cancel_quantum_event_room_invite', {
    p_token: token,
  })
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    const message = error.message?.toLowerCase() ?? ''
    if (message.includes('invite_not_found')) return jsonError('invite_not_found', 404)
    if (message.includes('event_state_locked')) return jsonError('event_state_locked', 409)
    return jsonError('room_invite_cancel_failed', 500)
  }

  return NextResponse.json({ cancelled: data === true })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try { return await request.json() } catch { return null }
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

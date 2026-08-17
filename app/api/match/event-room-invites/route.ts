import { NextRequest, NextResponse } from 'next/server'

import {
  isCreatedQuantumEventRoomInvite,
  parseQuantumEventRoomInviteCandidates,
  parseQuantumEventRoomInvites,
} from '@/lib/matching/quantum-event-rooms'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const [candidateResult, inviteResult] = await Promise.all([
    supabase.rpc('get_quantum_event_room_invite_candidates'),
    supabase.rpc('get_my_quantum_event_room_invites'),
  ])

  const error = candidateResult.error ?? inviteResult.error
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    return jsonError('room_invite_lookup_failed', 500)
  }

  const candidates = parseQuantumEventRoomInviteCandidates(candidateResult.data)
  const invites = parseQuantumEventRoomInvites(inviteResult.data)
  if (!candidates || !invites) return jsonError('room_invite_response_invalid', 500)

  return NextResponse.json(
    { candidates, invites },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(request)
  const invitedUserId = isRecord(body) && typeof body.invited_user_id === 'string'
    ? body.invited_user_id.trim()
    : ''
  if (!UUID_PATTERN.test(invitedUserId)) return jsonError('invalid_friend', 400)

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? ''
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return jsonError('invalid_idempotency_key', 400)
  }

  const { data, error } = await supabase.rpc('create_quantum_event_room_invite', {
    p_invited_user_id: invitedUserId,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    const mapped = mapInviteError(error)
    return jsonError(mapped.error, mapped.status)
  }
  if (!isCreatedQuantumEventRoomInvite(data)) {
    return jsonError('room_invite_response_invalid', 500)
  }

  return NextResponse.json({ invite: data }, { status: 201 })
}

function mapInviteError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  if (error.code === '23505') return { error: 'friend_invite_pending', status: 409 }
  for (const code of [
    'active_solo_room_required',
    'application_closed',
    'active_friendship_required',
    'profile_gender_required',
    'friend_gender_mismatch',
    'friend_school_mismatch',
    'friend_already_participating',
    'friend_invite_pending',
    'friend_room_full',
    'idempotency_conflict',
    'idempotency_replayed_terminal',
  ]) {
    if (message.includes(code)) return { error: code, status: 409 }
  }
  return { error: 'room_invite_create_failed', status: 500 }
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

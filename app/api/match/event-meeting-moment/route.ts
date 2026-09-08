import { NextRequest, NextResponse } from 'next/server'

import { getQuantumEventById } from '@/lib/matching/quantum-event-catalog'
import { parseQuantumMeetingMoment } from '@/lib/matching/quantum-profile-preferences'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const eventKey = request.nextUrl.searchParams.get('event_key')?.trim() ?? ''
  const occurrenceKey = request.nextUrl.searchParams.get('occurrence_key')?.trim() ?? ''
  if (!getQuantumEventById(eventKey) || !UUID_PATTERN.test(occurrenceKey)) {
    return jsonError('invalid_meeting_moment', 400)
  }

  const { data, error } = await supabase.rpc('get_my_quantum_event_meeting_moment', {
    p_event_key: eventKey,
    p_occurrence_key: occurrenceKey,
  })
  if (error) return mapRpcError(error, 'meeting_moment_lookup_failed')
  if (data === null) return json({ meeting_moment: null })

  const meetingMoment = parseQuantumMeetingMoment(data)
  if (!meetingMoment || meetingMoment.occurrenceKey !== occurrenceKey) {
    return jsonError('meeting_moment_response_invalid', 500)
  }
  return json({ meeting_moment: meetingMoment })
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('auth_required', 401)

  const body = await readJson(request)
  const eventKey = isRecord(body) && typeof body.event_key === 'string'
    ? body.event_key.trim()
    : ''
  const meetingMoment = isRecord(body)
    ? parseQuantumMeetingMoment(body.meeting_moment)
    : null
  if (!getQuantumEventById(eventKey)
    || !meetingMoment
    || !UUID_PATTERN.test(meetingMoment.occurrenceKey)) {
    return jsonError('invalid_meeting_moment', 400)
  }

  const { data, error } = await supabase.rpc('save_my_quantum_event_meeting_moment', {
    p_event_key: eventKey,
    p_occurrence_key: meetingMoment.occurrenceKey,
    p_payload: meetingMoment,
  })
  if (error) return mapRpcError(error, 'meeting_moment_save_failed')

  const saved = parseQuantumMeetingMoment(data)
  if (!saved || saved.occurrenceKey !== meetingMoment.occurrenceKey) {
    return jsonError('meeting_moment_response_invalid', 500)
  }
  return json({ meeting_moment: saved })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function mapRpcError(error: { code?: string; message?: string }, fallback: string) {
  if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('invalid_meeting_moment') || message.includes('occurrence_key_mismatch')) {
    return jsonError('invalid_meeting_moment', 400)
  }
  if (message.includes('meeting_moment_not_available')) {
    return jsonError('meeting_moment_not_available', 409)
  }
  return jsonError(fallback, 500)
}

function isSchemaUnavailable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function jsonError(error: string, status: number) {
  return json({ error }, status)
}

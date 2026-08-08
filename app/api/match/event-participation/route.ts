import { NextRequest, NextResponse } from 'next/server'

import {
  isQuantumEventParticipation,
  parseQuantumEventParticipationInput,
} from '@/lib/matching/quantum-event-participation'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ participation: null, availability: 'auth_required' })
  }

  const { data, error } = await supabase.rpc('get_my_quantum_event_participation')
  if (error) {
    if (isSchemaUnavailable(error)) {
      return NextResponse.json({ participation: null, availability: 'schema_unavailable' })
    }
    return jsonError('participation_lookup_failed', 500)
  }

  const participation = isQuantumEventParticipation(data) ? data : null
  return NextResponse.json({ participation, availability: 'ready' })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const parsed = parseQuantumEventParticipationInput(await readJson(request))
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await supabase.rpc('set_my_quantum_event_participation', {
    p_event_id: parsed.value.eventId,
    p_event_mode: parsed.value.eventMode,
    p_party_type: parsed.value.partyType,
  })

  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    return jsonError('participation_save_failed', 500)
  }

  if (!isQuantumEventParticipation(data)) {
    return jsonError('participation_response_invalid', 500)
  }

  return NextResponse.json({ participation: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const { error } = await supabase.rpc('cancel_my_quantum_event_participation')
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    return jsonError('participation_cancel_failed', 500)
  }

  return NextResponse.json({ participation: null })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isSchemaUnavailable(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
  )
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

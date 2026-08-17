import { NextRequest, NextResponse } from 'next/server'

import { quantumEventCatalog, type QuantumEventMode } from '@/lib/matching/quantum-event-catalog'
import { parseQuantumEventRooms } from '@/lib/matching/quantum-event-rooms'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const eventId = request.nextUrl.searchParams.get('event_id')?.trim() ?? ''
  const eventMode = request.nextUrl.searchParams.get('event_mode')
  if (!isCatalogEvent(eventId, eventMode)) return jsonError('invalid_event', 400)

  const { data, error } = await supabase.rpc('list_quantum_event_rooms', {
    p_event_id: eventId,
    p_event_mode: eventMode,
  })
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    return jsonError('room_lookup_failed', 500)
  }

  const rooms = parseQuantumEventRooms(data)
  if (!rooms) return jsonError('room_response_invalid', 500)

  return NextResponse.json(
    { rooms },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function isCatalogEvent(eventId: string, mode: string | null): mode is QuantumEventMode {
  return (mode === 'tonight' || mode === 'scheduled')
    && quantumEventCatalog[mode].some((event) => event.id === eventId)
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

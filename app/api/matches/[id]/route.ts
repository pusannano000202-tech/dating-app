import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { toPublicErrorCode } from '@/lib/api/public-error'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: eventRoute, error: eventRouteError } = await supabase.rpc(
    'get_quantum_event_match_route',
    { p_match_id: params.id },
  )
  if (eventRouteError) {
    return NextResponse.json({ error: 'event_route_lookup_failed' }, { status: 500 })
  }
  if (eventRoute !== null) {
    if (!isEventRoute(eventRoute)) {
      return NextResponse.json({ error: 'event_route_invalid' }, { status: 500 })
    }
    const party = eventRoute.party_type === 'friends' ? 'friends' : 'solo'
    return NextResponse.json({
      error: 'event_match_profiles_private',
      redirect_to: `/match/events/${encodeURIComponent(eventRoute.event_id)}?party=${party}`,
    }, { status: 409 })
  }

  const { data, error } = await supabase
    .rpc('get_match_detail', { p_match_id: params.id })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: toPublicErrorCode(error.message, 'detail_failed') }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  }

  return NextResponse.json({ match: data })
}

function isEventRoute(value: unknown): value is { event_id: string; party_type: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.event_id === 'string' && record.event_id.trim().length > 0
    && (record.party_type === null || record.party_type === 'solo' || record.party_type === 'friends')
}

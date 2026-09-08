import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Legacy DTO compatibility only. The current RPC is a stable read: it never
// writes connection consent and always returns phone/reveal fields as null.
// Ongoing contact moves to match chat, then accepted-friend messaging.
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
    return NextResponse.json({ error: 'event_match_contact_hidden' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('get_match_connections', { p_match_id: params.id })
  if (error) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 400 })
  }
  return NextResponse.json({ connections: data ?? [] })
}

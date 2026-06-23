import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const lat = typeof body.lat === 'number' ? body.lat : null
  const lng = typeof body.lng === 'number' ? body.lng : null
  if (lat === null || lng === null) {
    return NextResponse.json({ error: 'gps_required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('checkin_attendance', { p_match_id: params.id, p_lat: lat, p_lng: lng })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'checkin_failed' }, { status: 400 })
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .rpc('get_match_daily_cards', { p_match_id: params.id })

  if (error) {
    return NextResponse.json({ error: error.message || 'daily_cards_failed' }, { status: 400 })
  }

  return NextResponse.json({ cards: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { selected_slot?: number }
  const selectedSlot = Number.isInteger(body.selected_slot)
    ? Math.max(1, Math.min(5, Number(body.selected_slot)))
    : null

  const { data, error } = await supabase
    .rpc('pick_match_daily_card', {
      p_match_id: params.id,
      p_selection_slot: selectedSlot,
    })

  if (error) {
    return NextResponse.json({ error: error.message || 'daily_card_pick_failed' }, { status: 400 })
  }

  return NextResponse.json({ card: Array.isArray(data) ? data[0] ?? null : data })
}

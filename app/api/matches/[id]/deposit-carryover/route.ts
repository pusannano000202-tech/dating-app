import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const current = await supabase
    .from('deposit_carryovers')
    .select('id,status,source_match_id,target_match_id,created_at,applied_at')
    .eq('user_id', user.id)
    .eq('source_match_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (current.error) {
    return NextResponse.json({ error: 'carryover_lookup_failed' }, { status: 500 })
  }
  return NextResponse.json({ carryover: current.data ?? null })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const carried = await supabase
    .rpc('choose_deposit_carryover', { p_match_id: params.id })
    .maybeSingle()

  if (carried.error) {
    const error = translateCarryoverError(carried.error.message)
    const status = error === 'match_not_found' ? 404 : 400
    return NextResponse.json({ error }, { status })
  }
  if (!carried.data) {
    return NextResponse.json({ error: 'carryover_create_failed' }, { status: 500 })
  }

  return NextResponse.json({
    status: 'available',
    carryover: carried.data,
  })
}

function translateCarryoverError(message = '') {
  const known = [
    'not_authenticated',
    'match_not_found',
    'match_not_completed',
    'not_match_participant',
    'no_show_cannot_carryover',
    'deposit_not_available_for_carryover',
    'deposit_amount_not_carryable',
    'refund_already_requested',
    'carryover_already_available',
  ]
  return known.find((code) => message.includes(code)) ?? 'carryover_create_failed'
}

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface SummaryRow {
  user_id: string
  display_name: string | null
  role: string
  deposit_status: string
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('get_group_deposit_summary', { p_group_id: groupId })

  if (error) {
    return NextResponse.json({ error: error.message || 'summary_failed' }, { status: 400 })
  }

  const rows = (data ?? []) as SummaryRow[]
  const totalActive = rows.length
  const paidCount = rows.filter((r) => r.deposit_status === 'paid' || r.deposit_status === 'held').length

  return NextResponse.json({
    rows,
    total_active: totalActive,
    paid_count: paidCount,
    all_paid: totalActive > 0 && paidCount === totalActive,
  })
}

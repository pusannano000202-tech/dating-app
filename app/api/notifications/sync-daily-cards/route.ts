import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('notify_available_daily_cards', {
    p_match_id: null,
  })

  if (error) {
    return NextResponse.json(
      { error: 'daily_card_notification_sync_failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ inserted: Number(data ?? 0) })
}

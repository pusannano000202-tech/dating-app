import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))
  const unreadOnly = url.searchParams.get('unread') === 'true'

  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: limit,
    p_unread_only: unreadOnly,
  })
  if (error) {
    return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  }
  return NextResponse.json({ notifications: data ?? [] })
}

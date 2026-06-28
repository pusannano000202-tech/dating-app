import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// POST /api/notifications/read
// body: { notification_id: string } → 개별 읽음
// body: {} (or { all: true }) → 전체 읽음
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const notificationId = typeof body.notification_id === 'string' ? body.notification_id : null

  if (notificationId) {
    const { data, error } = await supabase
      .rpc('mark_notification_read', { p_notification_id: notificationId })
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message || 'mark_read_failed' }, { status: 400 })
    }
    return NextResponse.json({ ok: data === true })
  }

  const { data, error } = await supabase.rpc('mark_all_notifications_read').maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message || 'mark_all_failed' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, updated: data ?? 0 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

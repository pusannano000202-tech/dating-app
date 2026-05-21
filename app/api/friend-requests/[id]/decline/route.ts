import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 수신자가 status='declined' 로 update. guard_friend_requests_update trigger 가 검증.
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined' })
    .eq('id', params.id)
    .eq('receiver_user_id', user.id)
    .select('id,status')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'decline_failed' }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: 'request_not_found_or_not_receiver' }, { status: 404 })
  }

  return NextResponse.json({ request: data })
}

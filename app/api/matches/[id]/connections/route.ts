import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// 핸드폰 자동공개 정책 (z36 / 결정 8-18):
// 매칭 status='confirmed' 이후 약속 시간(match_meetings.scheduled_start) 도달 시
// 양쪽 그룹 멤버의 phone 이 자동 공개된다. 사용자 측 동의/취소 UI 없음.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_match_connections', { p_match_id: params.id })
  if (error) {
    return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  }
  return NextResponse.json({ connections: data ?? [] })
}

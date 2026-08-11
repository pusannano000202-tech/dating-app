import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json(
    {
      error: 'no_show_review_required',
      message: '노쇼 처리는 참석 증거를 확인한 뒤 진행돼요.',
      match_id: params.id,
    },
    { status: 409 },
  )
}

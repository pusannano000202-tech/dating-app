import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// 운영자가 수동으로 리뷰 대기 매칭을 생성 (배치 러너 없이 콘솔 테스트/긴급 매칭용).
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const groupA = typeof body.group_a === 'string' ? body.group_a : null
  const groupB = typeof body.group_b === 'string' ? body.group_b : null
  if (!groupA || !groupB) return NextResponse.json({ error: 'invalid_groups' }, { status: 400 })

  const { data, error } = await supabase.rpc('admin_create_pending_match', {
    p_group_a: groupA,
    p_group_b: groupB,
    p_score: typeof body.score === 'number' ? body.score : null,
    p_breakdown: body.breakdown ?? null,
    p_is_forced: body.is_forced === true,
  })
  if (error) return NextResponse.json({ error: error.message || 'create_failed' }, { status: 400 })
  return NextResponse.json({ match_id: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

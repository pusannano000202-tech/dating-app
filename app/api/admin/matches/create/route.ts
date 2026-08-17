import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  createPrivatePendingMatch,
  type PrivateMatchRpcClient,
} from '@/lib/matching/private-match-orchestrator'

// 운영자가 수동으로 리뷰 대기 매칭을 생성 (배치 러너 없이 콘솔 테스트/긴급 매칭용).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', {
    p_user_id: user.id,
  })
  if (adminError || isAdmin !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await readJson(req)
  const groupA = typeof body.group_a === 'string' ? body.group_a : null
  const groupB = typeof body.group_b === 'string' ? body.group_b : null
  if (!groupA || !groupB || !isUuid(groupA) || !isUuid(groupB) || groupA === groupB) {
    return NextResponse.json({ error: 'invalid_groups' }, { status: 400 })
  }

  const adminClient = createSupabaseAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'admin_service_unavailable' }, { status: 503 })
  }

  const result = await createPrivatePendingMatch(
    adminClient as unknown as PrivateMatchRpcClient,
    {
      groupAId: groupA,
      groupBId: groupB,
      isForced: body.is_forced === true,
    },
  )
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: statusForPrivateMatchFailure(result.reason) },
    )
  }

  return NextResponse.json({ match_id: result.matchId })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function statusForPrivateMatchFailure(reason: string): number {
  if (reason === 'invalid_group_ids') return 400
  if (reason === 'query_failed' || reason === 'create_failed' || reason === 'invalid_match_id') {
    return 502
  }
  return 409
}

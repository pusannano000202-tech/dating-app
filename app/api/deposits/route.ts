import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  buildDepositPaymentRequestDraft,
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'

interface DepositRow {
  id: string
  user_id: string
  group_id: string
  amount: number
  status: string
  paid_at: string | null
  created_at: string
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

  // RLS: deposits_self → 본인 row 만 조회 가능. 그룹 전체 결제 현황은 별도 RPC 필요.
  // v1 단순화: 본인 deposit 만 조회 + 그룹 전체 결제 카운트는 enter_match_pool 검증으로 위임.
  const { data, error } = await supabase
    .from('deposits')
    .select('id,user_id,group_id,amount,status,paid_at,created_at')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .in('status', ['paid', 'held', 'pending'])
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'deposit_lookup_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as DepositRow[]
  return NextResponse.json({
    my_deposit: rows[0] ?? null,
    amount: DEPOSIT_AMOUNT,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const groupId = typeof body.group_id === 'string' ? body.group_id : ''
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }

  const provider = resolveDepositPaymentProvider(body.provider)
  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({
      error: readiness.error,
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider !== 'mock') {
    return NextResponse.json({
      status: 'external_checkout_required',
      provider,
      payment: buildDepositPaymentRequestDraft({
        provider,
        groupId,
        userId: user.id,
        origin: req.nextUrl.origin,
      }),
    }, { status: 202 })
  }

  // 로컬/검토용 mock 결제: 실제 결제사 호출 없이 보증금 paid 상태만 만든다.
  const { data, error } = await supabase
    .rpc('mock_pay_deposit', { p_group_id: groupId, p_amount: DEPOSIT_AMOUNT })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'pay_failed' }, { status: 400 })
  }

  return NextResponse.json({ provider, deposit: data }, { status: 201 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

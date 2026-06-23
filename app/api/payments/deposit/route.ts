import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  buildDepositPaymentRequestDraft,
  buildDepositCustomerKey,
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getPublicAppOrigin } from '@/lib/utils'

interface DepositPaymentRow {
  id: string
  status: string
  toss_order_id: string | null
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
  const matchId = typeof body.match_id === 'string' ? body.match_id : ''
  if (!matchId) {
    return NextResponse.json({ error: 'match_id_required' }, { status: 400 })
  }

  const matchContext = await validateDepositMatchContext(supabase, {
    matchId,
    groupId,
    userId: user.id,
  })
  if (!matchContext.ok) {
    return matchContext.response
  }

  const provider = resolveDepositPaymentProvider(body.provider)
  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({
      error: readiness.error,
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider === 'mock') {
    const { data, error } = await supabase
      .rpc('mock_pay_deposit', { p_group_id: groupId, p_amount: DEPOSIT_AMOUNT })
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message || 'pay_failed' }, { status: 400 })
    }

    return NextResponse.json({ provider, status: 'paid', deposit: data }, { status: 201 })
  }

  const activeDeposit = await supabase
    .from('deposits')
    .select('id,status,toss_order_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .in('status', ['pending', 'paid', 'held'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeDeposit.error) {
    return NextResponse.json({ error: 'deposit_lookup_failed' }, { status: 500 })
  }

  if (activeDeposit.data?.status === 'paid' || activeDeposit.data?.status === 'held') {
    return NextResponse.json({
      provider,
      status: activeDeposit.data.status,
      deposit: activeDeposit.data,
    }, { status: 200 })
  }

  const pendingOrderId = (activeDeposit.data as DepositPaymentRow | null)?.toss_order_id ?? undefined
  const payment = buildDepositPaymentRequestDraft({
    provider,
    groupId,
    matchId,
    userId: user.id,
    origin: getPublicAppOrigin() || req.nextUrl.origin,
    orderId: pendingOrderId,
    returnPath: typeof body.return_path === 'string' ? body.return_path : undefined,
  })

  let deposit = activeDeposit.data as DepositPaymentRow | null
  if (!deposit) {
    const created = await supabase
      .from('deposits')
      .insert({
        user_id: user.id,
        group_id: groupId,
        amount: DEPOSIT_AMOUNT,
        status: 'pending',
        toss_order_id: payment.orderId,
      })
      .select('id,status,toss_order_id')
      .maybeSingle()

    if (created.error || !created.data) {
      return NextResponse.json({ error: created.error?.message || 'deposit_create_failed' }, { status: 400 })
    }

    deposit = created.data as DepositPaymentRow
  } else if (!deposit.toss_order_id) {
    const updated = await supabase
      .from('deposits')
      .update({ toss_order_id: payment.orderId })
      .eq('id', deposit.id)
      .select('id,status,toss_order_id')
      .maybeSingle()

    if (updated.error || !updated.data) {
      return NextResponse.json({ error: updated.error?.message || 'deposit_order_attach_failed' }, { status: 400 })
    }

    deposit = updated.data as DepositPaymentRow
  }

  return NextResponse.json({
    provider,
    status: 'checkout_ready',
    deposit,
    payment: {
      ...payment,
      provider: 'toss',
      clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
      method: 'CARD',
      customerKey: buildDepositCustomerKey(user.id),
    },
  }, { status: 202 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

type DepositMatchValidation =
  | { ok: true }
  | { ok: false; response: NextResponse }

interface DepositMatchRow {
  id: string
  status: string
  group_a_id: string
  group_b_id: string
}

async function validateDepositMatchContext(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  params: { matchId: string; groupId: string; userId: string },
): Promise<DepositMatchValidation> {
  const matchLookup = await supabase
    .from('matches')
    .select('id,status,group_a_id,group_b_id')
    .eq('id', params.matchId)
    .maybeSingle()

  if (matchLookup.error) {
    return { ok: false, response: NextResponse.json({ error: 'match_lookup_failed' }, { status: 500 }) }
  }

  const match = matchLookup.data as DepositMatchRow | null
  if (!match) {
    return { ok: false, response: NextResponse.json({ error: 'match_not_found' }, { status: 404 }) }
  }

  if (match.status !== 'pending' && match.status !== 'confirmed') {
    return { ok: false, response: NextResponse.json({ error: 'match_not_payable' }, { status: 400 }) }
  }

  if (match.group_a_id !== params.groupId && match.group_b_id !== params.groupId) {
    return { ok: false, response: NextResponse.json({ error: 'group_not_in_match' }, { status: 403 }) }
  }

  const membership = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', params.groupId)
    .eq('user_id', params.userId)
    .is('left_at', null)
    .maybeSingle()

  if (membership.error || !membership.data) {
    return { ok: false, response: NextResponse.json({ error: 'not_group_member' }, { status: 403 }) }
  }

  return { ok: true }
}

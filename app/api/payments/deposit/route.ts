import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  buildDepositPaymentRequestDraft,
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { createTossPaymentWindow, TossPaymentError } from '@/lib/payments/toss'
import { createSupabaseServerClient } from '@/lib/supabase-server'

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

  const membership = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle()

  if (membership.error || !membership.data) {
    return NextResponse.json({ error: 'not_group_member' }, { status: 403 })
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
    userId: user.id,
    origin: req.nextUrl.origin,
    orderId: pendingOrderId,
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

  try {
    const tossPayment = await createTossPaymentWindow({
      amount: payment.amount,
      orderId: payment.orderId,
      orderName: payment.orderName,
      successUrl: payment.successUrl,
      failUrl: payment.failUrl,
      idempotencyKey: payment.orderId,
    })

    return NextResponse.json({
      provider,
      status: 'checkout_ready',
      deposit,
      payment: {
        ...payment,
        checkoutUrl: tossPayment.checkout?.url ?? null,
      },
    }, { status: 202 })
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return NextResponse.json({
        error: error.code,
        provider,
        status: 'checkout_failed',
      }, { status: error.status })
    }

    return NextResponse.json({ error: 'checkout_failed', provider }, { status: 502 })
  }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

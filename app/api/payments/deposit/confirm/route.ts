import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  isDepositOrderIdForContext,
  isDepositPaymentAmountValid,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { confirmTossPayment, TossPaymentError } from '@/lib/payments/toss'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface DepositPaymentRow {
  id: string
  status: string
  toss_order_id: string | null
  toss_payment_key: string | null
}

export async function POST(req: NextRequest) {
  return confirmDeposit(req)
}

export async function GET(req: NextRequest) {
  return confirmDeposit(req)
}

async function confirmDeposit(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = req.method === 'POST' ? await readJson(req) : {}
  const groupId = readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? ''
  const provider = resolveDepositPaymentProvider(readString(body.provider) ?? req.nextUrl.searchParams.get('provider'))
  const amount = readNumber(body.amount) ?? Number(req.nextUrl.searchParams.get('amount') ?? DEPOSIT_AMOUNT)
  const paymentKey = readString(body.paymentKey) ?? readString(body.payment_key) ?? req.nextUrl.searchParams.get('paymentKey') ?? ''
  const orderId = readString(body.orderId) ?? readString(body.order_id) ?? req.nextUrl.searchParams.get('orderId') ?? ''

  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }
  if (!isDepositPaymentAmountValid(amount)) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }

  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({
      error: readiness.error,
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider !== 'mock') {
    if (!paymentKey || !orderId) {
      return NextResponse.json({ error: 'payment_key_and_order_id_required' }, { status: 400 })
    }
    if (!isDepositOrderIdForContext(orderId, groupId, user.id)) {
      return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 })
    }

    const depositLookup = await supabase
      .from('deposits')
      .select('id,status,toss_order_id,toss_payment_key')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('toss_order_id', orderId)
      .in('status', ['pending', 'paid', 'held'])
      .maybeSingle()

    if (depositLookup.error) {
      return NextResponse.json({ error: 'deposit_lookup_failed' }, { status: 500 })
    }
    if (!depositLookup.data) {
      return NextResponse.json({ error: 'deposit_order_not_found' }, { status: 404 })
    }

    const deposit = depositLookup.data as DepositPaymentRow
    if (deposit.status === 'paid' || deposit.status === 'held') {
      return NextResponse.json({
        provider,
        status: deposit.status,
        deposit,
      }, { status: 200 })
    }

    try {
      const payment = await confirmTossPayment({
        paymentKey,
        orderId,
        amount,
        idempotencyKey: `deposit_confirm_${orderId}`,
      })

      if (payment.orderId !== orderId || payment.totalAmount !== DEPOSIT_AMOUNT || payment.status !== 'DONE') {
        return NextResponse.json({ error: 'payment_verification_failed' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('deposits')
        .update({
          status: 'paid',
          toss_payment_key: payment.paymentKey,
          paid_at: payment.approvedAt ?? new Date().toISOString(),
        })
        .eq('id', deposit.id)
        .select('id,status,toss_order_id,toss_payment_key,paid_at')
        .maybeSingle()

      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'deposit_update_failed' }, { status: 400 })
      }

      return NextResponse.json({
        provider,
        status: 'paid',
        deposit: data,
        payment: {
          paymentKey: payment.paymentKey,
          orderId: payment.orderId,
          status: payment.status,
          method: payment.method ?? null,
        },
      }, { status: 201 })
    } catch (error) {
      if (error instanceof TossPaymentError) {
        return NextResponse.json({
          error: error.code,
          provider,
          status: 'confirm_failed',
        }, { status: error.status })
      }

      return NextResponse.json({ error: 'confirm_failed', provider }, { status: 502 })
    }
  }

  const { data, error } = await supabase
    .rpc('mock_pay_deposit', { p_group_id: groupId, p_amount: DEPOSIT_AMOUNT })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'pay_failed' }, { status: 400 })
  }

  return NextResponse.json({ provider, status: 'paid', deposit: data }, { status: 201 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return null
}

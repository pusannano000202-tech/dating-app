import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  normalizeDepositReturnPath,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { cancelTossPayment, TossPaymentError } from '@/lib/payments/toss'
import { getSupabaseAdminKey } from '@/lib/supabase-admin'
import { getPublicAppOrigin, getSupabaseUrl } from '@/lib/utils'

interface DepositCancellationRow {
  id: string
  match_id: string
  group_id: string
  user_id: string
  status: string
  amount: number
  toss_order_id: string | null
  toss_payment_key: string | null
  refunded_amount: number | null
  retained_amount: number | null
  refunded_at: string | null
  notes: string | null
}

export async function GET(req: NextRequest) {
  const result = readCancelResult(req)
  const target = new URL(
    normalizeDepositReturnPath(req.nextUrl.searchParams.get('return_path')),
    getPublicAppOrigin() || req.nextUrl.origin,
  )
  target.searchParams.set('payment', 'cancelled')
  target.searchParams.set('provider', result.provider)
  if (result.groupId) {
    target.searchParams.set('group_id', result.groupId)
  }
  if (result.reason) {
    target.searchParams.set('reason', result.reason)
  }

  return NextResponse.redirect(target)
}

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const result = readCancelResult(req, body)

  const paymentKey = readString(body.paymentKey) ?? readString(body.payment_key)
  if (paymentKey) {
    return cancelPaidDeposit(req, body, result.provider, paymentKey)
  }

  return NextResponse.json({
    provider: result.provider,
    status: 'payment_cancelled',
    group_id: result.groupId,
    reason: result.reason,
    provider_ready: result.providerReady,
  })
}

async function cancelPaidDeposit(
  req: NextRequest,
  body: Record<string, unknown>,
  provider: ReturnType<typeof resolveDepositPaymentProvider>,
  paymentKey: string,
) {
  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({ error: readiness.error, provider }, { status: 503 })
  }

  const internalSecret = process.env.PAYMENT_INTERNAL_SECRET
  if (!internalSecret) {
    return NextResponse.json({ error: 'payment_internal_secret_not_configured' }, { status: 503 })
  }

  const providedSecret = req.headers.get('x-payment-internal-secret')
    ?? readBearerToken(req.headers.get('authorization'))
  if (providedSecret !== internalSecret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const serviceRoleKey = getSupabaseAdminKey()
  const supabaseUrl = getSupabaseUrl()
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'server_key_not_configured' }, { status: 503 })
  }

  const cancelAmount = readNumber(body.cancelAmount) ?? readNumber(body.cancel_amount)
  if (typeof cancelAmount === 'number' && (!Number.isInteger(cancelAmount) || cancelAmount < 1 || cancelAmount > DEPOSIT_AMOUNT)) {
    return NextResponse.json({ error: 'invalid_cancel_amount' }, { status: 400 })
  }

  const cancelReason = readString(body.cancelReason)
    ?? readString(body.cancel_reason)
    ?? '정상 만남 후 보증금 환불'

  if (provider !== 'toss') {
    return NextResponse.json({ error: 'unsupported_cancel_provider', provider }, { status: 400 })
  }

  const depositId = readString(body.deposit_id) ?? readString(body.depositId)
  const matchId = readString(body.match_id) ?? readString(body.matchId)
  const groupId = readString(body.group_id) ?? readString(body.groupId)
  const userId = readString(body.user_id) ?? readString(body.userId)
  if (!depositId) {
    return NextResponse.json({ error: 'deposit_id_required', provider }, { status: 400 })
  }
  if (!matchId) {
    return NextResponse.json({ error: 'match_id_required', provider }, { status: 400 })
  }
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required', provider }, { status: 400 })
  }
  if (!userId) {
    return NextResponse.json({ error: 'user_id_required', provider }, { status: 400 })
  }

  const service = createSupabaseServiceClient(supabaseUrl, serviceRoleKey)
  const depositLookup = await service
    .from('deposits')
    .select('id,match_id,group_id,user_id,status,amount,toss_order_id,toss_payment_key,refunded_amount,retained_amount,refunded_at,notes')
    .eq('id', depositId)
    .maybeSingle()

  if (depositLookup.error) {
    return NextResponse.json({ error: 'deposit_lookup_failed', provider }, { status: 500 })
  }
  if (!depositLookup.data) {
    return NextResponse.json({ error: 'deposit_not_found', provider }, { status: 404 })
  }

  const deposit = depositLookup.data as DepositCancellationRow
  if (
    deposit.match_id !== matchId
    || deposit.group_id !== groupId
    || deposit.user_id !== userId
  ) {
    return NextResponse.json({ error: 'deposit_ownership_mismatch', provider }, { status: 403 })
  }
  if (!deposit.toss_payment_key || deposit.toss_payment_key !== paymentKey) {
    return NextResponse.json({ error: 'payment_key_mismatch', provider }, { status: 409 })
  }
  if (!deposit.toss_order_id || deposit.amount !== DEPOSIT_AMOUNT) {
    return NextResponse.json({ error: 'deposit_payment_evidence_invalid', provider }, { status: 409 })
  }
  if (
    deposit.status === 'refunded'
    && deposit.refunded_amount === deposit.amount
    && deposit.retained_amount === 0
  ) {
    return NextResponse.json({
      provider,
      status: 'refunded',
      deposit,
      idempotent: true,
    })
  }
  if (!['paid', 'held'].includes(deposit.status)) {
    return NextResponse.json({ error: 'deposit_not_refundable', provider }, { status: 409 })
  }
  if (cancelAmount !== null && cancelAmount !== deposit.amount) {
    return NextResponse.json({
      error: 'partial_cancellation_not_supported',
      provider,
    }, { status: 409 })
  }

  try {
    const payment = await cancelTossPayment({
      paymentKey: deposit.toss_payment_key,
      cancelReason,
      cancelAmount: deposit.amount,
      idempotencyKey: `deposit_cancel_${deposit.id}_full`,
    })

    if (payment.status === 'PARTIAL_CANCELED') {
      return NextResponse.json({
        error: 'partial_cancellation_requires_reconciliation',
        provider,
        status: payment.status,
      }, { status: 409 })
    }

    const refundedAmount = sumSuccessfulCancelAmount(payment.cancels)
    if (
      payment.status !== 'CANCELED'
      || payment.paymentKey !== deposit.toss_payment_key
      || payment.orderId !== deposit.toss_order_id
      || payment.totalAmount !== deposit.amount
      || refundedAmount !== deposit.amount
    ) {
      return NextResponse.json({
        error: 'provider_cancellation_verification_failed',
        provider,
      }, { status: 502 })
    }

    const { data, error } = await service
      .from('deposits')
      .update({
        status: 'refunded',
        refunded_at: getLatestSuccessfulCancelTime(payment.cancels) ?? new Date().toISOString(),
        refunded_amount: deposit.amount,
        retained_amount: 0,
        notes: [deposit.notes, `toss_cancel:${payment.status}:amount=${deposit.amount}`]
          .filter(Boolean)
          .join(' | '),
      })
      .eq('id', deposit.id)
      .eq('match_id', deposit.match_id)
      .eq('group_id', deposit.group_id)
      .eq('user_id', deposit.user_id)
      .eq('toss_payment_key', deposit.toss_payment_key)
      .in('status', ['paid', 'held'])
      .select('id,match_id,group_id,user_id,status,amount,toss_payment_key,refunded_at,refunded_amount,retained_amount,notes')
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({
        error: 'payment_reconciliation_required',
        provider,
      }, { status: 502 })
    }

    return NextResponse.json({
      provider,
      status: 'refunded',
      deposit: data,
      payment: {
        paymentKey: payment.paymentKey,
        orderId: payment.orderId,
        status: payment.status,
        cancels: payment.cancels ?? [],
      },
    })
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return NextResponse.json({
        error: error.code,
        provider,
        status: 'cancel_failed',
      }, { status: error.status })
    }

    return NextResponse.json({ error: 'cancel_failed', provider }, { status: 502 })
  }
}

function readCancelResult(req: NextRequest, body: Record<string, unknown> = {}) {
  const provider = resolveDepositPaymentProvider()
  const readiness = getDepositPaymentReadiness(provider)

  return {
    provider,
    groupId: readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? '',
    reason: readString(body.reason) ?? req.nextUrl.searchParams.get('reason') ?? 'checkout_cancelled',
    providerReady: readiness.ok,
  }
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

function readBearerToken(value: string | null) {
  if (!value?.startsWith('Bearer ')) return null
  const token = value.slice('Bearer '.length).trim()
  return token || null
}

function sumSuccessfulCancelAmount(cancels: Array<{
  cancelAmount?: number
  cancelStatus?: string
}> | undefined) {
  return (cancels ?? [])
    .filter((cancel) => cancel.cancelStatus === 'DONE')
    .reduce((sum, cancel) => sum + (cancel.cancelAmount ?? 0), 0)
}

function getLatestSuccessfulCancelTime(cancels: Array<{
  canceledAt?: string
  cancelStatus?: string
}> | undefined) {
  return [...(cancels ?? [])]
    .reverse()
    .find((cancel) => cancel.cancelStatus === 'DONE' && cancel.canceledAt)
    ?.canceledAt ?? null
}

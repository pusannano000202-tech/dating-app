import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  normalizeDepositReturnPath,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { cancelTossPayment, TossPaymentError } from '@/lib/payments/toss'
import { getPublicAppOrigin, getSupabaseUrl } from '@/lib/utils'

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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 503 })
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

  try {
    const payment = await cancelTossPayment({
      paymentKey,
      cancelReason,
      cancelAmount: cancelAmount ?? undefined,
      idempotencyKey: `deposit_cancel_${paymentKey}_${cancelAmount ?? 'all'}`,
    })

    const service = createSupabaseServiceClient(getSupabaseUrl(), serviceRoleKey)
    const { data, error } = await service
      .from('deposits')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        notes: `toss_cancel:${payment.status}:amount=${cancelAmount ?? 'all'}`,
      })
      .eq('toss_payment_key', paymentKey)
      .select('id,status,toss_payment_key,refunded_at,notes')
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'deposit_refund_update_failed' }, { status: 400 })
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
  const provider = resolveDepositPaymentProvider(
    readString(body.provider) ?? req.nextUrl.searchParams.get('provider'),
  )
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

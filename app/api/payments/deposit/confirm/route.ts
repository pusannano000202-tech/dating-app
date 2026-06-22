import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  isDepositOrderIdForContext,
  isDepositPaymentAmountValid,
  normalizeDepositReturnPath,
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

type ConfirmDepositOptions = {
  redirectBrowser: boolean
}

export async function POST(req: NextRequest) {
  return confirmDeposit(req, { redirectBrowser: false })
}

export async function GET(req: NextRequest) {
  return confirmDeposit(req, { redirectBrowser: true })
}

async function confirmDeposit(req: NextRequest, options: ConfirmDepositOptions) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    if (options.redirectBrowser) {
      const target = new URL('/login', req.nextUrl.origin)
      target.searchParams.set('redirect', '/group/create')
      target.searchParams.set('payment', 'failed')
      target.searchParams.set('reason', 'unauthorized')
      return NextResponse.redirect(target)
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = req.method === 'POST' ? await readJson(req) : {}
  const provider = resolveDepositPaymentProvider(readString(body.provider) ?? req.nextUrl.searchParams.get('provider'))
  const groupId = readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? ''
  const amount = readNumber(body.amount) ?? Number(req.nextUrl.searchParams.get('amount') ?? DEPOSIT_AMOUNT)
  const paymentKey = readString(body.paymentKey) ?? readString(body.payment_key) ?? req.nextUrl.searchParams.get('paymentKey') ?? ''
  const orderId = readString(body.orderId) ?? readString(body.order_id) ?? req.nextUrl.searchParams.get('orderId') ?? ''

  if (!groupId) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: 'group_id_required',
      status: 400,
    })
  }
  if (!isDepositPaymentAmountValid(amount)) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: 'invalid_amount',
      status: 400,
    })
  }

  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider: readiness.provider,
      error: readiness.error,
      status: 503,
    })
  }

  if (provider !== 'mock') {
    if (!paymentKey || !orderId) {
      return respondWithPaymentError(req, options, {
        groupId,
        provider,
        error: 'payment_key_and_order_id_required',
        status: 400,
      })
    }
    if (!isDepositOrderIdForContext(orderId, groupId, user.id)) {
      return respondWithPaymentError(req, options, {
        groupId,
        provider,
        error: 'invalid_order_id',
        status: 400,
      })
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
      return respondWithPaymentError(req, options, {
        groupId,
        provider,
        error: 'deposit_lookup_failed',
        status: 500,
      })
    }
    if (!depositLookup.data) {
      return respondWithPaymentError(req, options, {
        groupId,
        provider,
        error: 'deposit_order_not_found',
        status: 404,
      })
    }

    const deposit = depositLookup.data as DepositPaymentRow
    if (deposit.status === 'paid' || deposit.status === 'held') {
      return respondWithPaidDeposit(req, options, groupId, {
        provider,
        status: deposit.status,
        deposit,
      }, 200)
    }

    try {
      const payment = await confirmTossPayment({
        paymentKey,
        orderId,
        amount,
        idempotencyKey: `deposit_confirm_${orderId}`,
      })

      if (payment.orderId !== orderId || payment.totalAmount !== DEPOSIT_AMOUNT || payment.status !== 'DONE') {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: 'payment_verification_failed',
          status: 400,
        })
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
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: error?.message || 'deposit_update_failed',
          status: 400,
        })
      }

      return respondWithPaidDeposit(req, options, groupId, {
        provider,
        status: 'paid',
        deposit: data,
        payment: {
          paymentKey: payment.paymentKey,
          orderId: payment.orderId,
          status: payment.status,
          method: payment.method ?? null,
        },
      }, 201)
    } catch (error) {
      if (error instanceof TossPaymentError) {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: error.code,
          status: 'confirm_failed',
          httpStatus: error.status,
        })
      }

      return respondWithPaymentError(req, options, {
        groupId,
        provider,
        error: 'confirm_failed',
        status: 502,
      })
    }
  }

  const { data, error } = await supabase
    .rpc('mock_pay_deposit', { p_group_id: groupId, p_amount: DEPOSIT_AMOUNT })
    .maybeSingle()

  if (error) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: error.message || 'pay_failed',
      status: 400,
    })
  }

  return respondWithPaidDeposit(req, options, groupId, { provider, status: 'paid', deposit: data }, 201)
}

function respondWithPaidDeposit(
  req: NextRequest,
  options: ConfirmDepositOptions,
  groupId: string,
  payload: Record<string, unknown>,
  status: number,
) {
  if (options.redirectBrowser) {
    const target = buildPaymentRedirect(req, groupId)
    target.searchParams.set('payment', 'paid')
    return NextResponse.redirect(target)
  }

  return NextResponse.json(payload, { status })
}

function respondWithPaymentError(
  req: NextRequest,
  options: ConfirmDepositOptions,
  params: {
    groupId: string
    provider: ReturnType<typeof resolveDepositPaymentProvider>
    error: string
    status?: number | string
    httpStatus?: number
  },
) {
  if (options.redirectBrowser) {
    const target = buildPaymentRedirect(req, params.groupId)
    target.searchParams.set('payment', 'failed')
    target.searchParams.set('provider', params.provider)
    target.searchParams.set('reason', params.error)
    return NextResponse.redirect(target)
  }

  return NextResponse.json({
    error: params.error,
    provider: params.provider,
    ...(typeof params.status === 'string' ? { status: params.status } : {}),
  }, { status: params.httpStatus ?? (typeof params.status === 'number' ? params.status : 400) })
}

function buildPaymentRedirect(req: NextRequest, groupId: string) {
  const target = new URL(
    normalizeDepositReturnPath(req.nextUrl.searchParams.get('return_path')),
    req.nextUrl.origin,
  )
  if (groupId) {
    target.searchParams.set('group_id', groupId)
  }
  return target
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

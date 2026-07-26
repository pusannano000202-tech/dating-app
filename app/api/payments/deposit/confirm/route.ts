import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  isDepositOrderIdForContext,
  isDepositPaymentAmountValid,
  normalizeDepositReturnPath,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { createPaymentServiceClient, payMockDepositForMatch } from '@/lib/payments/deposit-server'
import {
  confirmTossPayment,
  getTossPayment,
  TossPaymentError,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getPublicAppOrigin } from '@/lib/utils'

interface DepositPaymentRow {
  id: string
  match_id: string
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
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    if (options.redirectBrowser) {
      const target = new URL('/login', getPublicAppOrigin() || req.nextUrl.origin)
      target.searchParams.set('redirect', '/group/create')
      target.searchParams.set('payment', 'failed')
      target.searchParams.set('reason', 'unauthorized')
      return NextResponse.redirect(target)
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = req.method === 'POST' ? await readJson(req) : {}
  const provider = resolveDepositPaymentProvider()
  const groupId = readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? ''
  const matchId = readString(body.match_id) ?? req.nextUrl.searchParams.get('match_id') ?? ''
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
  if (!matchId) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: 'match_id_required',
      status: 400,
    })
  }

  const matchContext = await validateDepositMatchContext(supabase, {
    matchId,
    groupId,
    userId: user.id,
  })
  if (!matchContext.ok) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: matchContext.error,
      status: matchContext.status,
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

  const paymentService = createPaymentServiceClient()
  if (!paymentService) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error: 'server_settlement_not_configured',
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

    const depositLookup = await paymentService
      .from('deposits')
      .select('id,match_id,status,toss_order_id,toss_payment_key')
      .eq('match_id', matchId)
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

      const finalized = await finalizeApprovedDepositPayment({
        paymentService,
        deposit,
        payment,
        matchId,
        groupId,
        userId: user.id,
      })
      if (!finalized.ok) {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: finalized.error,
          status: finalized.status,
        })
      }

      return respondWithPaidDeposit(req, options, groupId, {
        provider,
        status: 'paid',
        deposit: finalized.deposit,
        payment: {
          paymentKey: payment.paymentKey,
          orderId: payment.orderId,
          status: payment.status,
          method: payment.method ?? null,
        },
      }, 201)
    } catch (error) {
      if (error instanceof TossPaymentError && error.status < 500) {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: error.code,
          status: 'confirm_failed',
          httpStatus: error.status,
        })
      }

      const recovered = await recoverAmbiguousTossConfirmation({ paymentKey, orderId })
      if (!recovered.ok) {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: recovered.error,
          status: recovered.status,
        })
      }

      const finalized = await finalizeApprovedDepositPayment({
        paymentService,
        deposit,
        payment: recovered.payment,
        matchId,
        groupId,
        userId: user.id,
      })
      if (!finalized.ok) {
        return respondWithPaymentError(req, options, {
          groupId,
          provider,
          error: finalized.error,
          status: finalized.status,
        })
      }

      return respondWithPaidDeposit(req, options, groupId, {
        provider,
        status: 'paid',
        deposit: finalized.deposit,
        payment: {
          paymentKey: recovered.payment.paymentKey,
          orderId: recovered.payment.orderId,
          status: recovered.payment.status,
          method: recovered.payment.method ?? null,
          recovered: true,
        },
      }, 201)

    }
  }

  const { data, error } = await payMockDepositForMatch({
    matchId,
    groupId,
    userId: user.id,
  })

  if (error) {
    return respondWithPaymentError(req, options, {
      groupId,
      provider,
      error,
      status: error === 'server_mock_payment_not_configured' ? 503 : 400,
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
    getPublicAppOrigin() || req.nextUrl.origin,
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

async function recoverAmbiguousTossConfirmation(params: {
  paymentKey: string
  orderId: string
}): Promise<
  | { ok: true; payment: TossPaymentObject }
  | { ok: false; error: string; status: number }
> {
  try {
    const payment = await getTossPayment(params.paymentKey)
    if (
      payment.paymentKey === params.paymentKey
      && payment.orderId === params.orderId
      && payment.totalAmount === DEPOSIT_AMOUNT
      && payment.status === 'DONE'
    ) {
      return { ok: true, payment }
    }
    if (['ABORTED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
      return { ok: false, error: 'confirm_failed', status: 400 }
    }
    return { ok: false, error: 'payment_reconciliation_required', status: 502 }
  } catch {
    return { ok: false, error: 'payment_reconciliation_required', status: 502 }
  }
}

async function finalizeApprovedDepositPayment(params: {
  paymentService: NonNullable<ReturnType<typeof createPaymentServiceClient>>
  deposit: DepositPaymentRow
  payment: TossPaymentObject
  matchId: string
  groupId: string
  userId: string
}): Promise<
  | { ok: true; deposit: unknown }
  | { ok: false; error: string; status: number }
> {
  const finalized = await params.paymentService
    .rpc('finalize_toss_deposit_payment', {
      p_deposit_id: params.deposit.id,
      p_match_id: params.matchId,
      p_group_id: params.groupId,
      p_user_id: params.userId,
      p_payment_key: params.payment.paymentKey,
      p_order_id: params.payment.orderId,
      p_paid_at: params.payment.approvedAt ?? new Date().toISOString(),
    })
    .maybeSingle()

  if (!finalized.error && finalized.data) {
    return { ok: true, deposit: finalized.data }
  }

  const recovery = await recoverDepositAfterFinalizationFailure(params)
  if (recovery.status === 'committed') {
    return { ok: true, deposit: recovery.deposit }
  }
  return { ok: false, error: 'payment_reconciliation_required', status: 502 }
}

async function recoverDepositAfterFinalizationFailure(params: {
  paymentService: NonNullable<ReturnType<typeof createPaymentServiceClient>>
  deposit: DepositPaymentRow
  payment: TossPaymentObject
  matchId: string
  groupId: string
  userId: string
}): Promise<
  | { status: 'committed'; deposit: DepositPaymentRow }
  | { status: 'pending'; deposit: DepositPaymentRow }
  | { status: 'uncertain' }
> {
  const recovered = await params.paymentService
    .from('deposits')
    .select('id,match_id,status,toss_order_id,toss_payment_key')
    .eq('id', params.deposit.id)
    .eq('match_id', params.matchId)
    .eq('group_id', params.groupId)
    .eq('user_id', params.userId)
    .eq('toss_order_id', params.payment.orderId)
    .maybeSingle()

  if (recovered.error || !recovered.data) {
    return { status: 'uncertain' }
  }

  const recoveredDeposit = recovered.data as DepositPaymentRow
  if (
    (recoveredDeposit.status === 'paid' || recoveredDeposit.status === 'held')
    && recoveredDeposit.toss_payment_key === params.payment.paymentKey
  ) {
    return { status: 'committed', deposit: recoveredDeposit }
  }
  if (recoveredDeposit.status === 'pending') {
    return { status: 'pending', deposit: recoveredDeposit }
  }

  return { status: 'uncertain' }
}

type DepositMatchValidation =
  | { ok: true }
  | { ok: false; error: string; status: number }

interface DepositMatchRow {
  id: string
  status: string
  group_a_id: string
  group_b_id: string
}

async function validateDepositMatchContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: { matchId: string; groupId: string; userId: string },
): Promise<DepositMatchValidation> {
  const matchLookup = await supabase
    .from('matches')
    .select('id,status,group_a_id,group_b_id')
    .eq('id', params.matchId)
    .maybeSingle()

  if (matchLookup.error) return { ok: false, error: 'match_lookup_failed', status: 500 }

  const match = matchLookup.data as DepositMatchRow | null
  if (!match) return { ok: false, error: 'match_not_found', status: 404 }
  if (match.status !== 'pending' && match.status !== 'confirmed') {
    return { ok: false, error: 'match_not_payable', status: 400 }
  }
  if (match.group_a_id !== params.groupId && match.group_b_id !== params.groupId) {
    return { ok: false, error: 'group_not_in_match', status: 403 }
  }

  const membership = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', params.groupId)
    .eq('user_id', params.userId)
    .is('left_at', null)
    .maybeSingle()

  if (membership.error || !membership.data) {
    return { ok: false, error: 'not_group_member', status: 403 }
  }

  return { ok: true }
}

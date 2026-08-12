import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  buildDepositPaymentRequestDraft,
  buildDepositCustomerKey,
  getDepositPaymentReadiness,
  getTossDepositOrderAction,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { createPaymentServiceClient, payMockDepositForMatch } from '@/lib/payments/deposit-server'
import { getTossPaymentByOrderId, TossPaymentError } from '@/lib/payments/toss'
import { getPublicAppOrigin } from '@/lib/utils'

const DEPOSIT_PAYMENT_SELECT = 'id,match_id,group_id,user_id,amount,status,toss_order_id,toss_payment_key'

interface DepositPaymentRow {
  id: string
  match_id: string
  group_id: string
  user_id: string
  amount: number
  status: string
  toss_order_id: string | null
  toss_payment_key: string | null
}

interface DepositRow {
  id: string
  match_id: string
  user_id: string
  group_id: string
  amount: number
  status: string
  paid_at: string | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }
  const matchId = req.nextUrl.searchParams.get('match_id')
  if (!matchId) {
    return NextResponse.json({ error: 'match_id_required' }, { status: 400 })
  }

  // RLS: deposits_self → 본인 row 만 조회 가능. 그룹 전체 결제 현황은 별도 RPC 필요.
  // v1 단순화: 본인 deposit 만 조회 + 그룹 전체 결제 카운트는 enter_match_pool 검증으로 위임.
  const { data, error } = await supabase
    .from('deposits')
    .select('id,match_id,user_id,group_id,amount,status,paid_at,created_at')
    .eq('match_id', matchId)
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
  const supabase = await createSupabaseServerClient()
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

  const paymentService = createPaymentServiceClient()
  if (!paymentService) {
    return NextResponse.json({ error: 'server_settlement_not_configured' }, { status: 503 })
  }

  const activeDeposit = await paymentService
    .from('deposits')
    .select(DEPOSIT_PAYMENT_SELECT)
    .eq('match_id', matchId)
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .in('status', ['pending', 'paid', 'held'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeDeposit.error) {
    return NextResponse.json({ error: 'deposit_lookup_failed' }, { status: 500 })
  }

  let deposit = activeDeposit.data as DepositPaymentRow | null
  if (!deposit) {
    const carried = await paymentService
      .rpc('apply_available_deposit_carryover', {
        p_match_id: matchId,
        p_group_id: groupId,
        p_user_id: user.id,
      })
      .maybeSingle()

    if (carried.error) {
      const concurrent = await findActiveDeposit(paymentService, {
        matchId,
        groupId,
        userId: user.id,
      })
      if (concurrent.error) {
        return NextResponse.json({ error: 'deposit_lookup_failed' }, { status: 500 })
      }
      if (!concurrent.data) {
        return NextResponse.json({ error: 'deposit_carryover_apply_failed' }, { status: 409 })
      }
      deposit = concurrent.data as DepositPaymentRow
    } else if (carried.data) {
      return NextResponse.json({
        provider: 'carryover',
        status: 'held',
        deposit: carried.data,
        reused_carryover: true,
        payment_required: false,
      }, { status: 200 })
    }
  }

  if (deposit && deposit.amount !== DEPOSIT_AMOUNT) {
    return NextResponse.json({ error: 'deposit_amount_mismatch' }, { status: 409 })
  }
  if (deposit?.status === 'paid' || deposit?.status === 'held') {
    return NextResponse.json({
      provider: 'existing',
      status: deposit.status,
      deposit,
      payment_required: false,
    }, { status: 200 })
  }

  const provider = resolveDepositPaymentProvider()
  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({
      error: readiness.error,
      provider: readiness.provider,
    }, { status: 503 })
  }

  // 로컬/검토용 mock 결제: 실제 결제사 호출 없이 보증금 paid 상태만 만든다.
  if (provider === 'mock') {
    const { data, error } = await payMockDepositForMatch({
      matchId,
      groupId,
      userId: user.id,
    })

    if (error) {
      const status = error === 'server_mock_payment_not_configured' ? 503 : 400
      return NextResponse.json({ error }, { status })
    }

    return NextResponse.json({
      provider,
      status: 'paid',
      deposit: data,
      payment_required: false,
    }, { status: 201 })
  }

  const buildPayment = (orderId?: string) => buildDepositPaymentRequestDraft({
    provider,
    groupId,
    matchId,
    userId: user.id,
    origin: getPublicAppOrigin() || req.nextUrl.origin,
    orderId,
    returnPath: typeof body.return_path === 'string' ? body.return_path : undefined,
  })

  let payment: ReturnType<typeof buildDepositPaymentRequestDraft> | null = null
  if (!deposit) {
    payment = buildPayment()
    const created = await paymentService
      .from('deposits')
      .insert({
        match_id: matchId,
        user_id: user.id,
        group_id: groupId,
        amount: DEPOSIT_AMOUNT,
        status: 'pending',
        toss_order_id: payment.orderId,
      })
      .select(DEPOSIT_PAYMENT_SELECT)
      .maybeSingle()

    if (created.error || !created.data) {
      if (created.error?.code !== '23505') {
        return NextResponse.json({ error: 'deposit_create_failed' }, { status: 500 })
      }

      const concurrent = await paymentService
        .from('deposits')
        .select(DEPOSIT_PAYMENT_SELECT)
        .eq('match_id', matchId)
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .in('status', ['pending', 'paid', 'held'])
        .maybeSingle()

      if (concurrent.error || !concurrent.data) {
        return NextResponse.json({ error: 'deposit_create_conflict' }, { status: 409 })
      }

      deposit = concurrent.data as DepositPaymentRow
      if (deposit.status === 'paid' || deposit.status === 'held') {
        return NextResponse.json({
          provider: 'existing',
          status: deposit.status,
          deposit,
          payment_required: false,
        }, { status: 200 })
      }
      payment = null
    } else {
      deposit = created.data as DepositPaymentRow
    }
  }

  if (deposit.amount !== DEPOSIT_AMOUNT) {
    return NextResponse.json({ error: 'deposit_amount_mismatch' }, { status: 409 })
  }
  if (deposit.status !== 'pending' || deposit.toss_payment_key) {
    return NextResponse.json({
      error: 'deposit_payment_reconciliation_required',
      provider,
    }, { status: 409 })
  }

  if (!deposit.toss_order_id) {
    payment = buildPayment()
    const updated = await paymentService
      .from('deposits')
      .update({ toss_order_id: payment.orderId })
      .eq('id', deposit.id)
      .eq('match_id', matchId)
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .is('toss_order_id', null)
      .is('toss_payment_key', null)
      .select(DEPOSIT_PAYMENT_SELECT)
      .maybeSingle()

    if (updated.error) {
      return NextResponse.json({ error: 'deposit_order_attach_failed' }, { status: 500 })
    }
    if (updated.data) {
      deposit = updated.data as DepositPaymentRow
    } else {
      const raced = await findActiveDeposit(paymentService, {
        matchId,
        groupId,
        userId: user.id,
      })
      if (raced.error || !raced.data) {
        return NextResponse.json({ error: 'deposit_order_attach_conflict' }, { status: 409 })
      }
      deposit = raced.data as DepositPaymentRow
      payment = null
    }
  }

  if (!payment) {
    if (deposit.status === 'paid' || deposit.status === 'held') {
      return NextResponse.json({
        provider: 'existing',
        status: deposit.status,
        deposit,
        payment_required: false,
      }, { status: 200 })
    }
    if (deposit.status !== 'pending' || deposit.toss_payment_key || !deposit.toss_order_id) {
      return NextResponse.json({
        error: 'deposit_payment_reconciliation_required',
        provider,
      }, { status: 409 })
    }

    const previousOrderId = deposit.toss_order_id
    let orderAction: ReturnType<typeof getTossDepositOrderAction> = 'reuse'
    try {
      const providerPayment = await getTossPaymentByOrderId(previousOrderId)
      if (
        providerPayment.orderId !== previousOrderId
        || providerPayment.totalAmount !== deposit.amount
      ) {
        return NextResponse.json({
          error: 'deposit_payment_reconciliation_required',
          provider,
        }, { status: 409 })
      }
      orderAction = getTossDepositOrderAction(providerPayment.status)
    } catch (error) {
      if (error instanceof TossPaymentError && error.code === 'NOT_FOUND_PAYMENT_SESSION') {
        orderAction = 'rotate'
      } else if (!(error instanceof TossPaymentError && error.code === 'NOT_FOUND_PAYMENT')) {
        const status = error instanceof TossPaymentError && error.status >= 500
          ? error.status
          : 502
        return NextResponse.json({ error: 'deposit_order_status_check_failed', provider }, { status })
      }
    }

    if (orderAction === 'reconcile') {
      return NextResponse.json({
        error: 'deposit_payment_reconciliation_required',
        provider,
      }, { status: 409 })
    }

    payment = buildPayment(previousOrderId)
    if (orderAction === 'rotate') {
      payment = buildPayment()
      const rotated = await paymentService
        .from('deposits')
        .update({ toss_order_id: payment.orderId })
        .eq('id', deposit.id)
        .eq('match_id', matchId)
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('toss_order_id', previousOrderId)
        .is('toss_payment_key', null)
        .select(DEPOSIT_PAYMENT_SELECT)
        .maybeSingle()

      if (rotated.error) {
        return NextResponse.json({ error: 'deposit_order_rotate_failed' }, { status: 500 })
      }
      if (rotated.data) {
        deposit = rotated.data as DepositPaymentRow
      } else {
        const raced = await findActiveDeposit(paymentService, {
          matchId,
          groupId,
          userId: user.id,
        })
        if (raced.error || !raced.data) {
          return NextResponse.json({ error: 'deposit_order_rotate_conflict' }, { status: 409 })
        }

        deposit = raced.data as DepositPaymentRow
        if (deposit.status === 'paid' || deposit.status === 'held') {
          return NextResponse.json({
            provider: 'existing',
            status: deposit.status,
            deposit,
            payment_required: false,
          }, { status: 200 })
        }
        if (deposit.status !== 'pending' || deposit.toss_payment_key || !deposit.toss_order_id) {
          return NextResponse.json({
            error: 'deposit_payment_reconciliation_required',
            provider,
          }, { status: 409 })
        }
        payment = buildPayment(deposit.toss_order_id)
      }
    }
  }

  return NextResponse.json({
    status: 'checkout_ready',
    provider,
    deposit,
    payment_required: true,
    payment: {
      ...payment,
      provider: 'toss',
      clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
      method: 'CARD',
      customerKey: buildDepositCustomerKey(user.id),
    },
  }, { status: 202 })
}

function findActiveDeposit(
  paymentService: NonNullable<ReturnType<typeof createPaymentServiceClient>>,
  params: { matchId: string; groupId: string; userId: string },
) {
  return paymentService
    .from('deposits')
    .select(DEPOSIT_PAYMENT_SELECT)
    .eq('match_id', params.matchId)
    .eq('group_id', params.groupId)
    .eq('user_id', params.userId)
    .in('status', ['pending', 'paid', 'held'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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

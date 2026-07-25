import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  buildTossRefundRequestKey,
  cancelTossPayment,
  getTossPayment,
  TossPaymentError,
  verifyTossRefundEvidence,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import { appFeeToRefundAmount, normalizeAppFeeAmount } from '@/lib/refund/fee-flow'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface PreparedRefundResult {
  refund_request_id: string
  deposit_id: string
  requested_refund_amount: number
  deposit_amount: number
  app_revenue: number
  request_status: 'pending' | 'processed' | 'cancelled'
  settlement_version: number
  settlement_provider: string | null
  settlement_provider_status: string | null
  settled_refund_amount: number | null
}

interface RefundDepositRow {
  id: string
  match_id: string
  user_id: string
  amount: number
  status: string
  toss_payment_key: string | null
  toss_order_id: string | null
}

type ProviderSettlement = {
  provider: 'toss' | 'mock' | 'not_required'
  status: string
  reference: string
  requestKey: string
  paymentKey: string | null
  orderId: string | null
  settledAmount: number
  paymentStatus?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const appFeeAmount = typeof body.app_fee_amount === 'number'
    ? normalizeAppFeeAmount(body.app_fee_amount, DEPOSIT_AMOUNT)
    : null
  const refundAmount = appFeeAmount !== null
    ? appFeeToRefundAmount(appFeeAmount, DEPOSIT_AMOUNT)
    : typeof body.refund_amount === 'number' && body.refund_amount >= 0
      ? Math.floor(body.refund_amount)
      : null

  if (refundAmount === null || refundAmount > DEPOSIT_AMOUNT) {
    return NextResponse.json({ error: 'invalid_refund_amount' }, { status: 400 })
  }

  const service = createPaymentServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'server_settlement_not_configured' }, { status: 503 })
  }

  const zeroReasons = Array.isArray(body.zero_refund_reasons)
    ? body.zero_refund_reasons.filter((value): value is string => typeof value === 'string')
    : null
  const zeroComment = typeof body.zero_refund_comment === 'string' ? body.zero_refund_comment : null

  const prepared = await supabase
    .rpc('prepare_refund_request', {
      p_match_id: params.id,
      p_refund_amount: refundAmount,
      p_zero_refund_reasons: zeroReasons,
      p_zero_refund_comment: zeroComment,
    })
    .maybeSingle()

  if (prepared.error) {
    return NextResponse.json({ error: translateRefundError(prepared.error.message) }, { status: 400 })
  }

  const request = prepared.data as PreparedRefundResult | null
  if (!request) {
    return NextResponse.json({ error: 'refund_prepare_failed' }, { status: 500 })
  }
  if (request.request_status === 'processed') {
    return NextResponse.json({
      result: request,
      external_refund: { status: 'refunded', reason: 'already_processed' },
    })
  }

  const depositLookup = await service
    .from('deposits')
    .select('id,match_id,user_id,amount,status,toss_payment_key,toss_order_id')
    .eq('id', request.deposit_id)
    .eq('match_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (depositLookup.error || !depositLookup.data) {
    return refundSettlementPending('deposit_match_mismatch', 409)
  }

  const deposit = depositLookup.data as RefundDepositRow
  const settlement = await settleRefundWithProvider({
    request,
    deposit,
  })

  if (!settlement.ok) {
    return refundSettlementPending(settlement.error, settlement.status)
  }

  const finalized = await service
    .rpc('finalize_refund_request', {
      p_refund_request_id: request.refund_request_id,
      p_settlement_version: request.settlement_version,
      p_provider: settlement.value.provider,
      p_settlement_key: settlement.value.reference,
      p_provider_request_key: settlement.value.requestKey,
      p_provider_status: settlement.value.status,
      p_provider_payment_key: settlement.value.paymentKey,
      p_provider_order_id: settlement.value.orderId,
      p_settled_refund_amount: settlement.value.settledAmount,
    })
    .maybeSingle()

  if (finalized.error || !finalized.data) {
    return refundSettlementPending('refund_finalize_failed', 502, {
      provider: settlement.value.provider,
      provider_status: settlement.value.paymentStatus ?? settlement.value.status,
    })
  }

  return NextResponse.json({
    result: finalized.data,
    external_refund: {
      status: 'refunded',
      provider: settlement.value.provider,
      amount: request.requested_refund_amount,
      payment_status: settlement.value.paymentStatus ?? settlement.value.status,
    },
  })
}

async function settleRefundWithProvider(params: {
  request: PreparedRefundResult
  deposit: RefundDepositRow
}): Promise<
  | { ok: true; value: ProviderSettlement }
  | { ok: false; error: string; status: number }
> {
  if (params.request.requested_refund_amount === 0) {
    return {
      ok: true,
      value: {
        provider: 'not_required',
        status: 'NOT_REQUIRED',
        reference: `refund_${params.request.refund_request_id}_v${params.request.settlement_version}_0`,
        requestKey: `refund_${params.request.refund_request_id}_v${params.request.settlement_version}_0`,
        paymentKey: null,
        orderId: null,
        settledAmount: 0,
      },
    }
  }

  const paymentKey = params.deposit.toss_payment_key?.trim() ?? ''
  if (paymentKey.toUpperCase().startsWith('MOCK_')) {
    return {
      ok: true,
      value: {
        provider: 'mock',
        status: 'MOCK',
        reference: params.deposit.toss_order_id ?? params.deposit.id,
        requestKey: `refund_${params.request.refund_request_id}_v${params.request.settlement_version}_mock`,
        paymentKey: params.deposit.toss_payment_key,
        orderId: params.deposit.toss_order_id,
        settledAmount: params.request.requested_refund_amount,
      },
    }
  }
  if (!paymentKey) {
    return { ok: false, error: 'payment_key_missing', status: 409 }
  }

  const readiness = getDepositPaymentReadiness('toss')
  if (!readiness.ok) {
    return { ok: false, error: 'pending_provider_configuration', status: 503 }
  }

  try {
    const settlementKey = buildTossRefundRequestKey({
      refundRequestId: params.request.refund_request_id,
      settlementVersion: params.request.settlement_version,
      refundAmount: params.request.requested_refund_amount,
    })
    const currentPayment = await getTossPayment(paymentKey)
    const recoveredSettlement = buildVerifiedTossSettlement({
      payment: currentPayment,
      deposit: params.deposit,
      request: params.request,
      requestKey: settlementKey,
    })
    if (recoveredSettlement) {
      return { ok: true, value: recoveredSettlement }
    }
    if (
      currentPayment.paymentKey !== params.deposit.toss_payment_key
      || currentPayment.orderId !== params.deposit.toss_order_id
      || currentPayment.totalAmount !== params.deposit.amount
      || currentPayment.status !== 'DONE'
      || (currentPayment.cancels ?? []).some((cancel) => cancel.cancelStatus === 'DONE')
    ) {
      return { ok: false, error: 'provider_settlement_requires_reconciliation', status: 409 }
    }

    const payment = await cancelTossPayment({
      paymentKey,
      cancelReason: '정상 만남 후 보증금 환불',
      cancelAmount: params.request.requested_refund_amount,
      idempotencyKey: settlementKey,
    })

    const settlement = buildVerifiedTossSettlement({
      payment,
      deposit: params.deposit,
      request: params.request,
      requestKey: settlementKey,
    })
    if (!settlement) {
      return { ok: false, error: 'provider_settlement_mismatch', status: 502 }
    }
    return { ok: true, value: settlement }
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return { ok: false, error: error.code, status: error.status }
    }
    return { ok: false, error: 'cancel_failed', status: 502 }
  }
}

function buildVerifiedTossSettlement(params: {
  payment: TossPaymentObject
  deposit: RefundDepositRow
  request: PreparedRefundResult
  requestKey: string
}): ProviderSettlement | null {
  if (
    params.payment.paymentKey !== params.deposit.toss_payment_key
    || params.payment.orderId !== params.deposit.toss_order_id
  ) {
    return null
  }

  const evidence = verifyTossRefundEvidence(params.payment, {
    requestedRefundAmount: params.request.requested_refund_amount,
    depositAmount: params.deposit.amount,
  })
  if (!evidence.ok) {
    return null
  }

  return {
    provider: 'toss',
    status: params.payment.status,
    reference: evidence.transactionKey,
    requestKey: params.requestKey,
    paymentKey: params.payment.paymentKey,
    orderId: params.payment.orderId,
    settledAmount: params.request.requested_refund_amount,
    paymentStatus: params.payment.status,
  }
}

function refundSettlementPending(
  reason: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return NextResponse.json({
    error: 'refund_settlement_pending',
    reason,
    ...details,
  }, { status })
}

function translateRefundError(message = '') {
  const knownErrors = [
    'not_authenticated',
    'invalid_refund_amount',
    'refund_request_conflict',
    'match_not_found',
    'match_not_completed',
    'auto_refund_pending',
    'both_continue_required',
    'no_show_cannot_refund',
    'deposit_not_found_or_already_refunded',
    'refund_exceeds_deposit',
    'legacy_refund_verification_required',
    'refund_settlement_version_mismatch',
  ]
  return knownErrors.find((code) => message.includes(code)) ?? 'refund_prepare_failed'
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

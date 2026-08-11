import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  settleRefundWithProvider,
  type PreparedRefundResult,
  type RefundDepositRow,
} from '@/lib/payments/refund-settlement'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const refundAmount = typeof body.refund_amount === 'number'
    ? Math.floor(body.refund_amount)
    : null

  if (refundAmount !== DEPOSIT_AMOUNT) {
    return NextResponse.json({ error: 'full_refund_required' }, { status: 400 })
  }

  const service = createPaymentServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'server_settlement_not_configured' }, { status: 503 })
  }

  const prepared = await supabase
    .rpc('prepare_refund_request', {
      p_match_id: params.id,
      p_refund_amount: refundAmount,
      p_zero_refund_reasons: null,
      p_zero_refund_comment: null,
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

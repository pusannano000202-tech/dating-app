import { getDepositPaymentReadiness } from './deposit'
import {
  buildTossRefundRequestKey,
  cancelTossPayment,
  getTossPayment,
  TossPaymentError,
  verifyTossRefundEvidence,
  type TossPaymentObject,
} from './toss'

export interface PreparedRefundResult {
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

export interface RefundDepositRow {
  id: string
  match_id: string
  user_id: string
  amount: number
  status: string
  toss_payment_key: string | null
  toss_order_id: string | null
}

export type ProviderSettlement = {
  provider: 'toss' | 'mock' | 'not_required'
  status: string
  reference: string
  requestKey: string
  paymentKey: string | null
  orderId: string | null
  settledAmount: number
  paymentStatus?: string
}

export async function settleRefundWithProvider(params: {
  request: PreparedRefundResult
  deposit: RefundDepositRow
}): Promise<
  | { ok: true; value: ProviderSettlement }
  | { ok: false; error: string; status: number }
> {
  if (params.request.requested_refund_amount === 0) {
    const requestKey = `refund_${params.request.refund_request_id}_v${params.request.settlement_version}_0`
    return {
      ok: true,
      value: {
        provider: 'not_required',
        status: 'NOT_REQUIRED',
        reference: requestKey,
        requestKey,
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
  if (!paymentKey) return { ok: false, error: 'payment_key_missing', status: 409 }

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
    if (recoveredSettlement) return { ok: true, value: recoveredSettlement }

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

export function buildVerifiedTossSettlement(params: {
  payment: TossPaymentObject
  deposit: RefundDepositRow
  request: PreparedRefundResult
  requestKey: string
}): ProviderSettlement | null {
  if (
    params.payment.paymentKey !== params.deposit.toss_payment_key
    || params.payment.orderId !== params.deposit.toss_order_id
  ) return null

  const evidence = verifyTossRefundEvidence(params.payment, {
    requestedRefundAmount: params.request.requested_refund_amount,
    depositAmount: params.deposit.amount,
  })
  if (!evidence.ok) return null

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

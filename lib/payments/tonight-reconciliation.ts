import { DEPOSIT_AMOUNT } from '../constants'
import { hashTonightPaymentKey } from './tonight-deposit-server'
import { TossPaymentError, type TossPaymentObject } from './toss'

export type TonightPreparedOrderClaim = {
  providerOrderId: string
  amount: number
}

export type TonightPreparedOrderReconciliation =
  | { kind: 'verified_paid'; paymentKeyHash: string }
  | { kind: 'no_charge' }
  | { kind: 'not_found' }
  | { kind: 'manual_review'; errorCode: 'provider_evidence_mismatch' | 'provider_request_rejected' }
  | { kind: 'retry'; errorCode: 'provider_unavailable' }

export type TonightReconciliationTransport = {
  getPaymentByOrderId(orderId: string): Promise<TossPaymentObject>
}

export async function reconcileTonightPreparedOrder(
  claim: TonightPreparedOrderClaim,
  transport: TonightReconciliationTransport,
): Promise<TonightPreparedOrderReconciliation> {
  if (
    typeof claim.providerOrderId !== 'string'
    || claim.providerOrderId.length < 8
    || claim.providerOrderId.length > 64
    || !/^[A-Za-z0-9_-]+$/.test(claim.providerOrderId)
    || claim.amount !== DEPOSIT_AMOUNT
  ) {
    return { kind: 'manual_review', errorCode: 'provider_evidence_mismatch' }
  }

  let payment: TossPaymentObject
  try {
    payment = await transport.getPaymentByOrderId(claim.providerOrderId)
  } catch (error) {
    // A provider 404 is only one input to the server-authoritative
    // never-authorized decision. The worker persists consecutive 404 evidence
    // and the database combines it with the local cancellation event and the
    // post-deadline grace period before closing the job.
    if (error instanceof TossPaymentError && error.status === 404) {
      return { kind: 'not_found' }
    }
    if (error instanceof TossPaymentError && error.status >= 400 && error.status < 500) {
      // Request timeout and rate-limit responses are transient.
      // Authentication/permission failures need operator intervention rather
      // than an unbounded retry loop.
      if (error.status !== 408 && error.status !== 429) {
        return { kind: 'manual_review', errorCode: 'provider_request_rejected' }
      }
    }
    return { kind: 'retry', errorCode: 'provider_unavailable' }
  }

  if (
    payment.orderId !== claim.providerOrderId
    || payment.totalAmount !== claim.amount
  ) {
    return { kind: 'manual_review', errorCode: 'provider_evidence_mismatch' }
  }
  if (
    payment.status === 'DONE'
    && typeof payment.paymentKey === 'string'
    && /^[A-Za-z0-9_-]{8,256}$/.test(payment.paymentKey)
  ) {
    return {
      kind: 'verified_paid',
      paymentKeyHash: hashTonightPaymentKey(payment.paymentKey),
    }
  }
  if (
    payment.status === 'CANCELED'
    && payment.balanceAmount === 0
  ) {
    return { kind: 'no_charge' }
  }
  return { kind: 'retry', errorCode: 'provider_unavailable' }
}

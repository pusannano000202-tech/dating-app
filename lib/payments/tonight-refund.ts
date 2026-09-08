import { DEPOSIT_AMOUNT } from '../constants'
import {
  isTonightDepositOrderIdForContext,
} from './tonight-deposit'
import { hashTonightPaymentKey } from './tonight-deposit-server'
import {
  verifyTossRefundEvidence,
  type TossPaymentObject,
} from './toss'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export interface TonightRefundClaim {
  refundRequestId: string
  depositId: string
  applicationId: string
  userId: string
  requestRevision: number
  amount: number
  providerOrderId: string
  providerPaymentKeyHash: string
}

export interface TonightRefundTransport {
  getPaymentByOrderId(orderId: string): Promise<TossPaymentObject>
  cancelPayment(input: {
    paymentKey: string
    cancelReason: string
    cancelAmount: number
    idempotencyKey: string
  }): Promise<TossPaymentObject>
}

export type TonightRefundSettlement =
  | {
      ok: true
      evidence: {
        providerOrderId: string
        providerPaymentKeyHash: string
        providerTransactionKey: string
        refundedAmount: number
      }
    }
  | {
      ok: false
      error: 'provider_unavailable'
      retryable: true
    }
  | {
      ok: false
      error: 'invalid_refund_claim' | 'provider_evidence_mismatch' | 'provider_request_rejected'
      retryable: false
    }

function validClaim(claim: TonightRefundClaim): boolean {
  return UUID_PATTERN.test(claim.refundRequestId)
    && UUID_PATTERN.test(claim.depositId)
    && UUID_PATTERN.test(claim.applicationId)
    && UUID_PATTERN.test(claim.userId)
    && Number.isInteger(claim.requestRevision)
    && claim.requestRevision >= 0
    && claim.amount === DEPOSIT_AMOUNT
    && isTonightDepositOrderIdForContext(
      claim.providerOrderId,
      claim.applicationId,
      claim.userId,
    )
    && SHA256_PATTERN.test(claim.providerPaymentKeyHash)
}

function safeProviderFailure(error: unknown): TonightRefundSettlement {
  const status = error && typeof error === 'object' && 'status' in error
    && typeof error.status === 'number'
    ? error.status
    : null
  // Toss order lookup can briefly return 404 while an approval is becoming
  // queryable. In particular, a deadline worker may already have queued the
  // refund for a reconciliation_required deposit, so do not dead-letter that
  // recoverable race as a permanent provider rejection.
  const retryable = status === null || status === 404 || status === 408 || status === 429 || status >= 500
  return retryable
    ? { ok: false, error: 'provider_unavailable', retryable: true }
    : { ok: false, error: 'provider_request_rejected', retryable: false }
}

function verifiedEvidence(
  claim: TonightRefundClaim,
  payment: TossPaymentObject,
): Extract<TonightRefundSettlement, { ok: true }> | null {
  if (
    payment.orderId !== claim.providerOrderId
    || payment.totalAmount !== claim.amount
    || hashTonightPaymentKey(payment.paymentKey) !== claim.providerPaymentKeyHash
  ) return null

  const evidence = verifyTossRefundEvidence(payment, {
    requestedRefundAmount: claim.amount,
    depositAmount: claim.amount,
  })
  if (!evidence.ok) return null
  return {
    ok: true,
    evidence: {
      providerOrderId: claim.providerOrderId,
      providerPaymentKeyHash: claim.providerPaymentKeyHash,
      providerTransactionKey: evidence.transactionKey,
      refundedAmount: claim.amount,
    },
  }
}

export async function settleTonightRefundWithProvider(
  claim: TonightRefundClaim,
  transport: TonightRefundTransport,
): Promise<TonightRefundSettlement> {
  if (!validClaim(claim)) {
    return { ok: false, error: 'invalid_refund_claim', retryable: false }
  }

  let current: TossPaymentObject
  try {
    current = await transport.getPaymentByOrderId(claim.providerOrderId)
  } catch (error) {
    return safeProviderFailure(error)
  }

  if (
    current.orderId !== claim.providerOrderId
    || current.totalAmount !== claim.amount
    || hashTonightPaymentKey(current.paymentKey) !== claim.providerPaymentKeyHash
  ) {
    return { ok: false, error: 'provider_evidence_mismatch', retryable: false }
  }

  const recovered = verifiedEvidence(claim, current)
  if (recovered) return recovered
  if (
    current.status !== 'DONE'
    || (current.cancels ?? []).some((cancel) => cancel.cancelStatus === 'DONE')
  ) {
    return { ok: false, error: 'provider_evidence_mismatch', retryable: false }
  }

  let cancelled: TossPaymentObject
  try {
    cancelled = await transport.cancelPayment({
      paymentKey: current.paymentKey,
      cancelReason: '오늘밤 보증금 환불',
      cancelAmount: claim.amount,
      idempotencyKey: `tonight-refund-${claim.refundRequestId}-v${claim.requestRevision}`,
    })
  } catch (error) {
    return safeProviderFailure(error)
  }

  return verifiedEvidence(claim, cancelled)
    ?? { ok: false, error: 'provider_evidence_mismatch', retryable: false }
}

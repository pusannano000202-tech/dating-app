import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { getTonightFeatureState } from '@/lib/matching/tonight-ranked/runtime'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import {
  isTonightDepositOrderIdForContext,
} from '@/lib/payments/tonight-deposit'
import {
  buildTonightDepositIdempotencyKey,
  hashTonightPaymentKey,
} from '@/lib/payments/tonight-deposit-server'
import {
  TossPaymentError,
  confirmTossPayment,
  getTossPaymentByOrderId,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import {
  TonightApiInputError,
  asRequiredString,
  asUuid,
  privateJson,
  privateRedirect,
  tonightInputErrorResponse,
} from '@/lib/server/tonight/api-contract'
import {
  chooseTonightDepositProviderAction,
  TonightDepositContextError,
  readTonightDepositCheckoutContext,
  readTonightDepositConfirmationContext,
} from '@/lib/server/tonight/payment-context'
import { buildTonightPaymentReturnUrl } from '@/lib/server/tonight/payment-redirect'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'
import { verifyTonightPaymentReturnState } from '@/lib/payments/tonight-payment-return-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set([
  'provider', 'application_id', 'return_path', 'paymentType', 'paymentKey', 'orderId', 'amount', 'state',
])

export async function GET(request: Request) {
  try {
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'] })
    if (!getTonightFeatureState().cardPaymentsEnabled) {
      return paymentRedirect(request, 'failed', 'payment_unavailable')
    }
    const readiness = getDepositPaymentReadiness('toss')
    if (!readiness.ok) return paymentRedirect(request, 'failed', 'payment_unavailable')

    const query = readConfirmQuery(request)
    const applicationId = asUuid(query.application_id, 'application_id')
    const paymentKey = asRequiredString(query.paymentKey, 'paymentKey', {
      minLength: 8,
      maxLength: 256,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    const orderId = asRequiredString(query.orderId, 'orderId', {
      minLength: 8,
      maxLength: 64,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    if (
      query.provider !== 'toss'
      || (query.paymentType !== undefined && query.paymentType !== 'NORMAL')
    ) {
      throw new TonightApiInputError('invalid_field', 'provider')
    }
    if (!/^\d+$/.test(query.amount ?? '') || Number(query.amount) !== DEPOSIT_AMOUNT) {
      throw new TonightApiInputError('invalid_field', 'amount')
    }
    if (!isTonightDepositOrderIdForContext(orderId, applicationId, userId)) {
      throw new TonightApiInputError('invalid_field', 'orderId')
    }
    const paymentStateSecret = process.env.PAYMENT_INTERNAL_SECRET
    if (
      !paymentStateSecret
      || !verifyTonightPaymentReturnState(query.state ?? '', {
        applicationId,
        userId,
        orderId,
      }, paymentStateSecret)
    ) {
      return privateJson({ error: 'invalid_payment_return_state' }, 400)
    }

    const service = createPaymentServiceClient()
    if (!service) return paymentRedirect(request, 'failed', 'payment_unavailable')

    const paymentKeyHash = hashTonightPaymentKey(paymentKey)
    const activeDeposit = await service
      .from('tonight_deposits')
      .select('id,application_id,user_id,amount,status,provider_order_id,provider_payment_key_hash,revision')
      .eq('application_id', applicationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (activeDeposit.error) return paymentRedirect(request, 'failed', 'payment_reconciliation_required')
    const confirmationContext = readTonightDepositConfirmationContext(activeDeposit.data, {
      applicationId,
      userId,
      orderId,
      paymentKeyHash,
    })
    const supabase = createSupabaseRequestClient(request)
    const current = await supabase.rpc('get_current_tonight_round')
    let checkoutOpen = false
    if (!current.error) {
      try {
        readTonightDepositCheckoutContext(current.data, applicationId)
        checkoutOpen = true
      } catch (error) {
        // The current-round projection is only allowed to authorize a new
        // provider confirm. An exact caller/order/deposit binding above still
        // permits read-only provider recovery after a deadline or cancellation.
        if (!(error instanceof TonightDepositContextError)) throw error
      }
    }
    const providerAction = chooseTonightDepositProviderAction({
      confirmationMode: confirmationContext.mode,
      checkoutOpen,
    })
    if (providerAction === 'already_paid') return paymentRedirect(request, 'paid')

    const payment = providerAction === 'lookup'
      ? await getTossPaymentByOrderId(orderId)
      : await confirmOrRecoverTossPayment({ paymentKey, orderId })
    if (!isVerifiedTonightPayment(payment, { paymentKey, orderId })) {
      if (providerAction === 'confirm') {
        await recordReconciliation(service, { applicationId, userId, orderId, paymentKey })
      }
      return paymentRedirect(request, 'failed', 'payment_reconciliation_required')
    }

    if (
      providerAction === 'lookup'
      && (confirmationContext.mode === 'confirm'
        || confirmationContext.mode === 'recover_cancelled')
      && !await recordLateRecoveryCheckpoint(service, {
        applicationId,
        userId,
        orderId,
        paymentKey,
      })
    ) {
      return paymentRedirect(request, 'failed', 'payment_reconciliation_required')
    }

    const recorded = await service.rpc('service_record_tonight_deposit_result', {
      p_application_id: applicationId,
      p_user_id: userId,
      p_status: 'paid',
      p_provider_order_id: orderId,
      p_provider_payment_key_hash: paymentKeyHash,
      p_amount: DEPOSIT_AMOUNT,
      p_idempotency_key: buildTonightDepositIdempotencyKey('paid', orderId),
    })
    if (recorded.error || !recorded.data) {
      await recordReconciliation(service, { applicationId, userId, orderId, paymentKey })
      return paymentRedirect(request, 'failed', 'payment_reconciliation_required')
    }

    return paymentRedirect(request, 'paid')
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightDepositContextError) {
      const status = error.code === 'tonight_application_not_found'
        ? 404
        : error.code === 'invalid_tonight_context' ? 503 : 409
      return privateJson({ error: error.code }, status)
    }
    if (error instanceof TossPaymentError) {
      return paymentRedirect(request, 'failed', error.status >= 500
        ? 'payment_reconciliation_required'
        : 'payment_failed')
    }
    return tonightInputErrorResponse(error)
  }
}

function readConfirmQuery(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams
  for (const key of params.keys()) {
    if (!QUERY_KEYS.has(key) || params.getAll(key).length !== 1) {
      throw new TonightApiInputError('unexpected_field', key)
    }
  }
  const result: Record<string, string> = {}
  for (const key of QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) result[key] = value
  }
  return result
}

async function confirmOrRecoverTossPayment(params: {
  paymentKey: string
  orderId: string
}): Promise<TossPaymentObject> {
  try {
    return await confirmTossPayment({
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      amount: DEPOSIT_AMOUNT,
      idempotencyKey: `tonight-confirm-${params.orderId}`,
    })
  } catch (error) {
    if (!(error instanceof TossPaymentError)) throw error

    // Toss can answer a retried confirm with a 4xx even though the first
    // request was approved. Re-read by our database-owned order before
    // treating any provider error as final; only an exact DONE payment is
    // recoverable, and the original provider error wins otherwise.
    try {
      const current = await getTossPaymentByOrderId(params.orderId)
      if (isVerifiedTonightPayment(current, params)) return current
    } catch {
      // Preserve the original confirm failure classification below.
    }
    throw error
  }
}

function isVerifiedTonightPayment(
  payment: TossPaymentObject,
  expected: { paymentKey: string; orderId: string },
): boolean {
  return payment.paymentKey === expected.paymentKey
    && payment.orderId === expected.orderId
    && payment.totalAmount === DEPOSIT_AMOUNT
    && payment.status === 'DONE'
}

async function recordReconciliation(
  service: NonNullable<ReturnType<typeof createPaymentServiceClient>>,
  params: { applicationId: string; userId: string; orderId: string; paymentKey: string },
): Promise<void> {
  await service.rpc('service_record_tonight_deposit_result', {
    p_application_id: params.applicationId,
    p_user_id: params.userId,
    p_status: 'reconciliation_required',
    p_provider_order_id: params.orderId,
    p_provider_payment_key_hash: hashTonightPaymentKey(params.paymentKey),
    p_amount: DEPOSIT_AMOUNT,
    p_idempotency_key: buildTonightDepositIdempotencyKey('reconciliation_required', params.orderId),
  })
}

async function recordLateRecoveryCheckpoint(
  service: NonNullable<ReturnType<typeof createPaymentServiceClient>>,
  params: { applicationId: string; userId: string; orderId: string; paymentKey: string },
): Promise<boolean> {
  const result = await service.rpc('service_record_tonight_deposit_result', {
    p_application_id: params.applicationId,
    p_user_id: params.userId,
    p_status: 'reconciliation_required',
    p_provider_order_id: params.orderId,
    p_provider_payment_key_hash: hashTonightPaymentKey(params.paymentKey),
    p_amount: DEPOSIT_AMOUNT,
    p_idempotency_key: buildTonightDepositIdempotencyKey(
      'reconciliation_required',
      params.orderId,
    ),
  })
  return !result.error && typeof result.data === 'string'
}

function paymentRedirect(
  request: Request,
  status: 'paid' | 'failed',
  reason?: 'payment_unavailable' | 'payment_reconciliation_required' | 'payment_failed',
): Response {
  const origin = getPublicAppOrigin()
  if (!origin) return privateJson({ error: 'service_unavailable' }, 503)
  return privateRedirect(buildTonightPaymentReturnUrl({
    configuredOrigin: origin,
    requestUrl: request.url,
    status,
    reason,
  }))
}

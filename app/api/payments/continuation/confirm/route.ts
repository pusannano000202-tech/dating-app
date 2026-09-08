import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import {
  isContinuationReturnPath,
  isVerifiedContinuationTossPayment,
} from '@/lib/payments/continuation-fee'
import {
  decideContinuationFeeVerificationStart,
  readContinuationFeeOrder,
  type ContinuationFeeOrderProjection,
} from '@/lib/payments/continuation-fee-api'
import { getContinuationFeeProviderAvailability } from '@/lib/payments/continuation-fee-provider'
import { verifyContinuationFeeReturnState } from '@/lib/payments/continuation-fee-return-state'
import {
  continuationProviderEventId,
  continuationProviderTransactionId,
  hashContinuationPaymentKey,
} from '@/lib/payments/continuation-fee-server'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  TossPaymentError,
  confirmTossPayment,
  getTossPaymentByOrderId,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import { asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set([
  'provider', 'fee_order_id', 'return_path', 'paymentType', 'paymentKey', 'orderId', 'amount', 'state',
])

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const availability = getContinuationFeeProviderAvailability()
    if (!availability.available || availability.provider !== 'local_verified_simulator') {
      return continuationJson({ error: 'local_simulator_disabled' }, 409)
    }
    const body = await readStrictJson(request, ['order_id', 'idempotency_key'])
    const orderId = asUuid(body.order_id, 'order_id')
    const eventId = asUuid(body.idempotency_key, 'idempotency_key')
    const order = await getOwnedOrder(request, orderId)
    if (!order || order.ownerUserId !== userId || order.provider !== 'local_verified_simulator') {
      return continuationJson({ error: 'invalid_payment_context' }, 409)
    }
    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
    const result = await service.rpc('confirm_my_continuation_fee_for_service', {
      p_order_id: order.orderId,
      p_owner_user_id: order.ownerUserId,
      p_transition_id: order.transitionId,
      p_purpose: order.purpose,
      p_provider: order.provider,
      p_provider_event_id: `local:${eventId}`,
      p_provider_transaction_id: `local:${order.orderId}`,
      p_amount_krw: order.amountKrw,
      p_currency: order.currency,
      p_provider_verified: true,
    })
    if (result.error) return continuationRpcErrorResponse(result.error)
    return continuationJson({ result: result.data, live_charge_created: false })
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function GET(request: Request) {
  let returnPath: string | null = null
  try {
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const query = readConfirmQuery(request)
    returnPath = query.return_path ?? null
    if (query.provider !== 'toss_sandbox' || !isContinuationReturnPath(returnPath)) {
      return continuationJson({ error: 'invalid_payment_context' }, 400)
    }
    const orderId = asUuid(query.fee_order_id, 'fee_order_id')
    const paymentKey = asRequiredString(query.paymentKey, 'paymentKey', {
      minLength: 8,
      maxLength: 256,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    const providerOrderId = asRequiredString(query.orderId, 'orderId', {
      minLength: 8,
      maxLength: 64,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    if ((query.paymentType !== undefined && query.paymentType !== 'NORMAL')
      || !/^\d+$/.test(query.amount ?? '') || Number(query.amount) !== 1000) {
      return continuationJson({ error: 'invalid_payment_context' }, 400)
    }
    const order = await getOwnedOrder(request, orderId)
    if (!order || order.ownerUserId !== userId || order.provider !== 'toss_sandbox'
      || order.providerOrderId !== providerOrderId) {
      return continuationJson({ error: 'invalid_payment_context' }, 409)
    }
    const stateSecret = process.env.PAYMENT_INTERNAL_SECRET
    if (!stateSecret || !verifyContinuationFeeReturnState(query.state ?? '', {
      orderId: order.orderId,
      providerOrderId: order.providerOrderId,
      ownerUserId: order.ownerUserId,
      transitionId: order.transitionId,
      purpose: order.purpose,
      returnPath,
    }, stateSecret)) {
      return continuationJson({ error: 'invalid_payment_return_state' }, 400)
    }
    if (order.status === 'verified') return paymentRedirect(returnPath, 'paid')

    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
    const started = await service.rpc('begin_continuation_fee_verification_for_service', {
      p_order_id: order.orderId,
      p_owner_user_id: order.ownerUserId,
      p_provider: order.provider,
      p_provider_order_id: order.providerOrderId,
    })
    if (started.error) return continuationRpcErrorResponse(started.error)
    const startDecision = decideContinuationFeeVerificationStart(started.data)
    if (startDecision === 'paid') return paymentRedirect(returnPath, 'paid')
    if (startDecision === 'recovery_required') {
      return paymentRedirect(returnPath, 'recovery_required')
    }
    if (startDecision !== 'verify_provider') {
      return continuationJson({ error: 'invalid_payment_state' }, 503)
    }

    let payment: TossPaymentObject
    try {
      payment = await confirmOrRecoverTossPayment({ paymentKey, providerOrderId })
    } catch (error) {
      await queueRecovery(service, order, error instanceof TossPaymentError ? error.code : 'provider_unavailable')
      return paymentRedirect(returnPath, 'recovery_required')
    }
    if (!isVerifiedContinuationTossPayment(payment, { paymentKey, providerOrderId })) {
      await queueRecovery(service, order, 'provider_evidence_mismatch')
      return paymentRedirect(returnPath, 'recovery_required')
    }
    const paymentKeyHash = hashContinuationPaymentKey(paymentKey)
    const confirmed = await service.rpc('confirm_my_continuation_fee_for_service', {
      p_order_id: order.orderId,
      p_owner_user_id: order.ownerUserId,
      p_transition_id: order.transitionId,
      p_purpose: order.purpose,
      p_provider: order.provider,
      p_provider_event_id: continuationProviderEventId(paymentKeyHash),
      p_provider_transaction_id: continuationProviderTransactionId(paymentKeyHash),
      p_amount_krw: order.amountKrw,
      p_currency: order.currency,
      p_provider_verified: true,
    })
    if (confirmed.error) {
      await queueRecovery(service, order, 'record_unavailable')
      return paymentRedirect(returnPath, 'recovery_required')
    }
    const result = confirmed.data && typeof confirmed.data === 'object' && !Array.isArray(confirmed.data)
      ? confirmed.data as Record<string, unknown>
      : null
    return paymentRedirect(returnPath, result?.recovery_required === true ? 'recovery_required' : 'paid')
  } catch (error) {
    if (returnPath && isContinuationReturnPath(returnPath)) {
      return paymentRedirect(returnPath, 'failed')
    }
    return continuationRouteErrorResponse(error)
  }
}

async function getOwnedOrder(request: Request, orderId: string) {
  const supabase = createSupabaseRequestClient(request)
  const result = await supabase.rpc('get_my_continuation_fee_order', { p_order_id: orderId })
  if (result.error) return null
  return readContinuationFeeOrder(result.data)
}

async function confirmOrRecoverTossPayment(params: {
  paymentKey: string
  providerOrderId: string
}): Promise<TossPaymentObject> {
  try {
    return await confirmTossPayment({
      paymentKey: params.paymentKey,
      orderId: params.providerOrderId,
      amount: 1000,
      idempotencyKey: `continuation-confirm-${params.providerOrderId}`,
    })
  } catch (error) {
    if (!(error instanceof TossPaymentError)) throw error
    try {
      const current = await getTossPaymentByOrderId(params.providerOrderId)
      if (isVerifiedContinuationTossPayment(current, params)) return current
    } catch {
      // Preserve the original provider failure; the recovery worker owns retry.
    }
    throw error
  }
}

async function queueRecovery(
  service: NonNullable<ReturnType<typeof createPaymentServiceClient>>,
  order: ContinuationFeeOrderProjection,
  reason: string,
) {
  const safeReason = /^[A-Za-z0-9_-]{1,80}$/.test(reason) ? reason : 'provider_unavailable'
  await service.rpc('queue_continuation_fee_recovery_for_service', {
    p_order_id: order.orderId,
    p_reason: safeReason,
    p_desired_action: 'reconcile',
    p_request_key: `callback:${order.orderId}:${safeReason}`,
  })
}

function readConfirmQuery(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams
  for (const key of params.keys()) {
    if (!QUERY_KEYS.has(key) || params.getAll(key).length !== 1) {
      throw new TypeError('invalid_payment_context')
    }
  }
  const result: Record<string, string> = {}
  for (const key of QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) result[key] = value
  }
  return result
}

function paymentRedirect(
  returnPath: string,
  status: 'paid' | 'failed' | 'recovery_required',
): Response {
  const origin = getPublicAppOrigin()
  if (!origin) return continuationJson({ error: 'service_unavailable' }, 503)
  const target = new URL(returnPath, origin)
  target.searchParams.set('continuation_payment', status)
  return new Response(null, { status: 303, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } })
}

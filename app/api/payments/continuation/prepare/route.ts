import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import {
  buildContinuationFeeCheckoutDraft,
  isContinuationReturnPath,
} from '@/lib/payments/continuation-fee'
import { readContinuationFeeOrder } from '@/lib/payments/continuation-fee-api'
import { getContinuationFeeProviderAvailability } from '@/lib/payments/continuation-fee-provider'
import { signContinuationFeeReturnState } from '@/lib/payments/continuation-fee-return-state'
import { buildContinuationFeeCustomerKey } from '@/lib/payments/continuation-fee-server'
import { asOptionalString, asOptionalUuid, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, [
      'transition_id', 'purpose', 'target_user_id', 'provider', 'idempotency_key', 'return_path',
    ])
    const transitionId = asUuid(body.transition_id, 'transition_id')
    const purpose = asRequiredString(body.purpose, 'purpose', { maxLength: 32 })
    const provider = asRequiredString(body.provider, 'provider', { maxLength: 40 })
    if (purpose !== 'next_occurrence' && purpose !== 'friend_request') {
      return continuationJson({ error: 'invalid_payment_context' }, 422)
    }
    const availability = getContinuationFeeProviderAvailability()
    if (!availability.available || provider !== availability.provider) {
      return continuationJson({ error: 'payment_unavailable' }, 503)
    }
    const requestedReturnPath = asOptionalString(body.return_path, 'return_path', { maxLength: 160 })
    const returnPath = requestedReturnPath ?? `/match/series/${transitionId}`
    if (!isContinuationReturnPath(returnPath)) {
      return continuationJson({ error: 'invalid_payment_context' }, 422)
    }

    const supabase = createSupabaseRequestClient(request)
    const prepared = await supabase.rpc('prepare_my_continuation_fee', {
      p_transition_id: transitionId,
      p_purpose: purpose,
      p_target_user_id: asOptionalUuid(body.target_user_id, 'target_user_id'),
      p_provider: provider,
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (prepared.error) return continuationRpcErrorResponse(prepared.error)
    if (!isRecord(prepared.data) || typeof prepared.data.order_id !== 'string') {
      return continuationJson({ error: 'invalid_payment_context' }, 503)
    }
    const projected = await supabase.rpc('get_my_continuation_fee_order', {
      p_order_id: prepared.data.order_id,
    })
    if (projected.error) return continuationRpcErrorResponse(projected.error)
    const order = readContinuationFeeOrder(projected.data)
    if (!order || order.ownerUserId !== userId || order.transitionId !== transitionId
      || order.purpose !== purpose || order.provider !== provider) {
      return continuationJson({ error: 'invalid_payment_context' }, 503)
    }
    if (order.status !== 'prepared' || Date.parse(order.checkoutExpiresAt) <= Date.now()) {
      return continuationJson({ error: 'payment_order_expired' }, 409)
    }
    if (provider === 'local_verified_simulator') {
      return continuationJson({ order: publicOrder(order), provider, local_only: true, checkout: null }, 201)
    }

    const origin = getPublicAppOrigin()
    const stateSecret = process.env.PAYMENT_INTERNAL_SECRET
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!origin || !stateSecret || !clientKey || !clientKey.startsWith('test_')) {
      return continuationJson({ error: 'payment_unavailable' }, 503)
    }
    const stateContext = {
      orderId: order.orderId,
      providerOrderId: order.providerOrderId,
      ownerUserId: order.ownerUserId,
      transitionId: order.transitionId,
      purpose: order.purpose,
      returnPath,
    }
    const state = signContinuationFeeReturnState(stateContext, stateSecret)
    const draft = buildContinuationFeeCheckoutDraft({ ...stateContext, origin, state })
    return continuationJson({
      order: publicOrder(order),
      provider,
      local_only: false,
      checkout: {
        provider: 'toss',
        clientKey,
        customerKey: buildContinuationFeeCustomerKey(userId),
        amount: draft.amount,
        orderId: draft.orderId,
        orderName: draft.orderName,
        successUrl: draft.successUrl,
        failUrl: draft.failUrl,
        method: draft.method,
      },
    }, 201)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

function publicOrder(order: ReturnType<typeof readContinuationFeeOrder> & {}) {
  return {
    order_id: order.orderId,
    transition_id: order.transitionId,
    purpose: order.purpose,
    provider: order.provider,
    amount_krw: order.amountKrw,
    currency: order.currency,
    status: order.status,
    checkout_expires_at: order.checkoutExpiresAt,
    revision: order.revision,
  }
}

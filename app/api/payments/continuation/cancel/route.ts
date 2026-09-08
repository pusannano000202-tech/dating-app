import { randomUUID } from 'node:crypto'

import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { isContinuationReturnPath } from '@/lib/payments/continuation-fee'
import { readContinuationFeeOrder } from '@/lib/payments/continuation-fee-api'
import { verifyContinuationFeeReturnState } from '@/lib/payments/continuation-fee-return-state'
import { asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set([
  'provider', 'fee_order_id', 'return_path', 'reason', 'code', 'message',
  'orderId', 'paymentType', 'state',
])

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['order_id', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const result = await supabase.rpc('cancel_my_continuation_fee', {
      p_order_id: asUuid(body.order_id, 'order_id'),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (result.error) return continuationRpcErrorResponse(result.error)
    return continuationJson({ result: result.data })
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function GET(request: Request) {
  let returnPath: string | null = null
  try {
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const params = new URL(request.url).searchParams
    for (const key of params.keys()) {
      if (!QUERY_KEYS.has(key) || params.getAll(key).length !== 1) {
        return continuationJson({ error: 'invalid_payment_context' }, 400)
      }
    }
    returnPath = params.get('return_path')
    if (params.get('provider') !== 'toss_sandbox' || !isContinuationReturnPath(returnPath)) {
      return continuationJson({ error: 'invalid_payment_context' }, 400)
    }
    const orderId = asUuid(params.get('fee_order_id'), 'fee_order_id')
    const providerOrderId = asRequiredString(params.get('orderId'), 'orderId', {
      minLength: 8,
      maxLength: 64,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    const supabase = createSupabaseRequestClient(request)
    const projection = await supabase.rpc('get_my_continuation_fee_order', { p_order_id: orderId })
    if (projection.error) return continuationRpcErrorResponse(projection.error)
    const order = readContinuationFeeOrder(projection.data)
    if (!order || order.ownerUserId !== userId || order.provider !== 'toss_sandbox'
      || order.providerOrderId !== providerOrderId) {
      return continuationJson({ error: 'invalid_payment_context' }, 409)
    }
    const secret = process.env.PAYMENT_INTERNAL_SECRET
    if (!secret || !verifyContinuationFeeReturnState(params.get('state') ?? '', {
      orderId: order.orderId,
      providerOrderId: order.providerOrderId,
      ownerUserId: order.ownerUserId,
      transitionId: order.transitionId,
      purpose: order.purpose,
      returnPath,
    }, secret)) {
      return continuationJson({ error: 'invalid_payment_return_state' }, 400)
    }
    const cancelled = await supabase.rpc('cancel_my_continuation_fee', {
      p_order_id: order.orderId,
      p_idempotency_key: randomUUID(),
    })
    if (cancelled.error) return continuationRpcErrorResponse(cancelled.error)
    return paymentRedirect(returnPath, 'cancelled')
  } catch (error) {
    if (returnPath && isContinuationReturnPath(returnPath)) return paymentRedirect(returnPath, 'failed')
    return continuationRouteErrorResponse(error)
  }
}

function paymentRedirect(returnPath: string, status: 'cancelled' | 'failed') {
  const origin = getPublicAppOrigin()
  if (!origin) return continuationJson({ error: 'service_unavailable' }, 503)
  const target = new URL(returnPath, origin)
  target.searchParams.set('continuation_payment', status)
  return new Response(null, { status: 303, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } })
}

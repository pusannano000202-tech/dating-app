import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { getTonightFeatureState } from '@/lib/matching/tonight-ranked/runtime'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import {
  buildTonightDepositCustomerKey,
  buildTonightDepositPaymentRequestDraft,
  isTonightDepositOrderIdForContext,
  normalizeTonightDepositReturnPath,
} from '@/lib/payments/tonight-deposit'
import { buildTonightDepositOrderId } from '@/lib/payments/tonight-deposit-server'
import {
  asIdempotencyKey,
  asOptionalString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import {
  TonightDepositContextError,
  readTonightDepositCheckoutContext,
} from '@/lib/server/tonight/payment-context'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'
import { isTonightNoShowForfeitPolicyApproved } from '@/lib/server/tonight/deposit-resolution-policy'
import {
  TONIGHT_DEPOSIT_POLICY_HASH,
  TONIGHT_DEPOSIT_POLICY_VERSION,
} from '@/lib/payments/tonight-deposit-policy'
import { signTonightPaymentReturnState } from '@/lib/payments/tonight-payment-return-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'] })
    if (
      !getTonightFeatureState().cardPaymentsEnabled
      || !isTonightNoShowForfeitPolicyApproved()
    ) {
      return privateJson({ error: 'payment_unavailable' }, 503)
    }
    const readiness = getDepositPaymentReadiness('toss')
    if (!readiness.ok) return privateJson({ error: 'payment_unavailable' }, 503)

    const body = await readStrictJson(request, [
      'application_id', 'deposit_policy_accepted', 'deposit_policy_version', 'deposit_policy_hash',
      'idempotency_key', 'return_path',
    ])
    const applicationId = asUuid(body.application_id, 'application_id')
    if (
      body.deposit_policy_accepted !== true
      || body.deposit_policy_version !== TONIGHT_DEPOSIT_POLICY_VERSION
      || body.deposit_policy_hash !== TONIGHT_DEPOSIT_POLICY_HASH
    ) {
      return privateJson({ error: 'deposit_policy_acceptance_required' }, 422)
    }
    const idempotencyKey = asIdempotencyKey(body.idempotency_key)
    const returnPath = normalizeTonightDepositReturnPath(asOptionalString(
      body.return_path,
      'return_path',
      { maxLength: 256 },
    ))

    const supabase = createSupabaseRequestClient(request)
    const current = await supabase.rpc('get_current_tonight_round')
    if (current.error) return tonightRpcErrorResponse(current.error)
    readTonightDepositCheckoutContext(current.data, applicationId)
    const accepted = await supabase.rpc('accept_tonight_deposit_policy', {
      p_application_id: applicationId,
      p_policy_version: TONIGHT_DEPOSIT_POLICY_VERSION,
      p_policy_hash: TONIGHT_DEPOSIT_POLICY_HASH,
      p_accepted: true,
    })
    if (accepted.error) return tonightRpcErrorResponse(accepted.error)

    const origin = getPublicAppOrigin()
    if (!origin) return privateJson({ error: 'service_unavailable' }, 503)
    const proposedOrderId = buildTonightDepositOrderId({ applicationId, userId, idempotencyKey })
    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'payment_unavailable' }, 503)
    const prepared = await service.rpc('service_prepare_tonight_deposit', {
      p_application_id: applicationId,
      p_user_id: userId,
      p_proposed_order_id: proposedOrderId,
      p_amount: DEPOSIT_AMOUNT,
      p_idempotency_key: idempotencyKey,
    })
    if (prepared.error) return tonightRpcErrorResponse(prepared.error)
    const preparedOrderId = readPreparedOrderId(prepared.data, applicationId, userId)
    const paymentStateSecret = process.env.PAYMENT_INTERNAL_SECRET
    if (!paymentStateSecret) return privateJson({ error: 'payment_unavailable' }, 503)
    const paymentState = signTonightPaymentReturnState({
      applicationId,
      userId,
      orderId: preparedOrderId,
    }, paymentStateSecret)
    const draft = buildTonightDepositPaymentRequestDraft({
      provider: 'toss',
      applicationId,
      userId,
      origin,
      orderId: preparedOrderId,
      returnPath,
      paymentState,
    })
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) return privateJson({ error: 'payment_unavailable' }, 503)

    return privateJson({
      provider: 'toss',
      checkout: {
        clientKey,
        customerKey: buildTonightDepositCustomerKey(userId),
        amount: draft.amount,
        orderId: draft.orderId,
        orderName: draft.orderName,
        successUrl: draft.successUrl,
        failUrl: draft.failUrl,
        method: 'CARD',
      },
    }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightDepositContextError) {
      const status = error.code === 'tonight_application_not_found'
        ? 404
        : error.code === 'invalid_tonight_context' ? 503 : 409
      return privateJson({ error: error.code }, status)
    }
    return tonightInputErrorResponse(error)
  }
}

function readPreparedOrderId(
  value: unknown,
  applicationId: string,
  userId: string,
): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TonightDepositContextError('invalid_tonight_context')
  }
  const row = value as Record<string, unknown>
  const preparedOrderId = row.provider_order_id
  if (
    row.status !== 'pending'
    || typeof preparedOrderId !== 'string'
    || !isTonightDepositOrderIdForContext(preparedOrderId, applicationId, userId)
  ) {
    throw new TonightDepositContextError('deposit_not_payable')
  }
  // The provider order has to stay bound to the same application and caller;
  // a service response can never authorize a checkout for another identity.
  return preparedOrderId
}

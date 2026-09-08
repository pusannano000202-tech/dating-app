import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import {
  TonightApiInputError,
  asRequiredString,
  asUuid,
  privateJson,
  privateRedirect,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { isTonightDepositOrderIdForContext } from '@/lib/payments/tonight-deposit'
import { buildTonightDepositIdempotencyKey } from '@/lib/payments/tonight-deposit-server'
import {
  TonightDepositContextError,
  readTonightDepositCancellationContext,
} from '@/lib/server/tonight/payment-context'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { buildTonightPaymentReturnUrl } from '@/lib/server/tonight/payment-redirect'
import { getPublicAppOrigin } from '@/lib/utils'
import { verifyTonightPaymentReturnState } from '@/lib/payments/tonight-payment-return-state'

export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set([
  'provider', 'application_id', 'return_path', 'reason', 'code', 'message', 'orderId', 'paymentType', 'state',
])

export async function GET(request: Request) {
  try {
    const { userId } = await requireRequestAccess(request, { allowedRoles: ['user'] })
    const url = new URL(request.url)
    for (const key of url.searchParams.keys()) {
      if (!QUERY_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) {
        throw new TonightApiInputError('unexpected_field', key)
      }
    }
    if (url.searchParams.get('provider') !== 'toss') {
      throw new TonightApiInputError('invalid_field', 'provider')
    }
    const applicationId = asUuid(url.searchParams.get('application_id'), 'application_id')
    const orderId = asRequiredString(url.searchParams.get('orderId'), 'orderId', {
      minLength: 8,
      maxLength: 64,
      pattern: /^[A-Za-z0-9_-]+$/,
    })
    const paymentType = url.searchParams.get('paymentType')
    if (paymentType !== null && paymentType !== 'NORMAL') {
      throw new TonightApiInputError('invalid_field', 'paymentType')
    }
    if (!isTonightDepositOrderIdForContext(orderId, applicationId, userId)) {
      throw new TonightApiInputError('invalid_field', 'orderId')
    }
    const paymentStateSecret = process.env.PAYMENT_INTERNAL_SECRET
    if (
      !paymentStateSecret
      || !verifyTonightPaymentReturnState(url.searchParams.get('state') ?? '', {
        applicationId,
        userId,
        orderId,
      }, paymentStateSecret)
    ) {
      return privateJson({ error: 'invalid_payment_return_state' }, 400)
    }

    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)
    const activeDeposit = await service
      .from('tonight_deposits')
      .select('id,application_id,user_id,amount,status,provider_order_id,provider_payment_key_hash,revision')
      .eq('application_id', applicationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (activeDeposit.error) return privateJson({ error: 'service_unavailable' }, 503)
    const cancellation = readTonightDepositCancellationContext(activeDeposit.data, {
      applicationId,
      userId,
      orderId,
    })

    const supabase = createSupabaseRequestClient(request)
    if (!cancellation.alreadyCancelled) {
      const current = await supabase.rpc('get_current_tonight_round')
      if (current.error) return tonightRpcErrorResponse(current.error)
      const application = current.data
        && typeof current.data === 'object'
        && !Array.isArray(current.data)
        && 'application' in current.data
        && current.data.application
        && typeof current.data.application === 'object'
        && !Array.isArray(current.data.application)
        ? current.data.application as Record<string, unknown>
        : null
      if (application?.id !== applicationId) return privateJson({ error: 'not_found' }, 404)

      const recorded = await service.rpc('service_record_tonight_deposit_result', {
        p_application_id: applicationId,
        p_user_id: userId,
        p_status: 'cancelled',
        p_provider_order_id: orderId,
        p_provider_payment_key_hash: null,
        p_amount: DEPOSIT_AMOUNT,
        p_idempotency_key: buildTonightDepositIdempotencyKey('cancelled', orderId),
      })
      if (recorded.error || recorded.data !== cancellation.depositId) {
        return tonightRpcErrorResponse(recorded.error ?? { message: 'deposit_result_conflict' })
      }
    }

    const origin = getPublicAppOrigin()
    if (!origin) return privateJson({ error: 'service_unavailable' }, 503)
    return privateRedirect(buildTonightPaymentReturnUrl({
      configuredOrigin: origin,
      requestUrl: request.url,
      status: 'cancelled',
      reason: 'checkout_cancelled',
    }))
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightDepositContextError) {
      return privateJson({ error: error.code }, error.code === 'deposit_not_payable' ? 409 : 503)
    }
    return tonightInputErrorResponse(error)
  }
}

import { requireRequestAccess, requestGuardErrorResponse } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { isRecentAccountAuthentication } from '@/lib/account/deletion-contract'
import { AdmissionServerError } from './admission-server'
import { nativeAdmissionBody } from './native-admission-http'
import { meetupJson } from './http'
import { parseAdmissionRefundSummary, refundUuid, type RefundRpc } from './admission-refund'

const safeErrors: Record<string, number> = {
  refund_not_found: 404, refund_not_available: 409, refund_request_conflict: 409,
  refund_reconciliation_required: 409, refund_owner_unavailable: 409,
  super_admin_required: 403, not_authenticated: 401,
  refund_attempts_exhausted: 409, refund_lease_active: 409,
  refund_state_conflict: 409, refund_not_approved: 409,
}
function responseError(error: unknown) {
  if (error instanceof AdmissionServerError) return meetupJson({ error: error.code }, error.status)
  return requestGuardErrorResponse(error)
}
async function rpc(client: RefundRpc, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    const code = typeof error === 'object' && 'message' in error ? String(error.message) : ''
    throw new AdmissionServerError(Object.hasOwn(safeErrors, code) ? code : 'refund_service_unavailable', safeErrors[code] ?? 503)
  }
  return data
}
export async function admissionRefundList(request: Request, admin = false) {
  try {
    const { userId } = await requireRequestAccess(request, admin ? { allowedRoles: ['super_admin'], requireRecentAuth: true } : {})
    const client = admin ? createPaymentServiceClient() : createSupabaseRequestClient(request)
    if (!client) throw new AdmissionServerError('refund_service_unavailable', 503)
    const data = await rpc(client, admin ? 'list_meetup_admission_refunds_for_service' : 'list_my_meetup_admission_refunds', admin ? { p_actor: userId } : {})
    if (!Array.isArray(data)) throw new AdmissionServerError('refund_response_invalid', 503)
    const refunds = data.map(parseAdmissionRefundSummary)
    if (refunds.some(row => !row)) throw new AdmissionServerError('refund_response_invalid', 503)
    return meetupJson({ accountKey: userId, refunds })
  } catch (error) { return responseError(error) }
}
export async function admissionRefundMutation(request: Request, admin = false) {
  try {
    // requireRecentAuth on the shared guard verifies a super-admin session.
    // Members use the existing account-level, server-verified sign-in check.
    const { userId } = await requireRequestAccess(request, admin ? { allowedRoles: ['super_admin'], requireRecentAuth: true } : {})
    if (request.headers.get('x-quantum-owner') !== userId) throw new AdmissionServerError('account_changed', 409)
    const userClient = createSupabaseRequestClient(request)
    if (!admin) {
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user || user.id !== userId) throw new AdmissionServerError('account_changed', 409)
      if (!isRecentAccountAuthentication(user.last_sign_in_at)) throw new AdmissionServerError('reauthentication_required', 403)
    }
    const body = await nativeAdmissionBody(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdmissionServerError('invalid_request', 400)
    const value = body as Record<string, unknown>, allowed = admin ? ['depositId', 'requestId', 'action'] : ['depositId']
    if (Object.keys(value).some(k => !allowed.includes(k)) || !refundUuid(value.depositId)
      || admin && (!refundUuid(value.requestId) || !['approve', 'retry'].includes(String(value.action)))) throw new AdmissionServerError('invalid_request', 400)
    const client = admin ? createPaymentServiceClient() : userClient
    if (!client) throw new AdmissionServerError('refund_service_unavailable', 503)
    const data = await rpc(client, admin ? 'review_meetup_admission_refund_for_service' : 'request_my_meetup_admission_refund', admin
      ? { p_actor: userId, p_deposit_id: value.depositId, p_request_id: value.requestId, p_action: value.action }
      : { p_deposit_id: value.depositId })
    const refund = parseAdmissionRefundSummary(data)
    if (!refund || refund.depositId !== value.depositId || admin && refund.requestId !== value.requestId) throw new AdmissionServerError('refund_response_invalid', 503)
    return meetupJson({ accountKey: userId, refund })
  } catch (error) { return responseError(error) }
}

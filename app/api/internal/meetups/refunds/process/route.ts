import { randomUUID } from 'node:crypto'
import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { getTossPaymentByOrderId, cancelTossPayment } from '@/lib/payments/toss'
import { meetupRefundConfig, processAdmissionRefundClaim } from '@/lib/meetups/admission-refund'
import { meetupJson } from '@/lib/meetups/http'

export const maxDuration = 60
export const runtime = 'nodejs'
/** Explicitly activated by an operator; no scheduler or live key is enabled here. */
export async function POST(request: Request) {
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) return meetupJson({ error: 'unauthorized' }, 401)
  const config = meetupRefundConfig(process.env)
  if (!config.ready || !config.mode) return meetupJson({ error: 'refund_worker_disabled' }, 503)
  const service = createPaymentServiceClient()
  if (!service) return meetupJson({ error: 'refund_service_unavailable' }, 503)
  try {
    const leaseId = randomUUID()
    // Two parallel items bound the provider timeout budget below maxDuration.
    const { data, error } = await service.rpc('claim_meetup_admission_refunds_for_service', { p_lease_id: leaseId, p_limit: 2, p_provider_mode: config.mode })
    if (error || !Array.isArray(data) || data.length > 2) return meetupJson({ error: 'refund_claim_unavailable' }, 503)
    const transport = { mode: config.mode, lookup: getTossPaymentByOrderId, cancel: cancelTossPayment }
    const results = await Promise.all(data.map(value => processAdmissionRefundClaim(service, value, leaseId, transport)))
    return meetupJson({ claimed: data.length, completed: results.filter(v => v === 'completed').length,
      deferred: results.filter(v => v === 'deferred').length, reconciliation: results.filter(v => v === 'reconciliation' || v === 'invalid').length })
  } catch { return meetupJson({ error: 'refund_processing_unavailable' }, 503) }
}

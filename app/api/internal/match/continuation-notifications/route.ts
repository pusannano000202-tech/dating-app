import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationJson } from '@/lib/matching/continuation-api'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'

export async function GET(request: Request) {
  return processQueue(request, process.env.CRON_SECRET)
}

export async function POST(request: Request) {
  return processQueue(request, process.env.CONTINUATION_INTERNAL_SECRET)
}

async function processQueue(request: Request, secret: string | undefined) {
  if (!secret) return continuationJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return continuationJson({ error: 'forbidden' }, 403)
  }
  const service = createPaymentServiceClient()
  if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
  const now = new Date().toISOString()
  const sweep = await service.rpc('service_sweep_continuation_deadlines', {
    p_now: now,
    p_limit: 100,
  })
  if (sweep.error) return continuationJson({ error: 'service_unavailable' }, 503)
  const notifications = await service.rpc('deliver_continuation_notifications_for_service', {
    p_limit: 100,
    p_now: now,
  })
  if (notifications.error) return continuationJson({ error: 'service_unavailable' }, 503)
  const friends = await service.rpc('deliver_continuation_friend_entitlements_for_service', {
    p_limit: 100,
  })
  if (friends.error) return continuationJson({ error: 'service_unavailable' }, 503)
  return continuationJson({
    sweep: sweep.data,
    notifications: notifications.data,
    friend_requests: friends.data,
  })
}

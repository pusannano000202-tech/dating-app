import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import {
  classifyTonightPushError,
  getTonightWebPushConfig,
  isTonightWebPushReady,
  type TonightOutboxClaim,
  type TonightPushDelivery,
} from '@/lib/notifications/tonight-contract'
import { sendTonightPush } from '@/lib/notifications/tonight-web-push.server'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { privateJson } from '@/lib/server/tonight/api-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OUTBOX_BATCH_SIZE = 1_000
const MAX_OUTBOX_BATCHES = 10
const PUSH_BATCH_SIZE = 500
const MAX_PUSH_BATCHES = 20
const PUSH_CONCURRENCY = 100
const WORKER_TIME_BUDGET_MS = 50_000

export async function GET(request: Request) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)
  try {
    const swept = await service.rpc('service_sweep_tonight_terminal_worker_claims', {
      p_now: new Date().toISOString(),
    })
    if (swept.error) return privateJson({ error: 'service_unavailable' }, 503)
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  const now = new Date().toISOString()
  const enqueued = await service.rpc('enqueue_due_tonight_notifications', { p_now: now })
  if (enqueued.error) return privateJson({ error: 'notification_enqueue_failed' }, 503)

  let outboxClaimed = 0
  let inAppDelivered = 0
  let inAppRetried = 0
  let completionFailed = 0

  for (let batchIndex = 0; batchIndex < MAX_OUTBOX_BATCHES; batchIndex += 1) {
    const batchNow = new Date().toISOString()
    const claimed = await service.rpc('claim_tonight_notification_outbox', {
      p_limit: OUTBOX_BATCH_SIZE,
      p_now: batchNow,
    })
    if (claimed.error) {
      completionFailed += 1
      break
    }

    const outboxRows = (claimed.data ?? []) as TonightOutboxClaim[]
    if (outboxRows.length === 0) break
    outboxClaimed += outboxRows.length
    const outboxIds = outboxRows.map((row) => row.outbox_id)
    const outboxRevisions = outboxRows.map((row) => row.outbox_revision)
    const completed = await service.rpc('complete_tonight_notification_outbox_batch', {
      p_outbox_ids: outboxIds,
      p_expected_revisions: outboxRevisions,
      p_now: batchNow,
    })
    if (!completed.error && completed.data === outboxRows.length) {
      inAppDelivered += completed.data
    } else {
      if (!completed.error && typeof completed.data === 'number') {
        inAppDelivered += completed.data
      }
      const failed = await service.rpc('fail_tonight_notification_outbox_batch', {
        p_outbox_ids: outboxIds,
        p_expected_revisions: outboxRevisions,
        p_error_code: completed.error ? 'in_app_delivery_failed' : 'invalid_completion_result',
        p_now: batchNow,
      })
      if (failed.error || typeof failed.data !== 'number') completionFailed += outboxRows.length
      else inAppRetried += failed.data
      break
    }

    if (outboxRows.length < OUTBOX_BATCH_SIZE) break
  }

  const pushConfig = getTonightWebPushConfig(process.env)
  let pushClaimed = 0
  let pushSent = 0
  let pushRetried = 0
  let pushRevoked = 0

  if (isTonightWebPushReady(pushConfig)) {
    for (
      let pushBatchIndex = 0;
      pushBatchIndex < MAX_PUSH_BATCHES && Date.now() - startedAt < WORKER_TIME_BUDGET_MS;
      pushBatchIndex += 1
    ) {
      const pushNow = new Date().toISOString()
      const pushClaims = await service.rpc('claim_tonight_push_deliveries', {
        p_limit: PUSH_BATCH_SIZE,
        p_now: pushNow,
      })
      if (pushClaims.error) {
        completionFailed += 1
        break
      }

      const deliveries = (pushClaims.data ?? []) as TonightPushDelivery[]
      if (deliveries.length === 0) break
      pushClaimed += deliveries.length

      for (let index = 0; index < deliveries.length; index += PUSH_CONCURRENCY) {
        const batch = deliveries.slice(index, index + PUSH_CONCURRENCY)
        await Promise.all(batch.map(async (delivery) => {
        try {
          await sendTonightPush(delivery, pushConfig)
          const completion = await service.rpc('complete_tonight_push_delivery', {
            p_delivery_id: delivery.delivery_id,
            p_expected_revision: delivery.delivery_revision,
            p_succeeded: true,
            p_error_code: null,
            p_revoke_subscription: false,
            p_now: pushNow,
          })
          if (completion.error) completionFailed += 1
          else pushSent += 1
        } catch (error) {
          const failure = classifyTonightPushError(error)
          const completion = await service.rpc('complete_tonight_push_delivery', {
            p_delivery_id: delivery.delivery_id,
            p_expected_revision: delivery.delivery_revision,
            p_succeeded: false,
            p_error_code: failure.errorCode,
            p_revoke_subscription: failure.revokeSubscription,
            p_now: pushNow,
          })
          if (completion.error) completionFailed += 1
          else if (failure.revokeSubscription) pushRevoked += 1
          else pushRetried += 1
        }
        }))
      }
      if (deliveries.length < PUSH_BATCH_SIZE) break
    }
  }

  return privateJson({
    enqueued_count: typeof enqueued.data === 'number' ? enqueued.data : 0,
    outbox_claimed_count: outboxClaimed,
    in_app_delivered_count: inAppDelivered,
    in_app_retry_count: inAppRetried,
    push_ready: isTonightWebPushReady(pushConfig),
    push_claimed_count: pushClaimed,
    push_sent_count: pushSent,
    push_retry_count: pushRetried,
    push_revoked_count: pushRevoked,
    completion_failed_count: completionFailed,
  }, completionFailed > 0 ? 503 : 200)
}

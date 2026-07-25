import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient } from '@supabase/supabase-js'
import {
  classifyCampusSevenPushError,
  getCampusSevenWebPushConfig,
  isAuthorizedCampusSevenPushCron,
  isCampusSevenWebPushReady,
  sendCampusSevenGuidePush,
  type CampusSevenPushDelivery,
} from '@/lib/campus-seven/web-push'
import { getSupabaseAdminKey } from '@/lib/supabase-admin'
import { getSupabaseUrl } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const config = getCampusSevenWebPushConfig()
  if (!isAuthorizedCampusSevenPushCron(
    request.headers.get('authorization'),
    config.cronSecret,
  )) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isCampusSevenWebPushReady(config)) {
    return NextResponse.json({ error: 'web_push_not_configured' }, { status: 503 })
  }

  const serviceRoleKey = getSupabaseAdminKey()
  const supabaseUrl = getSupabaseUrl()
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'server_key_not_configured' }, { status: 503 })
  }

  const service = createSupabaseServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await service.rpc('claim_campus_seven_web_push_deliveries', {
    p_limit: 50,
    p_now: new Date().toISOString(),
  })
  if (error) {
    return NextResponse.json({ error: 'delivery_claim_failed' }, { status: 502 })
  }

  const deliveries = (data ?? []) as CampusSevenPushDelivery[]
  let sent = 0
  let retried = 0
  let revoked = 0
  let completionFailed = 0

  const completeDelivery = async (
    deliveryId: string,
    succeeded: boolean,
    errorCode: string | null,
    revokeSubscription: boolean,
  ) => {
    const { error: completionError } = await service.rpc('complete_campus_seven_web_push_delivery', {
      p_delivery_id: deliveryId,
      p_succeeded: succeeded,
      p_error_code: errorCode,
      p_revoke_subscription: revokeSubscription,
    })
    if (completionError) throw new Error('delivery_completion_failed')
  }

  for (let index = 0; index < deliveries.length; index += 5) {
    const batch = deliveries.slice(index, index + 5)
    await Promise.all(batch.map(async (delivery) => {
      try {
        await sendCampusSevenGuidePush(delivery, config)
        sent += 1
      } catch (sendError) {
        const failure = classifyCampusSevenPushError(sendError)
        await completeDelivery(
          delivery.delivery_id,
          false,
          failure.errorCode,
          failure.revokeSubscription,
        )
        if (failure.revokeSubscription) revoked += 1
        else retried += 1
        return
      }

      try {
        await completeDelivery(delivery.delivery_id, true, null, false)
      } catch {
        // Keep the lease. A later stale-lease recovery retries the same
        // notification topic without misclassifying a successful push.
        completionFailed += 1
      }
    }))
  }

  return NextResponse.json({
    claimed: deliveries.length,
    sent,
    retried,
    revoked,
    completionFailed,
  })
}

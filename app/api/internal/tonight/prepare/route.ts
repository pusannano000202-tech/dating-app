import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { selectTonightActivityTemplates } from '@/lib/matching/tonight-ranked/activity-catalog'
import { buildDefaultTonightScheduleKst } from '@/lib/matching/tonight-ranked/schedule'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { getKstServiceDate } from '@/lib/server/tonight/automation-runtime'
import { privateJson } from '@/lib/server/tonight/api-contract'
import { isTonightAutomationEnabled } from '@/lib/server/tonight/automation-gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MARKET_CODE = 'PNU'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  if (!isTonightAutomationEnabled()) {
    return privateJson({ status: 'automation_disabled' }, 200)
  }

  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)

  const serviceDate = getKstServiceDate()
  const schedule = buildDefaultTonightScheduleKst(serviceDate)
  const activities = selectTonightActivityTemplates({ marketCode: MARKET_CODE, serviceDate })
  const created = await service.rpc('service_create_tonight_round', {
    p_market_code: MARKET_CODE,
    p_service_date: serviceDate,
    p_signup_open_at: `${serviceDate}T00:00:00+09:00`,
    p_signup_close_at: schedule.signupCloseAt,
    p_capacity_lock_at: schedule.capacityLockAt,
    p_allocation_publish_at: schedule.allocationPublishAt,
    p_deposit_due_at: schedule.depositDueAt,
    p_partner_acceptance_due_at: schedule.partnerAcceptanceDueAt,
    p_reveal_at: schedule.revealAt,
    p_arrival_at: schedule.arrivalAt,
    p_starts_at: schedule.startsAt,
    p_activity_titles: activities.map((activity) => activity.title),
    p_activity_kinds: activities.map((activity) => activity.activityKind),
    p_activity_descriptions: activities.map((activity) => activity.description),
    p_activity_image_urls: activities.map((activity) => activity.imageUrl),
    p_activity_duration_minutes: activities.map((activity) => activity.durationMinutes),
    p_activity_allowed_venue_categories: activities.map((activity) => [...activity.venueCategories]),
    p_idempotency_key: `tonight-prepare-${MARKET_CODE}-${serviceDate}`,
  })
  if (created.error || typeof created.data !== 'string') {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  return privateJson({
    prepared: true,
    market_code: MARKET_CODE,
    service_date: serviceDate,
    round_id: created.data,
  })
}

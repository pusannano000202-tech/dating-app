import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { privateJson } from '@/lib/server/tonight/api-contract'
import { getTonightDueRoundPolicy, parseDueTonightRounds } from '@/lib/server/tonight/due-rounds'

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
  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)

  const policy = getTonightDueRoundPolicy('deposit')
  const roundLookup = await service
    .from('tonight_rounds')
    .select('id,service_date')
    .eq('market_code', MARKET_CODE)
    .in('status', policy.eligibleStatuses)
    .lte(policy.deadlineColumn, policy.nowIso)
    .order(policy.deadlineColumn, { ascending: true })
    .limit(policy.limit)
  if (roundLookup.error) return privateJson({ error: 'service_unavailable' }, 503)

  let rounds: ReturnType<typeof parseDueTonightRounds>
  try {
    rounds = parseDueTonightRounds(roundLookup.data)
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  let cancelledTeamCount = 0
  let queuedRefundCount = 0
  let failedRoundCount = 0
  for (const round of rounds) {
    const expired = await service.rpc('service_expire_tonight_deposit_gate', {
      p_round_id: round.id,
      p_idempotency_key: `tonight-deposit-gate-${MARKET_CODE}-${round.serviceDate}`,
    })
    if (expired.error || !isSafeGateResult(expired.data)) {
      failedRoundCount += 1
      continue
    }
    cancelledTeamCount += expired.data.cancelled_team_count
    queuedRefundCount += expired.data.queued_refund_count
  }

  return privateJson({
    processed_round_count: rounds.length,
    expired_round_count: rounds.length - failedRoundCount,
    failed_round_count: failedRoundCount,
    cancelled_team_count: cancelledTeamCount,
    queued_refund_count: queuedRefundCount,
  }, failedRoundCount > 0 ? 503 : 200)
}

function isSafeGateResult(value: unknown): value is {
  cancelled_team_count: number
  queued_refund_count: number
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return Number.isInteger(row.cancelled_team_count)
    && (row.cancelled_team_count as number) >= 0
    && Number.isInteger(row.queued_refund_count)
    && (row.queued_refund_count as number) >= 0
}

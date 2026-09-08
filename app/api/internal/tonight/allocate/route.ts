import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import {
  buildTonightPublishAssignments,
  parseTonightAllocatorRpcPayload,
} from '@/lib/matching/tonight-ranked/automation'
import { allocateTonightTeams } from '@/lib/matching/tonight-ranked/team-allocation-core'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { privateJson } from '@/lib/server/tonight/api-contract'
import { isTonightAutomationEnabled } from '@/lib/server/tonight/automation-gate'
import { getTonightDueRoundPolicy, parseDueTonightRounds } from '@/lib/server/tonight/due-rounds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MARKET_CODE = 'PNU'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return privateJson({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return privateJson({ error: 'unauthorized' }, 401)
  }
  if (!isTonightAutomationEnabled()) {
    return privateJson({ status: 'automation_disabled' })
  }

  const service = createPaymentServiceClient()
  if (!service) return privateJson({ error: 'service_unavailable' }, 503)

  const policy = getTonightDueRoundPolicy('allocation')
  const roundLookup = await service
    .from('tonight_rounds')
    .select('id,service_date')
    .eq('market_code', MARKET_CODE)
    .in('status', policy.eligibleStatuses)
    .lte(policy.deadlineColumn, policy.nowIso)
    .gt('deposit_due_at', policy.nowIso)
    .order(policy.deadlineColumn, { ascending: true })
    .limit(policy.limit)
  if (roundLookup.error) return privateJson({ error: 'service_unavailable' }, 503)
  let rounds: ReturnType<typeof parseDueTonightRounds>
  try {
    rounds = parseDueTonightRounds(roundLookup.data)
  } catch {
    return privateJson({ error: 'service_unavailable' }, 503)
  }

  let publishedRoundCount = 0
  let failedRoundCount = 0
  let failureLedgerResolutionFailedCount = 0
  let teamCount = 0
  let waitlistedApplicationCount = 0
  for (const round of rounds) {
    const roundStartedAt = Date.now()
    const allocatorInput = await service.rpc('service_get_tonight_allocator_input', {
      p_round_id: round.id,
    })
    if (allocatorInput.error) {
      failedRoundCount += 1
      logAllocationMetric({
        status: 'input_failed',
        duration_ms: Date.now() - roundStartedAt,
        applicant_count: 0,
        evaluation_count: 0,
        team_count: 0,
      })
      continue
    }

    try {
      const parsed = parseTonightAllocatorRpcPayload(allocatorInput.data)
      if (parsed.round.id !== round.id || parsed.round.serviceDate !== round.serviceDate) {
        failedRoundCount += 1
        logAllocationMetric({
          status: 'round_mismatch',
          duration_ms: Date.now() - roundStartedAt,
          applicant_count: parsed.allocationInput.applicants.length,
          evaluation_count: 0,
          team_count: 0,
        })
        continue
      }

      const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)
      const publish = buildTonightPublishAssignments(parsed, allocation)
      if (publish.status === 'allocator_failed') {
        failedRoundCount += 1
        logAllocationMetric({
          status: 'allocator_failed',
          duration_ms: Date.now() - roundStartedAt,
          applicant_count: parsed.allocationInput.applicants.length,
          evaluation_count: allocation.diagnostics.evaluations,
          team_count: 0,
        })
        continue
      }
      if (publish.status === 'allocation_unproven') {
        const failureRecord = await service.rpc('service_record_tonight_allocator_failure', {
          p_round_id: parsed.round.id,
          p_expected_round_revision: parsed.round.revision,
          p_lower_bound_team_count: publish.certification.lower_bound_team_count,
          p_upper_bound_team_count: publish.certification.upper_bound_team_count,
          p_applicant_count: parsed.allocationInput.applicants.length,
          p_attempted_at: new Date(roundStartedAt).toISOString(),
          p_error_code: 'allocation_unproven',
          p_idempotency_key: `tonight-allocator-failure-${parsed.round.id}-${roundStartedAt}`,
        })
        const recordOutcome = failureRecord.error
          ? null
          : allocatorLedgerMutationOutcome(failureRecord.data)
        if (recordOutcome === 'stale') {
          // Another worker has already transitioned this round. The stale
          // calculation neither reopens the incident nor makes this run fail.
          logAllocationMetric({
            status: 'allocation_unproven_stale',
            duration_ms: Date.now() - roundStartedAt,
            applicant_count: parsed.allocationInput.applicants.length,
            evaluation_count: allocation.diagnostics.evaluations,
            team_count: 0,
            lower_bound_team_count: publish.certification.lower_bound_team_count,
            upper_bound_team_count: publish.certification.upper_bound_team_count,
          })
          continue
        }
        failedRoundCount += 1
        logAllocationMetric({
          status: failureRecord.error || recordOutcome !== 'recorded'
            ? 'allocation_failure_ledger_write_failed'
            : 'allocation_unproven',
          duration_ms: Date.now() - roundStartedAt,
          applicant_count: parsed.allocationInput.applicants.length,
          evaluation_count: allocation.diagnostics.evaluations,
          team_count: 0,
          lower_bound_team_count: publish.certification.lower_bound_team_count,
          upper_bound_team_count: publish.certification.upper_bound_team_count,
        })
        continue
      }

      // Empty assignments are deliberately published too: the database atomically
      // waitlists every submitted application instead of leaving an open round.
      const result = await service.rpc('service_publish_tonight_allocation', {
        p_round_id: parsed.round.id,
        p_expected_revision: parsed.round.revision,
        p_team_assignments: publish.assignments,
        p_idempotency_key: `tonight-allocation-${MARKET_CODE}-${round.serviceDate}`,
      })
      if (result.error) {
        failedRoundCount += 1
        logAllocationMetric({
          status: 'publish_failed',
          duration_ms: Date.now() - roundStartedAt,
          applicant_count: parsed.allocationInput.applicants.length,
          evaluation_count: allocation.diagnostics.evaluations,
          team_count: publish.publicSummary.team_count,
        })
        continue
      }

      const failureResolution = await service.rpc('service_resolve_tonight_allocator_failure', {
        p_round_id: parsed.round.id,
        p_expected_round_revision: parsed.round.revision + 1,
        p_observed_at: new Date().toISOString(),
        p_idempotency_key: `tonight-allocator-resolve-${parsed.round.id}-${roundStartedAt}`,
      })
      const resolveOutcome = failureResolution.error
        ? null
        : allocatorLedgerMutationOutcome(failureResolution.data)
      if (
        failureResolution.error
        || (resolveOutcome !== 'resolved' && resolveOutcome !== 'no_failure')
      ) {
        // Publishing already committed. Keep the successful round counters
        // truthful and surface the stale-ledger cleanup as a separate metric.
        failureLedgerResolutionFailedCount += 1
        logAllocationMetric({
          status: 'allocation_failure_ledger_resolve_failed',
          duration_ms: Date.now() - roundStartedAt,
          applicant_count: parsed.allocationInput.applicants.length,
          evaluation_count: allocation.diagnostics.evaluations,
          team_count: publish.publicSummary.team_count,
        })
      }

      publishedRoundCount += 1
      teamCount += publish.publicSummary.team_count
      waitlistedApplicationCount += publish.publicSummary.waitlisted_application_count
      logAllocationMetric({
        status: 'published',
        duration_ms: Date.now() - roundStartedAt,
        applicant_count: parsed.allocationInput.applicants.length,
        evaluation_count: allocation.diagnostics.evaluations,
        team_count: publish.publicSummary.team_count,
      })
    } catch {
      failedRoundCount += 1
      logAllocationMetric({
        status: 'invalid_or_failed',
        duration_ms: Date.now() - roundStartedAt,
        applicant_count: 0,
        evaluation_count: 0,
        team_count: 0,
      })
    }
  }

  return privateJson({
    processed_round_count: rounds.length,
    published_round_count: publishedRoundCount,
    failed_round_count: failedRoundCount,
    failure_ledger_resolution_failed_count: failureLedgerResolutionFailedCount,
    team_count: teamCount,
    waitlisted_application_count: waitlistedApplicationCount,
  }, failedRoundCount > 0 ? 503 : 200)
}

function logAllocationMetric(metric: Readonly<{
  status: string
  duration_ms: number
  applicant_count: number
  evaluation_count: number
  team_count: number
  lower_bound_team_count?: number
  upper_bound_team_count?: number
}>) {
  console.info('allocation_metric', metric)
}

type AllocatorLedgerMutationOutcome = 'recorded' | 'stale' | 'resolved' | 'no_failure'

function allocatorLedgerMutationOutcome(value: unknown): AllocatorLedgerMutationOutcome | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || typeof candidate !== 'object') return null
  const outcome = (candidate as Record<string, unknown>).mutation_outcome
  return outcome === 'recorded'
    || outcome === 'stale'
    || outcome === 'resolved'
    || outcome === 'no_failure'
    ? outcome
    : null
}

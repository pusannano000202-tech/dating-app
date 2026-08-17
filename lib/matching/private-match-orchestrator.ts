import { MATCHING_CONFIG, makeSimConfig, type MatchingConfig } from './config'
import { summarizeGroup } from './group-summary'
import {
  loadPrivateMatchingMembers,
  type MatchingProfileRpcClient,
} from './private-profile-loader'
import { pairScore } from './score'
import type { MatchRejectReason, PairScoreBreakdown } from './types'

export interface PrivateMatchRpcClient extends MatchingProfileRpcClient {}

export type CreatePrivatePendingMatchResult =
  | {
      ok: true
      matchId: string
      score: number
      breakdown: PairScoreBreakdown
    }
  | {
      ok: false
      reason:
        | 'invalid_group_ids'
        | 'query_failed'
        | 'invalid_response'
        | 'incomplete_groups'
        | MatchRejectReason
        | 'below_threshold'
        | 'create_failed'
        | 'invalid_match_id'
    }

export async function createPrivatePendingMatch(
  client: PrivateMatchRpcClient,
  input: { groupAId: string; groupBId: string; isForced: boolean },
): Promise<CreatePrivatePendingMatchResult> {
  const loaded = await loadPrivateMatchingMembers(client, [input.groupAId, input.groupBId])
  if (!loaded.ok) return loaded

  const groupA = loaded.groupsById.get(input.groupAId)
  const groupB = loaded.groupsById.get(input.groupBId)
  if (!groupA || !groupB) return { ok: false, reason: 'incomplete_groups' }

  const config = input.isForced ? forcedMatchingConfig() : MATCHING_CONFIG
  const scored = pairScore(summarizeGroup(groupA), summarizeGroup(groupB), config)
  if (!scored.matchable.ok) return scored.matchable
  if (scored.score < config.threshold.PAIR_SCORE_MIN) {
    return { ok: false, reason: 'below_threshold' }
  }

  const blockedPair = await client.rpc('has_blocked_member_pair_between_groups', {
    p_group_a: input.groupAId,
    p_group_b: input.groupBId,
  })
  if (blockedPair.error || typeof blockedPair.data !== 'boolean') {
    return { ok: false, reason: 'query_failed' }
  }
  if (blockedPair.data) return { ok: false, reason: 'excluded_pair' }

  const { data, error } = await client.rpc('admin_create_pending_match', {
    p_group_a: input.groupAId,
    p_group_b: input.groupBId,
    p_score: scored.score,
    p_breakdown: scored.breakdown,
    p_is_forced: input.isForced,
  })
  if (error) return { ok: false, reason: 'create_failed' }
  if (typeof data !== 'string' || data.trim().length === 0) {
    return { ok: false, reason: 'invalid_match_id' }
  }

  return {
    ok: true,
    matchId: data,
    score: scored.score,
    breakdown: scored.breakdown,
  }
}

function forcedMatchingConfig(): MatchingConfig {
  return makeSimConfig({
    hardFilter: {
      SCORE_BAND_WIDTH: MATCHING_CONFIG.forcedMatch.SCORE_BAND_WIDTH,
    },
    threshold: {
      PAIR_SCORE_MIN: MATCHING_CONFIG.forcedMatch.PAIR_SCORE_MIN,
      ASYMMETRY_PENALTY: MATCHING_CONFIG.forcedMatch.ASYMMETRY_PENALTY,
    },
  })
}

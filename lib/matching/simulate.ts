import type { MatchingConfig } from './config'
import { isMatchable } from './filter'
import { pairScore } from './score'
import type { GroupSummary, SimulatedBatch } from './types'

export function simulateBatch(
  groups: GroupSummary[],
  config: MatchingConfig,
): SimulatedBatch {
  const candidates: SimulatedBatch['candidates'] = []
  const rejected: SimulatedBatch['rejected'] = []

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i]
      const b = groups[j]
      const matchable = isMatchable(a, b, config)
      if (!matchable.ok) {
        rejected.push({ groupAId: a.groupId, groupBId: b.groupId, reason: matchable.reason })
        continue
      }

      const scored = pairScore(a, b, config)
      if (scored.score >= config.threshold.PAIR_SCORE_MIN) {
        candidates.push(scored)
      } else {
        rejected.push({ groupAId: a.groupId, groupBId: b.groupId, reason: 'below_threshold' })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return { candidates, rejected }
}

import type { CampusRankingEligibilityInput, PublicationReason } from './types'

export interface CampusRankingEligibilityResult {
  eligible: boolean
  reasons: readonly PublicationReason[]
}

export function canPublishCampusRanking(input: CampusRankingEligibilityInput): CampusRankingEligibilityResult {
  const candidateIds = unique(input.candidateIds)
  const candidateSet = new Set(candidateIds)
  const publicCandidateCount = unique(input.publicCandidateIds.filter((candidateId) => candidateSet.has(candidateId))).length
  const reasons: PublicationReason[] = []

  if (candidateIds.length < 8) reasons.push('not_enough_verified_candidates')
  if (input.uniqueVerifiedUserCount < 30) reasons.push('not_enough_verified_users')
  if (input.validComparisonCount < 50) reasons.push('not_enough_valid_comparisons')
  if (publicCandidateCount < 5) reasons.push('not_enough_public_candidates')

  const graph = buildGraph(candidateIds, input.comparisonPairs)
  if (!isConnected(candidateIds, graph)) reasons.push('comparison_graph_disconnected')

  const minimumOpponents = Math.min(4, Math.max(0, candidateIds.length - 1))
  if (candidateIds.some((candidateId) => (graph.get(candidateId)?.size ?? 0) < minimumOpponents)) {
    reasons.push('not_enough_distinct_opponents')
  }

  return { eligible: reasons.length === 0, reasons }
}

function unique(values: readonly string[]) {
  return [...new Set(values)]
}

function buildGraph(candidateIds: readonly string[], pairs: CampusRankingEligibilityInput['comparisonPairs']) {
  const candidateSet = new Set(candidateIds)
  const graph = new Map(candidateIds.map((candidateId) => [candidateId, new Set<string>()]))

  for (const [candidateAId, candidateBId] of pairs) {
    if (candidateAId === candidateBId || !candidateSet.has(candidateAId) || !candidateSet.has(candidateBId)) continue
    graph.get(candidateAId)?.add(candidateBId)
    graph.get(candidateBId)?.add(candidateAId)
  }
  return graph
}

function isConnected(candidateIds: readonly string[], graph: ReadonlyMap<string, ReadonlySet<string>>) {
  if (candidateIds.length === 0) return false

  const visited = new Set<string>([candidateIds[0]])
  const queue = [candidateIds[0]]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited.size === candidateIds.length
}

import type { IdealImageItem } from '../appearance/metadata'
import { ROUND_WEIGHT, type RoundLabel } from '../appearance/preference'

export function validateWorldcupBracket(pool: IdealImageItem[], winnerIds: string[]) {
  let cursor = 0
  let roundItems = [...pool]
  const logs: Array<{ round: RoundLabel; matchIndex: number; winner: IdealImageItem; loser: IdealImageItem }> = []
  const roundWinners: Array<{ item: IdealImageItem; round: RoundLabel }> = []
  while (roundItems.length > 1) {
    const round = roundLabel(roundItems.length)
    if (!round) return null
    const next: IdealImageItem[] = []
    for (let index = 0; index < roundItems.length; index += 2) {
      const left = roundItems[index]
      const right = roundItems[index + 1]
      const winnerId = winnerIds[cursor++]
      if (!left || !right || (winnerId !== left.id && winnerId !== right.id)) return null
      const winner = winnerId === left.id ? left : right
      const loser = winnerId === left.id ? right : left
      logs.push({ round, matchIndex: index / 2, winner, loser })
      roundWinners.push({ item: winner, round })
      next.push(winner)
    }
    roundItems = next
  }
  return cursor === winnerIds.length ? { logs, roundWinners, finalWinner: roundItems[0] } : null
}

export function normalizeWorldcupBucketWeights(
  winners: Array<{ item: IdealImageItem; round: RoundLabel }>,
): Record<string, number> {
  const totals: Record<string, number> = {}
  let total = 0
  for (const { item, round } of winners) {
    if (!item.final_bucket) continue
    const weight = ROUND_WEIGHT[round]
    totals[item.final_bucket] = (totals[item.final_bucket] ?? 0) + weight
    total += weight
  }
  if (total === 0) return {}
  return Object.fromEntries(
    Object.entries(totals).map(([bucket, weight]) => [bucket, Math.round((weight / total) * 1000) / 1000]),
  )
}

function roundLabel(size: number): RoundLabel | null {
  if (size === 64) return '64강'
  if (size === 32) return '32강'
  if (size === 16) return '16강'
  if (size === 8) return '8강'
  if (size === 4) return '4강'
  if (size === 2) return '결승'
  return null
}

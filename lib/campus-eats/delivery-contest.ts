export type DeliveryContest = {
  candidateIds: string[]
  remaining: string[]
  winners: string[]
  winner: string | null
}

export function restoreDeliveryContest(value: unknown): DeliveryContest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as DeliveryContest
  if (!Array.isArray(row.candidateIds) || row.candidateIds.length < 8 || row.candidateIds.length > 500
    || row.candidateIds.some((id) => typeof id !== 'string' || !id || id.length > 96)
    || new Set(row.candidateIds).size !== row.candidateIds.length
    || !Array.isArray(row.remaining) || !Array.isArray(row.winners)) return null
  const active = [...row.remaining, ...row.winners]
  if (active.some((id) => !row.candidateIds.includes(id)) || new Set(active).size !== active.length) return null
  if (row.winner === null) {
    if (row.remaining.length < 2) return null
  } else if (typeof row.winner !== 'string' || !row.candidateIds.includes(row.winner) || active.length !== 0) return null
  return { candidateIds: [...row.candidateIds], remaining: [...row.remaining], winners: [...row.winners], winner: row.winner }
}

export function createDeliveryContest(candidateIds: readonly string[]): DeliveryContest {
  const contest = restoreDeliveryContest({ candidateIds: [...candidateIds], remaining: [...candidateIds], winners: [], winner: null })
  if (!contest) throw new Error('invalid_delivery_bracket')
  return contest
}

export function chooseDeliveryCandidate(contest: DeliveryContest, id: string): DeliveryContest {
  if (contest.winner || !contest.remaining.slice(0, 2).includes(id)) return contest
  const remaining = contest.remaining.slice(2)
  const winners = [...contest.winners, id]
  if (remaining.length === 1) winners.push(remaining.pop()!)
  if (remaining.length) return { ...contest, remaining, winners }
  return winners.length === 1
    ? { ...contest, remaining: [], winners: [], winner: winners[0] }
    : { ...contest, remaining: winners, winners: [], winner: null }
}

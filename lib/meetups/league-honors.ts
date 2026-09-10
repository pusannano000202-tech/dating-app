import type { LeagueTableRow } from './challenge-journey'

export type LeagueHonorRank = 1 | 2 | 3
export type LeagueHonorGroup = { rank: LeagueHonorRank; rows: readonly LeagueTableRow[] }

/** Present existing ranks only; never recalculate points or rank after filtering. */
export function groupLeagueHonors(rows: readonly LeagueTableRow[]): LeagueHonorGroup[] {
  const ranks: readonly LeagueHonorRank[] = [1, 2, 3]
  return ranks.flatMap(rank => {
    const members = rows.filter(row => row.played > 0 && row.rank === rank)
    return members.length ? [{ rank, rows: members }] : []
  })
}

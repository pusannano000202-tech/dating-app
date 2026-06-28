export interface MatchPoolStatsRow {
  gender: 'male' | 'female' | 'mixed'
  group_size: number
  group_count: number
}

export interface MatchPoolStats {
  female: number
  male: number
  mixed: number
  bySize: Record<'2' | '3', { female: number; male: number; mixed: number }>
}

export const EMPTY_MATCH_POOL_STATS: MatchPoolStats = {
  female: 0,
  male: 0,
  mixed: 0,
  bySize: {
    '2': { female: 0, male: 0, mixed: 0 },
    '3': { female: 0, male: 0, mixed: 0 },
  },
}

export function aggregateMatchPoolStats(rows: MatchPoolStatsRow[]): MatchPoolStats {
  const stats: MatchPoolStats = {
    female: 0,
    male: 0,
    mixed: 0,
    bySize: {
      '2': { female: 0, male: 0, mixed: 0 },
      '3': { female: 0, male: 0, mixed: 0 },
    },
  }

  for (const row of rows) {
    if (row.gender !== 'male' && row.gender !== 'female' && row.gender !== 'mixed') continue
    const count = Number.isFinite(row.group_count) ? Math.max(0, Math.trunc(row.group_count)) : 0
    if (row.gender === 'female') stats.female += count
    else if (row.gender === 'male') stats.male += count
    else stats.mixed += count

    const sizeKey = row.group_size === 2 ? '2' : row.group_size === 3 ? '3' : null
    if (sizeKey) {
      if (row.gender === 'female') stats.bySize[sizeKey].female += count
      else if (row.gender === 'male') stats.bySize[sizeKey].male += count
      else stats.bySize[sizeKey].mixed += count
    }
  }

  return stats
}

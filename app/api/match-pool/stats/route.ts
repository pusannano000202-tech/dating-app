import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface StatsRow {
  gender: 'male' | 'female'
  group_size: number
  group_count: number
}

export interface MatchPoolStats {
  female: number
  male: number
  bySize: Record<'2' | '3', { female: number; male: number }>
}

const EMPTY: MatchPoolStats = {
  female: 0,
  male: 0,
  bySize: { '2': { female: 0, male: 0 }, '3': { female: 0, male: 0 } },
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_match_pool_stats')

  if (error) {
    return NextResponse.json(EMPTY, { status: 200, headers: { 'x-stats-fallback': 'rpc_error' } })
  }

  return NextResponse.json(aggregate((data ?? []) as StatsRow[]))
}

export function aggregate(rows: StatsRow[]): MatchPoolStats {
  const stats: MatchPoolStats = {
    female: 0,
    male: 0,
    bySize: { '2': { female: 0, male: 0 }, '3': { female: 0, male: 0 } },
  }

  for (const row of rows) {
    if (row.gender !== 'male' && row.gender !== 'female') continue
    const count = Number.isFinite(row.group_count) ? Math.max(0, Math.trunc(row.group_count)) : 0
    if (row.gender === 'female') stats.female += count
    else stats.male += count
    const sizeKey = row.group_size === 2 ? '2' : row.group_size === 3 ? '3' : null
    if (sizeKey) {
      if (row.gender === 'female') stats.bySize[sizeKey].female += count
      else stats.bySize[sizeKey].male += count
    }
  }

  return stats
}

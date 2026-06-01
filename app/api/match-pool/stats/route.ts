import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  EMPTY_MATCH_POOL_STATS,
  aggregateMatchPoolStats,
  type MatchPoolStatsRow,
} from '@/lib/match-pool-stats'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_match_pool_stats')

  if (error) {
    return NextResponse.json(EMPTY_MATCH_POOL_STATS, { status: 200, headers: { 'x-stats-fallback': 'rpc_error' } })
  }

  return NextResponse.json(aggregateMatchPoolStats((data ?? []) as MatchPoolStatsRow[]))
}

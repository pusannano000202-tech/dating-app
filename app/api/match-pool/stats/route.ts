import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  EMPTY_MATCH_POOL_STATS,
  aggregateMatchPoolStats,
  type MatchPoolStatsRow,
} from '@/lib/match-pool-stats'

export async function GET() {
  const service = createSupabaseAdminClient()
  if (!service) {
    return NextResponse.json(
      { ...EMPTY_MATCH_POOL_STATS, error: 'service_unavailable' },
      { status: 503 },
    )
  }

  const { data, error } = await service.rpc('get_match_pool_stats')

  if (error) {
    return NextResponse.json(EMPTY_MATCH_POOL_STATS, { status: 200, headers: { 'x-stats-fallback': 'rpc_error' } })
  }

  return NextResponse.json(aggregateMatchPoolStats((data ?? []) as MatchPoolStatsRow[]))
}

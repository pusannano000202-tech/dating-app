import { NextResponse } from 'next/server'
import { mannerSummary, reviewTags } from '@/lib/community/mock-data'

export function GET() {
  return NextResponse.json({
    summary: mannerSummary,
    reviewTags,
    policy: {
      personalScoreVisibility: 'self_only',
      publicRankingBasis: ['completion_rate', 'participation_count', 'mission_completion'],
    },
  })
}

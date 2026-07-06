import { NextResponse } from 'next/server'
import { allDebates, todayDebate } from '@/lib/community/mock-data'

export function GET() {
  return NextResponse.json({
    today: todayDebate,
    debates: allDebates,
    policy: {
      responseVisibility: 'private',
      aggregateVisibility: 'school_department_only',
    },
  })
}

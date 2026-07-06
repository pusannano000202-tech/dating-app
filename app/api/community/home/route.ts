import { NextResponse } from 'next/server'
import { communityRooms, mannerSummary, missions, todayDebate } from '@/lib/community/mock-data'

export function GET() {
  return NextResponse.json({
    today: {
      debate: todayDebate,
      pendingMission: missions.find((mission) => !mission.completed) ?? missions[0],
      pendingReviews: mannerSummary.pendingReviews,
    },
    rooms: communityRooms,
  })
}

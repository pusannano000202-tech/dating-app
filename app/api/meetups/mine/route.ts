import { NextRequest } from 'next/server'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'

// Actor comes only from the authenticated request. Reading home never creates a pool.
export async function GET(req: NextRequest) {
  return activityRoomRpc(req, 'get_my_home_meetups', {})
}

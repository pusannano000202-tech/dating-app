import { NextRequest } from 'next/server'
import { isActivityRoomId } from '@/lib/meetups/activity-room-contract'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'
import { meetupJson } from '@/lib/meetups/http'

export async function GET(req: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params
  if (!isActivityRoomId(roomId)) return meetupJson({ error: 'invalid_room_id' }, 400)
  return activityRoomRpc(req, 'get_activity_room', { p_room_id: roomId })
}

import { NextRequest } from 'next/server'
import { isActivityRoomId } from '@/lib/meetups/activity-room-contract'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'
import { meetupJson } from '@/lib/meetups/http'
type Context = { params: Promise<{ roomId: string }> }
async function handle(req: NextRequest, context: Context, leave: boolean) {
  const { roomId } = await context.params
  if (!isActivityRoomId(roomId)) return meetupJson({ error: 'invalid_room_id' }, 400)
  return activityRoomRpc(req, leave ? 'leave_activity_room' : 'join_activity_room', { p_room_id: roomId }, true)
}
export async function POST(req: NextRequest, context: Context) { return handle(req, context, false) }
export async function DELETE(req: NextRequest, context: Context) { return handle(req, context, true) }

import { NextRequest } from 'next/server'
import { isActivityRoomCursor, isActivityRoomId } from '@/lib/meetups/activity-room-contract'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'
import { meetupJson } from '@/lib/meetups/http'

export async function GET(req: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params
  if (!isActivityRoomId(roomId)) return meetupJson({ error: 'invalid_room_id' }, 400)
  const query = req.nextUrl.searchParams
  const createdAt = query.get('before_created_at')
  const messageId = query.get('before_message_id')
  if ((createdAt !== null || messageId !== null) && !isActivityRoomCursor({ created_at: createdAt, id: messageId })) {
    return meetupJson({ error: 'invalid_activity_room_cursor' }, 400)
  }
  return activityRoomRpc(req, 'get_activity_room_messages', {
    p_room_id: roomId, p_before_created_at: createdAt, p_before_message_id: messageId,
  })
}

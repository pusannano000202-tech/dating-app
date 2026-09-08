import { NextRequest } from 'next/server'
import { isActivityRoomId } from '@/lib/meetups/activity-room-contract'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'
import { meetupJson } from '@/lib/meetups/http'

export async function POST(req: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params
  const body = await req.json().catch(() => null)
  if (!isActivityRoomId(roomId) || !body || typeof body.message !== 'string' || !body.message.trim()
    || body.message.trim().length > 1000 || !isActivityRoomId(body.idempotency_key)) return meetupJson({ error: 'invalid_message' }, 400)
  return activityRoomRpc(req, 'send_activity_room_message', { p_room_id: roomId, p_message: body.message.trim(), p_idempotency_key: body.idempotency_key }, true)
}

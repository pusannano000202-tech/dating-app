import { NextRequest } from 'next/server'
import { meetupJson } from '@/lib/meetups/http'
import { STUDY_UUID, validateStudyRoomAction } from '@/lib/meetups/study-room-contract'
import { readStudyRoomBody, studyRoomRpc } from '@/lib/meetups/study-room-server'
type Context = { params: Promise<{ roomId: string }> }
export async function GET(req: NextRequest, context: Context) {
  const { roomId } = await context.params
  if (!STUDY_UUID.test(roomId)) return meetupJson({ error: 'invalid_room_id' }, 400)
  return studyRoomRpc(req, 'detail', { room_id: roomId })
}
export async function PATCH(req: NextRequest, context: Context) {
  const { roomId } = await context.params
  const input = await readStudyRoomBody(req)
  if (!STUDY_UUID.test(roomId) || !validateStudyRoomAction(input)) return meetupJson({ error: 'invalid_request' }, 400)
  const { action, ...args } = input
  return studyRoomRpc(req, action, { ...args, room_id: roomId }, true)
}
export async function DELETE(req: NextRequest, context: Context) {
  const { roomId } = await context.params
  if (!STUDY_UUID.test(roomId)) return meetupJson({ error: 'invalid_room_id' }, 400)
  // Empty body is plain leave; malformed report never silently becomes plain leave.
  const input = req.body ? await readStudyRoomBody(req) : {}
  if (!input || (input.report_reason !== undefined && (typeof input.report_reason !== 'string' || input.report_reason.length > 2000))) return meetupJson({ error: 'invalid_request' }, 400)
  return studyRoomRpc(req, 'leave', { room_id: roomId, report_reason: input.report_reason }, true)
}

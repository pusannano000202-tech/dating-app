import { NextRequest } from 'next/server'
import { meetupJson } from '@/lib/meetups/http'
import { STUDY_UUID } from '@/lib/meetups/study-room-contract'
import { studyRoomRpc } from '@/lib/meetups/study-room-server'
type Context = { params: Promise<{ roomId: string }> }
export async function GET(req: NextRequest, context: Context) {
  const { roomId } = await context.params
  const before_at = req.nextUrl.searchParams.get('before_at')
  const before_id = req.nextUrl.searchParams.get('before_id')
  if (!STUDY_UUID.test(roomId) || (before_at === null) !== (before_id === null)
    || (before_at !== null && (!Number.isFinite(Date.parse(before_at)) || before_at.length > 40 || !STUDY_UUID.test(before_id!)))) return meetupJson({ error: 'invalid_cursor' }, 400)
  return studyRoomRpc(req, 'history', { room_id: roomId, before_at, before_id })
}

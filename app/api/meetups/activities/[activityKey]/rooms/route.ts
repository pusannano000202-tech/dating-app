import { NextRequest } from 'next/server'
import { getActivityRoomDefinition } from '@/lib/meetups/activity-room-contract'
import { isMeetupGenderMode } from '@/lib/community/meetup-gender'
import { activityRoomRpc } from '@/lib/meetups/activity-room-api'
import { meetupJson } from '@/lib/meetups/http'

type Context = { params: Promise<{ activityKey: string }> }
async function handle(req: NextRequest, context: Context, ensure: boolean) {
  const { activityKey } = await context.params
  const genderMode = req.nextUrl.searchParams.get('gender_mode') ?? 'all'
  if (!getActivityRoomDefinition(activityKey) || !isMeetupGenderMode(genderMode)) return meetupJson({ error: 'invalid_activity_room' }, 400)
  return activityRoomRpc(req, ensure ? 'ensure_activity_room_pool' : 'list_activity_rooms', { p_activity_key: activityKey, p_gender_mode: genderMode }, ensure)
}
export async function GET(req: NextRequest, context: Context) { return handle(req, context, false) }
export async function POST(req: NextRequest, context: Context) { return handle(req, context, true) }

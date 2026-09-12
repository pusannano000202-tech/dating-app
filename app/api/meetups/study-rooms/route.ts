import { NextRequest } from 'next/server'
import { meetupJson } from '@/lib/meetups/http'
import { isStudyRoomLevel, STUDY_UUID } from '@/lib/meetups/study-room-contract'
import { readStudyRoomBody, studyRoomRpc } from '@/lib/meetups/study-room-server'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('mine') === 'true') return studyRoomRpc(req, 'mine', {})
  const course_id = req.nextUrl.searchParams.get('course_id')
  const course_name = req.nextUrl.searchParams.get('course_name') ?? undefined
  const level = req.nextUrl.searchParams.get('level') ?? 'beginner'
  if (!course_id || course_id.length > 100 || !isStudyRoomLevel(level) || (course_name?.length ?? 0) > 80) return meetupJson({ error: 'invalid_request' }, 400)
  return studyRoomRpc(req, 'list', { course_id, course_name, level })
}
export async function POST(req: NextRequest) {
  const input = await readStudyRoomBody(req)
  if (!input || Object.keys(input).some(k=>!['course_id','course_name','level','title','client_id'].includes(k))
    || typeof input.title!=='string'||!input.title.trim()||Array.from(input.title).length>60
    || typeof input.client_id!=='string'||!STUDY_UUID.test(input.client_id)
    || typeof input.course_id !== 'string' || input.course_id.length > 100 || !isStudyRoomLevel(input.level)
    || (input.course_id === 'custom' && (typeof input.course_name !== 'string' || !input.course_name.trim() || input.course_name.length > 80))) return meetupJson({ error: 'invalid_request' }, 400)
  return studyRoomRpc(req, 'create_hosted', { course_id: input.course_id, course_name: input.course_name, level: input.level, title:input.title, client_id:input.client_id }, true)
}

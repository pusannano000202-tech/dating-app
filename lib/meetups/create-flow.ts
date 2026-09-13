import type { MeetupCategory } from '../community/contracts'
import type { MeetupScope } from '../community/department-rooms'
import type { MeetupGenderMode } from '../community/meetup-gender'

const createOrigins = new Set(['/meetups', '/meetups/department', '/meetups/department/social', '/meetups/department/mentoring', '/meetups/explore', '/meetups/browse'])

/** Navigation only: the origin never grants a scope or membership permission. */
export function getMeetupCreateBackHref(scope: MeetupScope, origin?: string | null): string {
  const fallback = scope === 'department' ? '/meetups/department' : '/meetups'
  if (!origin || origin.length > 600 || !origin.startsWith('/') || origin.startsWith('//') || /[\\\u0000-\u0020]/u.test(origin)) return fallback
  try {
    const url = new URL(origin, 'https://quantum.invalid')
    if (url.origin !== 'https://quantum.invalid' || !createOrigins.has(url.pathname)) return fallback
    return `${url.pathname}${url.search}`
  } catch { return fallback }
}

export type CreatedMeetupSummary = Readonly<{
  id: string; title: string; is_host: boolean; member_count: number; capacity: number; status: string
}>

/** The query is a presentation hint; only a server-confirmed owner sees the notice. */
export function getCreatedMeetupNotice(created: boolean, room: CreatedMeetupSummary) {
  if (!created || !room.is_host || !createdMeetupHref({ meetup: room })
    || !Number.isInteger(room.member_count) || !Number.isInteger(room.capacity)
    || room.capacity < 1 || room.member_count < 0 || room.member_count > room.capacity) return null
  const active = room.status === 'open' || room.status === 'full'
  return {
    heading: active ? '모임이 만들어졌어요' : '내가 만든 모임이에요',
    recruitment: room.status === 'cancelled' ? '취소된 모임' : room.status === 'completed' ? '종료된 모임'
      : room.status === 'full' || room.member_count === room.capacity ? '모집 마감' : room.status === 'open' ? '모집 중' : '상태 확인 필요',
    remaining: room.status === 'open' ? Math.max(0, room.capacity - room.member_count) : 0,
    chatHref: `/chat/rooms/meetup/${room.id}`,
    applicationsHref: `/meetups/${room.id}/applications`,
    active,
    accepting: room.status === 'open' && room.member_count < room.capacity,
  }
}

export function createdMeetupHref(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const meetup = (payload as {meetup?:unknown}).meetup
  if (!meetup || typeof meetup !== 'object') return null
  const id=(meetup as {id?:unknown}).id
  return typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? `/meetups/${id}?created=1` : null
}

export function customMeetupBrowseHref(category:MeetupCategory,scope:MeetupScope,genderMode?:MeetupGenderMode):string {
  const params=new URLSearchParams({category,scope_type:scope})
  if(genderMode)params.set('gender_mode',genderMode)
  return `/meetups/browse?${params}`
}

export function parseMeetupKoreanDate(value:string):string {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return ''
  const date=new Date(`${value}:00+09:00`)
  if(!Number.isFinite(date.getTime())) return ''
  const roundtrip=new Date(date.getTime()+9*60*60_000).toISOString().slice(0,16)
  return roundtrip===value?date.toISOString():''
}

export function meetupKoreanDateInput(date:Date):string {
  return new Date(date.getTime()+9*60*60_000).toISOString().slice(0,16)
}

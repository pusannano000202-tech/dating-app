import type { MeetupCategory } from '../community/contracts'
import type { MeetupScope } from '../community/department-rooms'
import type { MeetupGenderMode } from '../community/meetup-gender'

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

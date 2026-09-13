import { isMeetupCategory, type MeetupCategory } from '../../lib/community/contracts'
import { isMeetupGenderMode, type MeetupGenderEligibility, type MeetupGenderMode } from '../../lib/community/meetup-gender'

export type DepartmentMeetup = {
  id: string
  category: MeetupCategory
  title: string
  description: string
  place_name: string | null
  scheduled_at: string | null
  schedule_status?: 'confirmed' | 'schedule_pending'
  ends_at: string | null
  capacity: number
  status: 'open' | 'full'
  member_count: number
  joined: boolean
  is_host: boolean
  created_at: string
  gender_mode: MeetupGenderMode
  gender_eligibility: MeetupGenderEligibility
  scope_type: 'department'
  department_label: string
  activity_key: string | null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// A malformed or unscoped response must never look like an empty department.
export function parseDepartmentMeetups(value: unknown): DepartmentMeetup[] | null {
  if (!Array.isArray(value) || value.length > 30) return null
  const ids = new Set<string>()
  const meetups: DepartmentMeetup[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id)
      || !isMeetupCategory(row.category)
      || typeof row.title !== 'string' || !row.title.trim()
      || typeof row.description !== 'string'
      || (row.schedule_status === 'schedule_pending'
        ? row.place_name !== null || row.scheduled_at !== null || row.ends_at !== null
        : (row.schedule_status !== undefined && row.schedule_status !== 'confirmed') || typeof row.place_name !== 'string' || typeof row.scheduled_at !== 'string' || !Number.isFinite(Date.parse(row.scheduled_at)))
      || (row.ends_at !== null && (typeof row.ends_at !== 'string' || !Number.isFinite(Date.parse(row.ends_at))))
      || !Number.isInteger(row.capacity) || row.capacity < 1
      || !Number.isInteger(row.member_count) || row.member_count < 0 || row.member_count > row.capacity
      || (row.status !== 'open' && row.status !== 'full')
      || typeof row.joined !== 'boolean' || typeof row.is_host !== 'boolean'
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
      || !isMeetupGenderMode(row.gender_mode)
      || !['eligible', 'gender_required', 'gender_restricted'].includes(row.gender_eligibility)
      || row.scope_type !== 'department'
      || typeof row.department_label !== 'string' || !row.department_label.trim()
      || (row.activity_key !== null && typeof row.activity_key !== 'string')) return null
    ids.add(row.id)
    meetups.push(row as DepartmentMeetup)
  }
  return meetups
}

export function isOpenDepartmentMeetup(meetup: DepartmentMeetup, now: number): boolean {
  return meetup.status === 'open'
    && meetup.member_count < meetup.capacity
    && meetup.gender_eligibility === 'eligible'
    && (meetup.schedule_status === 'schedule_pending' || (meetup.scheduled_at !== null && Date.parse(meetup.scheduled_at) > now))
    && !meetup.joined
    && !meetup.is_host
}

export function presentDepartmentMeetups(meetups: readonly DepartmentMeetup[], now: number) {
  const joined = meetups.filter(meetup => meetup.joined || meetup.is_host)
  const available = meetups.filter(meetup => !meetup.joined && !meetup.is_host).sort((a, b) => {
    const priority = Number(isOpenDepartmentMeetup(b, now)) - Number(isOpenDepartmentMeetup(a, now))
    return priority || (a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity) - (b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity)
      || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
  })
  return { joined, available, recommended: available.filter(meetup => isOpenDepartmentMeetup(meetup, now)).slice(0, 3) }
}

/** Keep viewer membership and the room's recruitment state independent. */
export function getDepartmentMeetupCardState(meetup: DepartmentMeetup, now: number) {
  const own = meetup.is_host || meetup.joined
  const started = meetup.scheduled_at !== null && Date.parse(meetup.scheduled_at) <= now
  const full = meetup.status === 'full' || meetup.member_count >= meetup.capacity
  return {
    roleLabel: meetup.is_host ? '내가 연 모임' : meetup.joined ? '참여 중' : null,
    statusLabel: started ? '활동 시작' : full ? '모집 마감' : '모집 중',
    remaining: started || full ? 0 : Math.max(0, meetup.capacity - meetup.member_count),
    primaryHref: own ? `/chat/rooms/meetup/${meetup.id}` : `/meetups/${meetup.id}`,
    primaryLabel: own ? '채팅 열기' : '모임 살펴보기',
    applicationsHref: meetup.is_host ? `/meetups/${meetup.id}/applications` : null,
  }
}

import { featuredMeetupIdeas, studyTopicGroups, type StudyTopicGroupId } from '../community/catalog'
import { isMeetupCategory, type MeetupCategory } from '../community/contracts'
import type { MeetupScope } from '../community/department-rooms'
import { isMeetupGenderMode, type MeetupGenderMode } from '../community/meetup-gender'
import { getMeetupCreateBackHref } from './create-flow'

type CreateContextInput = {
  activityKey?: string
  category?: string
  genderMode: string
  topicGroup?: string
  from?: string
}

type MeetupCreateContext = {
  idea: (typeof featuredMeetupIdeas)[number] | undefined
  category: MeetupCategory
  genderMode: MeetupGenderMode
  scope: MeetupScope
  topicGroup: StudyTopicGroupId | undefined
  backHref: string
  startAtRecruitment: boolean
}

/** Use only the fetched room's catalog identity, never a client-provided return URL. */
export function getMeetupDetailBackLink(room: {
  scope_type?: unknown; category?: unknown; activity_key?: unknown; gender_mode?: unknown
}): { href: string; label: string } {
  const idea = featuredMeetupIdeas.find(item => item.id === room.activity_key)
  if (room.scope_type === 'school' && idea && idea.category === room.category && isMeetupGenderMode(room.gender_mode)) {
    return {
      href: `/meetups/activities/${idea.id}/rooms?${new URLSearchParams({ gender_mode: room.gender_mode })}`,
      label: '활동 모임방으로',
    }
  }
  return { href: '/meetups', label: '모임 목록' }
}

/** Public catalog defaults only; no room membership or participant data travels here. */
export function buildContextualMeetupCreateHref(input: CreateContextInput): string | null {
  const idea = featuredMeetupIdeas.find(item => item.id === input.activityKey)
  if (input.activityKey && !idea) return null
  const category = idea?.category ?? input.category
  if (!isMeetupCategory(category) || !isMeetupGenderMode(input.genderMode)) return null
  const query = new URLSearchParams({ category, scope: 'school', gender_mode: input.genderMode, start: 'recruitment' })
  if (idea) {
    query.set('idea', idea.id)
    query.set('from', `/meetups/activities/${idea.id}/rooms?${new URLSearchParams({ gender_mode: input.genderMode })}`)
  } else {
    const topicGroup = category === 'study' && studyTopicGroups.find(group => group.id === input.topicGroup)
    if (topicGroup) query.set('topic_group', topicGroup.id)
    if (input.from) query.set('from', getMeetupCreateBackHref('school', input.from))
  }
  return `/meetups/create?${query}`
}

/** Query data is editable presentation context, never an authorization claim. */
export function readMeetupCreateContext(params: Pick<URLSearchParams, 'get'>): MeetupCreateContext {
  const idea = featuredMeetupIdeas.find(item => item.id === params.get('idea'))
  const requestedCategory = params.get('category')
  const validCategory = isMeetupCategory(requestedCategory) ? requestedCategory : undefined
  const category = idea?.category ?? validCategory ?? 'running'
  const requestedGender = params.get('gender_mode')
  const genderMode = isMeetupGenderMode(requestedGender) ? requestedGender : 'all'
  const scope: MeetupScope = params.get('scope') === 'department' ? 'department' : 'school'
  const topicGroup = idea?.topicGroup ?? (category === 'study'
    ? studyTopicGroups.find(group => group.id === params.get('topic_group'))?.id : undefined)
  const origin = params.get('from')
  let backHref = getMeetupCreateBackHref(scope, origin)
  if (scope === 'school' && origin && origin.length <= 600 && !/[\\\u0000-\u0020]/u.test(origin)) {
    try {
      const url = new URL(origin, 'https://quantum.invalid')
      const originIdea = featuredMeetupIdeas.find(item => url.pathname === `/meetups/activities/${item.id}/rooms`)
      const originGender = url.searchParams.get('gender_mode')
      if (origin.startsWith('/') && !origin.startsWith('//') && url.origin === 'https://quantum.invalid'
        && originIdea && isMeetupGenderMode(originGender)) {
        backHref = `/meetups/activities/${originIdea.id}/rooms?${new URLSearchParams({ gender_mode: originGender })}`
      }
    } catch { /* Keep the safe scope fallback. */ }
  }
  return { idea, category, genderMode, scope, topicGroup, backHref,
    startAtRecruitment: params.get('start') === 'recruitment' && Boolean(idea || validCategory) }
}

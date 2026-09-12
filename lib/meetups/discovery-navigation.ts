import { featuredMeetupIdeas, getMeetupCapacityRecommendation, getMeetupDiscoveryCategories, studyTopicGroups } from '../community/catalog'
import type { MeetupCategory } from '../community/contracts'
import { isMeetupGenderMode, type MeetupGenderMode } from '../community/meetup-gender'

export type MeetupExploreIntent = 'play' | 'achieve'
export type MeetupDiscoveryState = { intent: MeetupExploreIntent; group: string | null; genderMode: MeetupGenderMode }
export function hasLegacyMeetupQuery(params: Record<string, string | string[] | undefined>): boolean {
  return ['scope', 'category', 'topic', 'gender_mode', 'created'].some(key => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key]
    return typeof value === 'string' && value.length > 0
  })
}
type DiscoveryPhoto = { imageSrc: string; imageAlt: string }
export type MeetupDiscoveryGroup = DiscoveryPhoto & { id: string; title: string; description: string }
export type MeetupDiscoveryActivity = DiscoveryPhoto & {
  id: string
  category: MeetupCategory
  title: string
  description: string
  href: string
  capacity: number
  kind: 'activity' | 'category'
}

const playGroups: MeetupDiscoveryGroup[] = [
  { id: 'lifestyle', title: '오늘, 같이 놀래?', description: '카페 · 맛집 · 소품숍 · 산책', imageSrc: '/images/meetups/meetup-cafe-friends-v1.webp', imageAlt: '커피와 디저트를 두고 함께 이야기하는 대학생들의 연출 사진' },
  { id: 'games', title: '오늘부터 같은 팀', description: '보드게임 · PC방 팀 게임', imageSrc: '/images/meetups/meetup-gaming.webp', imageAlt: 'PC방에서 나란히 팀 게임을 하는 대학생들의 연출 사진' },
  { id: 'exercise', title: '땀 좀 나눠볼까?', description: '러닝 · 라켓 운동 · 구기 종목 · 등산', imageSrc: '/images/meetups/meetup-badminton.webp', imageAlt: '코트에서 배드민턴을 하는 대학생들의 연출 사진' },
]

// Reuse existing scene assets; these are editorial photos, never member portraits.
const studyPhotos: Record<string, DiscoveryPhoto> = {
  'major-foundation': { imageSrc: '/images/meetups/meetup-study.webp', imageAlt: '책과 노트북을 펴고 함께 공부하는 대학생들의 연출 사진' },
  language: { imageSrc: '/images/meetups/meetup-cafe-friends-v1.webp', imageAlt: '카페 테이블에 둘러앉아 이야기하는 대학생들의 연출 사진' },
  career: { imageSrc: '/social-scenes/posts.png', imageAlt: '카페에서 노트와 휴대전화를 확인하는 연출 사진' },
  project: { imageSrc: '/social-scenes/voice-career-v2.webp', imageAlt: '책과 노트, 노트북이 놓인 작업 테이블의 연출 사진' },
}

export function getMeetupDiscoveryGroups(intent: MeetupExploreIntent): MeetupDiscoveryGroup[] {
  return intent === 'play' ? playGroups : studyTopicGroups.filter(group => group.id !== 'major-foundation').map(group => ({
    id: group.id,
    title: group.title,
    description: group.topics.join(' · '),
    ...studyPhotos[group.id],
  }))
}

export function readMeetupDiscoveryState(params: Pick<URLSearchParams, 'get'>, selectedIntent?: MeetupExploreIntent): MeetupDiscoveryState {
  const intent = selectedIntent ?? (params.get('intent') === 'achieve' ? 'achieve' : 'play')
  const candidateGroup = params.get('group')
  const candidateGender = params.get('gender_mode')
  return {
    intent,
    group: getMeetupDiscoveryGroups(intent).some(group => group.id === candidateGroup) ? candidateGroup : null,
    genderMode: isMeetupGenderMode(candidateGender) ? candidateGender : 'all',
  }
}

export function buildMeetupExploreHref(state: MeetupDiscoveryState): string {
  const params = new URLSearchParams({ intent: state.intent })
  if (getMeetupDiscoveryGroups(state.intent).some(group => group.id === state.group)) params.set('group', state.group!)
  if (isMeetupGenderMode(state.genderMode) && state.genderMode !== 'all') params.set('gender_mode', state.genderMode)
  return `/meetups/explore?${params.toString()}`
}

export function buildMeetupActivityHref(activityKey: string, genderMode: MeetupGenderMode): string | null {
  if (!featuredMeetupIdeas.some(idea => idea.id === activityKey) || !isMeetupGenderMode(genderMode)) return null
  return `/meetups/activities/${encodeURIComponent(activityKey)}/rooms?${new URLSearchParams({ gender_mode: genderMode }).toString()}`
}

export function buildMeetupDiscoveryReturnHref(activityKey: string, genderMode: MeetupGenderMode): string {
  const idea = featuredMeetupIdeas.find(item => item.id === activityKey)
  if (!idea) return '/meetups'
  if (idea.topicGroup === 'major-foundation') return '/meetups/department/courses'
  const intent = idea.category === 'study' ? 'achieve' : 'play'
  const group = intent === 'achieve' ? idea.topicGroup : playGroups.find(item =>
    getMeetupDiscoveryCategories(item.id as 'lifestyle' | 'games' | 'exercise').includes(idea.category))?.id
  if (!group) return '/meetups'
  return buildMeetupExploreHref({ intent, group, genderMode })
}

export function getMeetupDiscoveryActivities(intent: MeetupExploreIntent, group: string | null, genderMode: MeetupGenderMode = 'all'): MeetupDiscoveryActivity[] {
  if (!getMeetupDiscoveryGroups(intent).some(item => item.id === group)) return []
  const categories = intent === 'play' ? getMeetupDiscoveryCategories(group as 'lifestyle' | 'games' | 'exercise') : ['study']
  const ideas = featuredMeetupIdeas.filter(idea => categories.includes(idea.category)
    && (intent === 'play' || idea.topicGroup === group))
  const activities: MeetupDiscoveryActivity[] = ideas.map(idea => ({
    id: idea.id,
    category: idea.category,
    title: idea.title,
    description: idea.description,
    imageSrc: idea.imageSrc,
    imageAlt: idea.imageAlt,
    ...(idea.topicGroup ? studyPhotos[idea.topicGroup] : {}),
    href: buildMeetupActivityHref(idea.id, genderMode)!,
    capacity: getMeetupCapacityRecommendation(idea.category),
    kind: 'activity',
  }))

  // Soccer/baseball have existing custom meetups but no automatic-room activity key.
  if (intent === 'play' && group === 'exercise') {
    for (const category of ['soccer', 'baseball'] as const) {
      activities.push({
        id: `category-${category}`,
        category,
        title: category === 'soccer' ? '축구 같이 할 사람' : '야구 같이 할 사람',
        description: '모집 중인 방에서 경기 방식과 장소를 확인해요.',
        imageSrc: category === 'soccer' ? '/social-scenes/home-playmaker-football.webp' : '/social-scenes/baseball.png',
        imageAlt: category === 'soccer' ? '운동장에서 함께 축구를 하는 연출 사진' : '야구 경기장 관중석에서 응원하는 연출 사진',
        href: `/meetups/browse?${new URLSearchParams({ scope: 'exercise', category, gender_mode: genderMode }).toString()}`,
        capacity: getMeetupCapacityRecommendation(category),
        kind: 'category',
      })
    }
  }
  return activities
}

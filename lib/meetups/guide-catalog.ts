import type { MeetupCategory } from '../community/contracts'
import { featuredMeetupIdeas } from '../community/catalog'
import { getActivityContent } from './activity-content'

import type { MeetupGuideActionKind, ActiveMeetupGuideSceneId } from './guide-contract'

export type MeetupGuideScene = Readonly<{
  id: ActiveMeetupGuideSceneId
  title: string
  body: string
  artwork: { src: string; alt: string }
  primaryAction: MeetupGuideActionKind
}>

export type MeetupGuideTemplate = Readonly<{
  id: string
  activityKey: string | null
  category: MeetupCategory
  title: string
  scenes: readonly MeetupGuideScene[]
  usesDalmutiRules: boolean
  professionalRulesClaimed: boolean
}>

export const TONIGHT_GUIDE_BINDINGS = [
  'pnu-snack-worldcup',
  'pnu-darts-team-battle',
  'pnu-boardgame-three-match',
  'pnu-table-mini-league',
  'pnu-dessert-pick-tour',
  'pnu-night-menu-tournament',
].map((sourceId) => ({ sourceId, runtimeOwner: 'tonight' as const, personalProgressOwner: 'tonight' as const }))

export const CONTINUATION_GUIDE_BINDINGS = ([1, 2, 3, 4, 5] as const).map((programDay) => ({
  programDay,
  runtimeOwner: 'continuation' as const,
  personalProgressOwner: 'continuation' as const,
}))

const introArtwork = {
  src: '/images/match/five-meeting/scene-guides/day1-introduction.webp',
  alt: '참가자들이 한 문장씩 소개하며 함께 활동을 준비하는 장면',
}
const arrivalArtwork = {
  src: '/images/match/five-meeting/scene-guides/day3-arrival.webp',
  alt: '참가자들이 공개된 모임 장소를 확인하고 모이는 장면',
}
const conversationArtwork = {
  src: '/images/match/five-meeting/scene-guides/day4-free-conversation.webp',
  alt: '참가자들이 서로의 속도를 존중하며 대화하는 장면',
}
const closingArtwork = {
  src: '/images/match/five-meeting/scene-guides/day5-photo-safe-return-v2.webp',
  alt: '참가자들이 안전한 귀가 방법을 확인하며 마무리하는 장면',
}

export function getMeetupGuideTemplate(activityKey: string | null, category: MeetupCategory): MeetupGuideTemplate {
  const idea = featuredMeetupIdeas.find((candidate) => candidate.id === activityKey && candidate.category === category)
  if (!idea) return commonTemplate(category)
  return buildTemplate({
    id: `meetup-${idea.id}-v1`,
    activityKey: idea.id,
    category,
    title: idea.title,
    activityArtwork: { src: idea.imageSrc, alt: idea.imageAlt },
    usesDalmutiRules: idea.id === 'board-game-round',
  })
}

function commonTemplate(category: MeetupCategory): MeetupGuideTemplate {
  return buildTemplate({
    id: 'meetup-common-v1',
    activityKey: null,
    category,
    title: '함께하는 모임',
    activityArtwork: conversationArtwork,
    usesDalmutiRules: false,
  })
}

function buildTemplate({
  id,
  activityKey,
  category,
  title,
  activityArtwork,
  usesDalmutiRules,
}: {
  id: string
  activityKey: string | null
  category: MeetupCategory
  title: string
  activityArtwork: { src: string; alt: string }
  usesDalmutiRules: boolean
}): MeetupGuideTemplate {
  const content = getActivityContent(activityKey, category)
  return {
    id,
    activityKey,
    category,
    title,
    usesDalmutiRules,
    professionalRulesClaimed: false,
    scenes: [
      scene('prepare', '모임 전 준비', content.prepare, introArtwork, 'acknowledge'),
      scene('gather', '공개 장소에 모이기', '도착이 늦으면 혼자 뛰지 말고 모임에 알려요.', arrivalArtwork, 'open_map'),
      scene('greet', '한 문장으로 인사', '말하고 싶은 만큼만 소개하고 불편한 질문은 넘겨요.', introArtwork, 'acknowledge'),
      scene('start', `${title} 시작`, content.start, activityArtwork, 'open_activity'),
      scene('activity', '지금 활동 이어가기', content.activity, activityArtwork, 'open_activity'),
      scene('wrap', '함께 마무리', content.wrap, conversationArtwork, 'acknowledge'),
      scene('next', '모임을 마쳤어요', '주최자 종료와 개인 나가기는 서로 다른 기록으로 남아요.', closingArtwork, 'acknowledge'),
    ],
  }
}

function scene(
  id: ActiveMeetupGuideSceneId,
  title: string,
  body: string,
  artwork: { src: string; alt: string },
  primaryAction: MeetupGuideActionKind,
): MeetupGuideScene {
  return { id, title, body, artwork, primaryAction }
}

import type { MeetupCategory } from './contracts'

export type SocialMeetupDiscoveryId = 'male-social' | 'female-social' | 'mixed-social'

export const socialMeetupDiscoveryOptions: ReadonlyArray<{
  id: SocialMeetupDiscoveryId
  label: string
  description: string
  examples: string
  imageSrc: string
  imageAlt: string
}> = [
  {
    id: 'male-social',
    label: '남성 친목',
    description: '운동과 게임부터 가볍게 둘러봐요.',
    examples: '배드민턴 · 농구 · 테니스 · 게임',
    imageSrc: '/images/meetups/social-male-v1.png',
    imageAlt: '함께 걸으며 웃는 대학생 네 명의 친목 활동 연출 사진',
  },
  {
    id: 'female-social',
    label: '여성 친목',
    description: '카페와 쇼핑·산책 후보부터 둘러봐요.',
    examples: '카페 · 맛집 · 쇼핑 · 산책',
    imageSrc: '/images/meetups/social-female-v1.png',
    imageAlt: '카페 앞에서 소품을 함께 보며 웃는 대학생 네 명',
  },
  {
    id: 'mixed-social',
    label: '혼성 친목',
    description: '성별과 관계없이 전체 활동을 둘러봐요.',
    examples: '운동 · 게임 · 카페 · 스터디',
    imageSrc: '/images/meetups/social-mixed-v1.png',
    imageAlt: '보드게임 테이블에 둘러앉아 함께 웃는 대학생 다섯 명',
  },
]

const CATEGORIES: Record<Exclude<SocialMeetupDiscoveryId, 'mixed-social'>, MeetupCategory[]> = {
  'male-social': [
    'running',
    'basketball',
    'badminton',
    'tennis',
    'soccer',
    'baseball',
    'board_game',
    'gaming',
    'hiking',
  ],
  'female-social': ['dining', 'walking', 'other'],
}

/**
 * Discovery recommendation only. It does not control a meetup's gender_mode
 * or who may join; those checks remain in the actual meetup flow.
 */
export function getSocialMeetupCategories(
  id: SocialMeetupDiscoveryId,
): MeetupCategory[] | null {
  return id === 'mixed-social' ? null : [...CATEGORIES[id]]
}

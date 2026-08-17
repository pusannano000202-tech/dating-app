import type { CommunityCategory, MeetupCategory } from './contracts'

export type MeetupDiscoveryGroupId = 'exercise' | 'games' | 'study' | 'lifestyle'
export type StudyTopicGroupId = 'major-foundation' | 'language' | 'career' | 'project'
export type LaunchWeekConcentrationStripItem = {
  day: '월' | '화' | '수' | '목' | '금'
  category: MeetupCategory
  label: string
  note: string
  preview: true
}

export const launchWeekConcentrationStrip: LaunchWeekConcentrationStripItem[] = [
  { day: '월', category: 'board_game', label: '보드게임', note: '저녁 7시 집중 모집', preview: true },
  { day: '화', category: 'running', label: '조깅', note: '저녁 7시·9시 두 번 모집', preview: true },
  { day: '수', category: 'dining', label: '맥주', note: '저녁 8시 30분 집중 모집', preview: true },
  { day: '목', category: 'badminton', label: '배드민턴', note: '코트가 확보된 날만 열어요', preview: true },
  { day: '금', category: 'walking', label: '산책', note: '저녁 8시 부산대 인근 코스', preview: true },
]

export const meetupDiscoveryGroups: Array<{
  id: MeetupDiscoveryGroupId
  title: string
  categories: MeetupCategory[]
}> = [
  {
    id: 'exercise',
    title: '운동',
    categories: ['running', 'basketball', 'badminton', 'tennis', 'soccer', 'baseball', 'hiking'],
  },
  {
    id: 'games',
    title: '게임',
    categories: ['board_game', 'gaming'],
  },
  {
    id: 'study',
    title: '스터디',
    categories: ['study'],
  },
  {
    id: 'lifestyle',
    title: '생활',
    categories: ['dining', 'walking', 'other'],
  },
]

const meetupCategoriesById = new Map<MeetupDiscoveryGroupId, MeetupCategory[]>(
  meetupDiscoveryGroups.map((group) => [group.id, group.categories]),
)

export function getMeetupDiscoveryCategories(groupId: MeetupDiscoveryGroupId): MeetupCategory[] {
  return meetupCategoriesById.get(groupId) ?? []
}

export type CommunityDestinationGroupId = '연애 이야기' | '사용자 후기' | '우리 주변 맛집'
export const communityDestinationGroups: Array<{
  id: CommunityDestinationGroupId
  title: string
  categories: Array<CommunityCategory | 'campus-eats'>
}> = [
  {
    id: '연애 이야기',
    title: '연애 이야기',
    categories: ['relationship-advice', 'relationship-coach'],
  },
  {
    id: '사용자 후기',
    title: '사용자 후기',
    categories: ['feedback', 'meetup-review'],
  },
  {
    id: '우리 주변 맛집',
    title: '우리 주변 맛집',
    categories: ['campus-eats'],
  },
]

export const meetupCategoryCatalog: Array<{
  id: MeetupCategory | 'all'
  label: string
}> = [
  { id: 'all', label: '전체' },
  { id: 'running', label: '러닝' },
  { id: 'basketball', label: '농구' },
  { id: 'badminton', label: '배드민턴' },
  { id: 'tennis', label: '테니스' },
  { id: 'soccer', label: '축구' },
  { id: 'baseball', label: '야구' },
  { id: 'board_game', label: '보드게임' },
  { id: 'gaming', label: '게임' },
  { id: 'hiking', label: '등산' },
  { id: 'walking', label: '산책' },
  { id: 'dining', label: '맛집' },
  { id: 'study', label: '스터디' },
  { id: 'other', label: '기타' },
]

export const studyTopicGroups: Array<{
  id: StudyTopicGroupId
  title: string
  topics: readonly string[]
}> = [
  { id: 'major-foundation', title: '전공 기초', topics: ['일반물리', '공학수학', '일반화학', '코딩·알고리즘'] },
  { id: 'language', title: '어학', topics: ['OPIc', 'TOEIC', '영어회화'] },
  { id: 'career', title: '자격·취업', topics: ['한국사', '컴활', '기사 준비'] },
  { id: 'project', title: '프로젝트', topics: ['공모전', '발표·논문', '포트폴리오'] },
]

export interface FeaturedMeetupIdea {
  id: string
  category: MeetupCategory
  label: string
  title: string
  description: string
  imageSrc: string
  imageAlt: string
  topicGroup?: StudyTopicGroupId
}

export const featuredMeetupIdeas: FeaturedMeetupIdea[] = [
  {
    id: 'oncheon-running',
    category: 'running',
    label: '가볍게 움직이기',
    title: '온천천 저녁 러닝',
    description: '속도보다 함께 완주하는 분위기의 생활 모임',
    imageSrc: '/images/match/events/event-jogging-v2.webp',
    imageAlt: '온천천 산책로에서 저녁 러닝을 함께하는 대학생들',
  },
  {
    id: 'evening-badminton',
    category: 'badminton',
    label: '네 명이면 바로 시작',
    title: '저녁 배드민턴 복식',
    description: '초보도 섞여서 가볍게 랠리부터 시작하는 모임',
    imageSrc: '/images/meetups/meetup-badminton.webp',
    imageAlt: '저녁 야외 코트에서 배드민턴 복식을 하는 대학생 네 명',
  },
  {
    id: 'night-basketball',
    category: 'basketball',
    label: '여섯 명이 가볍게',
    title: '밤 농구 한 게임',
    description: '실력보다 같이 뛰는 재미를 먼저 챙기는 반코트 모임',
    imageSrc: '/images/meetups/meetup-basketball.webp',
    imageAlt: '밤 야외 농구장에서 함께 경기하는 대학생 여섯 명',
  },
  {
    id: 'campus-tennis',
    category: 'tennis',
    label: '복식으로 부담 없이',
    title: '캠퍼스 테니스 복식',
    description: '라켓을 들고 네 명이 번갈아 치는 저녁 운동 모임',
    imageSrc: '/images/meetups/meetup-tennis.webp',
    imageAlt: '저녁 테니스 코트에서 복식 경기를 하는 대학생 네 명',
  },
  {
    id: 'board-game-round',
    category: 'board_game',
    label: '처음 만나기 편한 활동',
    title: '보드게임 한 판',
    description: '대화가 어색하지 않도록 게임부터 시작하는 모임',
    imageSrc: '/images/match/events/event-board-game.webp',
    imageAlt: '테이블에 둘러앉아 보드게임을 하는 대학생들',
  },
  {
    id: 'team-gaming',
    category: 'gaming',
    label: 'PC방에서 바로 한 팀',
    title: '오늘 고점 뽑으러 가자',
    description: '무작위 총력전이나 배틀로얄을 함께할 학교 친구를 모아요.',
    imageSrc: '/images/meetups/meetup-gaming.webp',
    imageAlt: 'PC방에서 팀 게임을 함께 플레이하는 대학생 다섯 명',
  },
  {
    id: 'geumjeongsan-hiking',
    category: 'hiking',
    label: '주말 반나절 코스',
    title: '금정산 같이 오르기',
    description: '무리 없는 숲길 코스를 정해 함께 오르고 내려오는 모임이에요.',
    imageSrc: '/images/meetups/meetup-hiking.webp',
    imageAlt: '숲길을 따라 함께 산을 오르는 대학생 다섯 명',
  },
  {
    id: 'evening-dining',
    category: 'dining',
    label: '같이 먹기',
    title: '저녁 메뉴 같이 고르기',
    description: '혼자 먹기 아쉬운 날 학교 앞에서 만나는 모임',
    imageSrc: '/images/match/events/event-dinner.webp',
    imageAlt: '음식이 놓인 테이블에서 함께 저녁을 먹는 대학생들',
  },
  {
    id: 'major-foundation-study',
    category: 'study',
    topicGroup: 'major-foundation',
    label: '전공 기초 같이 풀기',
    title: '일반물리·공학수학 스터디',
    description: '일반물리와 공학수학에서 막히는 문제를 같이 풀어요.',
    imageSrc: '/images/meetups/meetup-study.webp',
    imageAlt: '캠퍼스 스터디 라운지에서 전공 책과 노트북을 펴고 함께 공부하는 대학생들',
  },
  {
    id: 'language-speaking-study',
    category: 'study',
    topicGroup: 'language',
    label: '말하면서 준비하기',
    title: 'OPIc·영어회화 스피킹',
    description: 'TOEIC 단어부터 OPIc 답변과 영어회화까지 서로 피드백해요.',
    imageSrc: '/images/meetups/meetup-study.webp',
    imageAlt: '노트 카드로 영어 말하기를 함께 연습하는 대학생 스터디',
  },
  {
    id: 'career-certificate-study',
    category: 'study',
    topicGroup: 'career',
    label: '시험 루틴 같이 만들기',
    title: '한국사·컴활 자격 스터디',
    description: '기사 준비까지 주간 목표를 정하고 공부한 내용을 확인해요.',
    imageSrc: '/images/meetups/meetup-study.webp',
    imageAlt: '자격증 교재와 노트를 펴고 학습 계획을 확인하는 대학생들',
  },
  {
    id: 'portfolio-project-study',
    category: 'study',
    topicGroup: 'project',
    label: '결과물을 함께 완성',
    title: '공모전·발표 프로젝트 팀',
    description: '논문·발표와 포트폴리오 작업을 함께할 팀원을 찾아요.',
    imageSrc: '/images/meetups/meetup-study.webp',
    imageAlt: '노트북 화면의 발표 자료를 보며 프로젝트를 논의하는 대학생들',
  },
]

export const communityCategoryCatalog: Array<{
  id: CommunityCategory | 'campus-eats'
  title: string
  description: string
  href: string
  actionLabel: string
  tone: 'school' | 'action' | 'safety' | 'neutral'
}> = [
  {
    id: 'feedback',
    title: 'Quantum에 제안하기',
    description: '불편했던 점과 새 기능 아이디어를 개발자에게 바로 전해요.',
    href: '/community/feedback',
    actionLabel: '제안 남기기',
    tone: 'school',
  },
  {
    id: 'meetup-review',
    title: '만남 후기',
    description: '개인정보 없이 분위기와 운영 경험을 나눠요.',
    href: '/community/meetup-review',
    actionLabel: '후기 보기',
    tone: 'action',
  },
  {
    id: 'relationship-advice',
    title: '연애 상담',
    description: '혼자 고민하던 상황을 익명으로 물어봐요.',
    href: '/community/relationship-advice',
    actionLabel: '상담 보기',
    tone: 'safety',
  },
  {
    id: 'relationship-coach',
    title: '연애 코치',
    description: '대화와 관계에서 궁금한 장면을 구체적으로 질문해요.',
    href: '/community/relationship-coach',
    actionLabel: '질문하기',
    tone: 'neutral',
  },
  {
    id: 'campus-eats',
    title: '학교 맛집',
    description: '부산대 생활권 식당을 비교하고 내 취향 결과를 확인해요.',
    href: '/community/campus-eats',
    actionLabel: '맛집 보기',
    tone: 'action',
  },
]

export function getMeetupCategoryLabel(category: MeetupCategory): string {
  return meetupCategoryCatalog.find((item) => item.id === category)?.label ?? '기타'
}

export const communityComposerCatalog: Record<CommunityCategory, {
  intro: string
  guidedPrompts: string[]
}> = {
  feedback: {
    intro: '불편했던 장면을 알려주면 운영자가 바로 이해할 수 있게 정리해 드려요.',
    guidedPrompts: ['어디에서 불편했나요?', '어떻게 바뀌면 좋을까요?'],
  },
  'meetup-review': {
    intro: '개인정보 대신 활동과 분위기를 중심으로 남겨 주세요.',
    guidedPrompts: ['어떤 활동이었나요?', '만남 분위기는 어땠나요?', '다음 참가자에게 한마디'],
  },
  'relationship-advice': {
    intro: '상황을 순서대로 적으면 다른 학생들이 답하기 쉬워요.',
    guidedPrompts: ['지금 어떤 사이인가요?', '무슨 일이 있었나요?', '가장 궁금한 점은?'],
  },
  'relationship-coach': {
    intro: '보내고 싶은 말과 원하는 결과를 나눠 적어 보세요.',
    guidedPrompts: ['어떤 대화를 앞두고 있나요?', '상대에게 전하고 싶은 내용은?', '원하는 결과는 무엇인가요?'],
  },
}

const meetupCapacityRecommendations: Record<MeetupCategory, number> = {
  baseball: 10,
  soccer: 10,
  basketball: 6,
  badminton: 4,
  tennis: 4,
  running: 6,
  board_game: 5,
  gaming: 5,
  hiking: 6,
  walking: 6,
  dining: 5,
  study: 5,
  other: 6,
}

export function getMeetupCapacityRecommendation(category: MeetupCategory): number {
  return meetupCapacityRecommendations[category]
}

export function getCommunityComposer(category: CommunityCategory) {
  return communityComposerCatalog[category]
}

export function getCommunityCategory(category: string) {
  return communityCategoryCatalog.find(
    (item): item is (typeof communityCategoryCatalog)[number] & { id: CommunityCategory } =>
      item.id === category && item.id !== 'campus-eats',
  )
}

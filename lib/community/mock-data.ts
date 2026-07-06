export type CommunityRoomId = 'debates' | 'stats' | 'rankings' | 'manners' | 'missions' | 'safety'

export type PollOptionKey = 'pour' | 'dip' | 'yes' | 'no' | 'study' | 'meal' | 'call' | 'chat'

export type PollOption = {
  key: PollOptionKey
  label: string
}

export type DebatePoll = {
  id: string
  title: string
  prompt: string
  category: string
  options: PollOption[]
  participantLabel: string
  href: string
}

export type StatsScope = {
  id: string
  type: 'university' | 'department'
  label: string
  parentLabel?: string
  topic: string
  dominantLabel: string
  percentage: number | null
  sampleSize: number
  summary: string
  searchText: string
}

export type RankingCategory = 'taste' | 'participation' | 'manner' | 'mission'

export type RankingCard = {
  id: string
  category: RankingCategory
  title: string
  season: string
  metricLabel: string
  safetyNotice: string
  items: Array<{
    rank: number
    label: string
    scoreLabel: string
    meta: string
  }>
}

export type Mission = {
  id: string
  title: string
  description: string
  href: string
  completed: boolean
}

export const MIN_PUBLIC_SAMPLE_SIZE = 30

export const todayDebate: DebatePoll = {
  id: 'tangsuyuk-20260707',
  title: '오늘의 논쟁',
  prompt: '탕수육은 부먹 vs 찍먹?',
  category: '음식',
  options: [
    { key: 'pour', label: '부먹' },
    { key: 'dip', label: '찍먹' },
  ],
  participantLabel: '부산대 128명 참여',
  href: '/community/debates/tangsuyuk-20260707',
}

export const bonusDebates: DebatePoll[] = [
  {
    id: 'mint-20260707',
    title: '보너스 논쟁',
    prompt: '민초 가능 vs 불가능?',
    category: '음식',
    options: [
      { key: 'yes', label: '가능' },
      { key: 'no', label: '불가능' },
    ],
    participantLabel: '경영학과 29명 참여',
    href: '/community/debates/mint-20260707',
  },
  {
    id: 'campus-plan-20260707',
    title: '캠퍼스 선택',
    prompt: '오늘은 카공 vs 밥약?',
    category: '캠퍼스',
    options: [
      { key: 'study', label: '카공' },
      { key: 'meal', label: '밥약' },
    ],
    participantLabel: '심리학과 31명 참여',
    href: '/community/debates/campus-plan-20260707',
  },
]

export const allDebates = [todayDebate, ...bonusDebates]

export const communityRooms = [
  {
    id: 'debates' as const,
    label: '논쟁방',
    eyebrow: 'Daily',
    description: '오늘의 질문에 답하고 결과를 열어요.',
    href: '/community/debates',
    summary: '탕수육은 부먹 vs 찍먹?',
  },
  {
    id: 'stats' as const,
    label: '통계방',
    eyebrow: 'Explore',
    description: '학교와 학과 결과를 검색하고 비교해요.',
    href: '/community/stats',
    summary: '부산대 컴공 68%는 찍먹',
  },
  {
    id: 'rankings' as const,
    label: '랭킹방',
    eyebrow: 'Weekly',
    description: '참여와 취향 기반 TOP 5만 안전하게 봐요.',
    href: '/community/rankings',
    summary: '이번 주 답변 활발한 학과',
  },
  {
    id: 'manners' as const,
    label: '매너/리뷰',
    eyebrow: 'Trust',
    description: '내 매너 상태와 리뷰 대기를 확인해요.',
    href: '/community/manners',
    summary: '리뷰 1건 작성 대기',
  },
  {
    id: 'missions' as const,
    label: '미션방',
    eyebrow: 'Today',
    description: '커뮤니티를 가볍게 둘러보는 할 일을 모아요.',
    href: '/community/missions',
    summary: '오늘 2/3 완료',
  },
  {
    id: 'safety' as const,
    label: '안전방',
    eyebrow: 'Policy',
    description: '표본, 개인정보, 금지 랭킹 기준을 확인해요.',
    href: '/community/safety',
    summary: '개인 답변 비공개',
  },
]

export const statsScopes: StatsScope[] = [
  {
    id: 'pnu',
    type: 'university',
    label: '부산대 전체',
    topic: '탕수육',
    dominantLabel: '찍먹',
    percentage: 62,
    sampleSize: 128,
    summary: '부산대는 찍먹 62%',
    searchText: '부산대 부산대학교 전체 탕수육 찍먹',
  },
  {
    id: 'pnu-cse',
    type: 'department',
    label: '컴퓨터공학부',
    parentLabel: '부산대',
    topic: '탕수육',
    dominantLabel: '찍먹',
    percentage: 68,
    sampleSize: 34,
    summary: '부산대 컴퓨터공학부 68%는 찍먹',
    searchText: '부산대 부산대학교 컴퓨터공학부 컴공 탕수육 찍먹',
  },
  {
    id: 'pukyong-cse',
    type: 'department',
    label: '컴퓨터공학부',
    parentLabel: '부경대',
    topic: '탕수육',
    dominantLabel: '부먹',
    percentage: 54,
    sampleSize: 42,
    summary: '부경대 컴퓨터공학부 54%는 부먹',
    searchText: '부경대 부경대학교 컴퓨터공학부 컴공 탕수육 부먹',
  },
  {
    id: 'donga-cse',
    type: 'department',
    label: '컴퓨터공학부',
    parentLabel: '동아대',
    topic: '탕수육',
    dominantLabel: '찍먹',
    percentage: 56,
    sampleSize: 36,
    summary: '동아대 컴퓨터공학부 56%는 찍먹',
    searchText: '동아대 동아대학교 컴퓨터공학부 컴공 탕수육 찍먹',
  },
  {
    id: 'pnu-business',
    type: 'department',
    label: '경영학과',
    parentLabel: '부산대',
    topic: '민초',
    dominantLabel: '가능',
    percentage: 41,
    sampleSize: 29,
    summary: '부산대 경영학과 41%는 민초 가능',
    searchText: '부산대 부산대학교 경영학과 민초 민트초코 가능',
  },
  {
    id: 'pnu-philosophy',
    type: 'department',
    label: '철학과',
    parentLabel: '부산대',
    topic: '민초',
    dominantLabel: '표본 부족',
    percentage: null,
    sampleSize: 18,
    summary: '아직 표본이 부족해요',
    searchText: '부산대 부산대학교 철학과 표본 부족 민초',
  },
]

export const statSuggestions = [
  {
    title: '컴공끼리 보면 다를까?',
    description: '부산대, 부경대, 동아대 컴공 비교',
    href: '/community/stats/explore?q=컴퓨터공학부&scope_ids=pnu,pnu-cse,pukyong-cse',
  },
  {
    title: '우리 과는 학교 평균이랑 다를까?',
    description: '부산대 전체와 컴퓨터공학부 비교',
    href: '/community/stats/explore?q=부산대&scope_ids=pnu,pnu-cse',
  },
  {
    title: '민초 찬성률 보기',
    description: '경영학과와 주변 학과 결과',
    href: '/community/stats/explore?q=민초&scope_ids=pnu-business',
  },
]

export const rankingCards: RankingCard[] = [
  {
    id: 'dip-departments',
    category: 'taste',
    title: '찍먹 응답 비율이 높은 학과 TOP 5',
    season: '이번 주',
    metricLabel: '찍먹 비율',
    safetyNotice: '최소 응답 30명 이상 학과만 집계해요.',
    items: [
      { rank: 1, label: '컴퓨터공학부', scoreLabel: '68%', meta: '응답 34명' },
      { rank: 2, label: '심리학과', scoreLabel: '64%', meta: '응답 31명' },
      { rank: 3, label: '신문방송학과', scoreLabel: '61%', meta: '응답 38명' },
    ],
  },
  {
    id: 'active-answer',
    category: 'participation',
    title: '이번 주 답변 참여가 활발한 학과 TOP 5',
    season: '이번 주',
    metricLabel: '답변 수',
    safetyNotice: '참여량만 집계하며 개인 답변은 공개하지 않아요.',
    items: [
      { rank: 1, label: '경영학과', scoreLabel: '142명', meta: '논쟁 카드 참여' },
      { rank: 2, label: '컴퓨터공학부', scoreLabel: '128명', meta: '논쟁 카드 참여' },
      { rank: 3, label: '심리학과', scoreLabel: '93명', meta: '논쟁 카드 참여' },
    ],
  },
  {
    id: 'manner-complete',
    category: 'manner',
    title: '노쇼 없이 완료된 만남 비율',
    season: '이번 달',
    metricLabel: '완료율',
    safetyNotice: '개인이나 특정 팀을 공개하지 않고 충분한 표본만 집계해요.',
    items: [
      { rank: 1, label: '2:2 과팅', scoreLabel: '96%', meta: '완료 48건' },
      { rank: 2, label: '카공 모임', scoreLabel: '94%', meta: '완료 36건' },
      { rank: 3, label: '밥약 모임', scoreLabel: '91%', meta: '완료 52건' },
    ],
  },
  {
    id: 'mission-finish',
    category: 'mission',
    title: '미션 완료율이 높은 학과 TOP 5',
    season: '이번 주',
    metricLabel: '완료율',
    safetyNotice: '가벼운 참여 지표이며 매칭 점수에 반영하지 않아요.',
    items: [
      { rank: 1, label: '심리학과', scoreLabel: '74%', meta: '미션 3개 기준' },
      { rank: 2, label: '컴퓨터공학부', scoreLabel: '71%', meta: '미션 3개 기준' },
      { rank: 3, label: '경영학과', scoreLabel: '69%', meta: '미션 3개 기준' },
    ],
  },
]

export const mannerSummary = {
  statusLabel: '안정적이에요',
  reviewCount: 3,
  pendingReviews: 1,
  guideComplete: true,
  scoreBands: [
    { label: '시간 약속', value: '좋아요' },
    { label: '응답 성실도', value: '안정적' },
    { label: '노쇼 없음', value: '확인됨' },
  ],
  privacyNotice: '개인 매너 점수는 본인에게만 보여줘요.',
}

export const reviewTags = [
  '시간을 잘 지켰어요',
  '대화가 편했어요',
  '약속 장소를 잘 확인했어요',
  '불편한 행동이 있었어요',
  '약속과 달랐어요',
]

export const missions: Mission[] = [
  {
    id: 'debate',
    title: '오늘의 논쟁 답하기',
    description: '답하면 우리학교 결과가 열려요.',
    href: todayDebate.href,
    completed: false,
  },
  {
    id: 'stats',
    title: '우리 과 통계 확인',
    description: '부산대 컴공과 학교 전체를 비교해요.',
    href: '/community/stats/explore?q=컴퓨터공학부&scope_ids=pnu,pnu-cse',
    completed: true,
  },
  {
    id: 'manner',
    title: '매너 가이드 읽기',
    description: '리뷰와 신고 기준을 1분 안에 확인해요.',
    href: '/community/manners',
    completed: true,
  },
]

export function findPollById(id: string): DebatePoll {
  return allDebates.find((poll) => poll.id === id) ?? todayDebate
}

export function findScopes(query: string): StatsScope[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return statsScopes
  return statsScopes.filter((scope) => scope.searchText.toLowerCase().includes(normalized))
}

export function getCompareScopes(scopeIds: string[]): StatsScope[] {
  const ids = scopeIds.slice(0, 3)
  return ids
    .map((id) => statsScopes.find((scope) => scope.id === id))
    .filter((scope): scope is StatsScope => Boolean(scope))
}

export function isScopePublic(scope: StatsScope): boolean {
  return scope.percentage !== null && scope.sampleSize >= MIN_PUBLIC_SAMPLE_SIZE
}

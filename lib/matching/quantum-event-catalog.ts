export type QuantumEventMode = 'tonight' | 'scheduled'
export type QuantumPartyType = 'solo' | 'friends'
export type QuantumEventKind = 'run' | 'board-game' | 'drinks' | 'dinner' | 'walk'

export const quantumEventPhotos: Record<QuantumEventKind, { src: string; alt: string }> = {
  run: {
    src: '/images/match/events/event-jogging-v2.webp',
    alt: '온천천에서 저녁 조깅을 함께하는 대학생 다섯 명',
  },
  'board-game': {
    src: '/images/match/events/event-board-game.webp',
    alt: '보드게임 카페에서 함께 게임하는 대학생 다섯 명',
  },
  drinks: {
    src: '/images/match/events/event-drinks.webp',
    alt: '편안한 분위기에서 가볍게 건배하는 대학생 다섯 명',
  },
  dinner: {
    src: '/images/match/events/event-dinner.webp',
    alt: '식당에서 편하게 식사하는 대학생 다섯 명',
  },
  walk: {
    src: '/images/match/events/event-walk-v2.webp',
    alt: '자연 정원 산책로를 걸으며 대화하는 대학생 다섯 명',
  },
}

export interface QuantumEvent {
  id: string
  eyebrow: string
  title: string
  description: string
  schedule: string
  location: string
  kind: QuantumEventKind
  totalPeople: 5
  maleCount: 2 | 3
  femaleCount: 2 | 3
  duration: '90분' | '120분' | '150분'
  missions: readonly [string, string, string]
}

export const quantumEventCatalog: Record<QuantumEventMode, readonly QuantumEvent[]> = {
  tonight: [
    {
      id: 'tonight-onsenjjang-run',
      eyebrow: '운동으로 만나는 밤',
      title: '온천장 저녁 조깅',
      description: '대화할 수 있는 속도로 달리고 음료를 마시며 마무리해요.',
      schedule: '오늘 오후 7:30',
      location: '온천장역 1번 출구',
      kind: 'run',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
      duration: '90분',
      missions: ['온천장역에서 서로 가명으로 인사하기', '온천천을 대화 가능한 속도로 왕복하기', '음료 한 잔과 단체 사진으로 마무리하기'],
    },
    {
      id: 'tonight-board-game',
      eyebrow: '말문이 쉽게 트이는 밤',
      title: '보드게임 한 판',
      description: '규칙이 쉬운 게임부터 시작해 처음 만난 사람과 자연스럽게 이야기해요.',
      schedule: '오늘 오후 8:00',
      location: '부산대 앞 보드게임 카페',
      kind: 'board-game',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
      duration: '120분',
      missions: ['규칙이 쉬운 게임으로 팀 정하기', '두 종류의 게임을 번갈아 플레이하기', '오늘의 장면을 단체 사진으로 남기기'],
    },
    {
      id: 'tonight-casual-drinks',
      eyebrow: '오늘 가볍게 대화할 사람',
      title: '오늘 밤 한잔',
      description: '종료 시간을 먼저 정하고 과음 없이 한 자리에서 대화해요.',
      schedule: '오늘 오후 8:30',
      location: '부산대 장전동',
      kind: 'drinks',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
      duration: '120분',
      missions: ['첫 잔 전에 종료 시간을 함께 확인하기', '공통 질문 카드 세 장으로 대화하기', '과음 없이 한 자리에서 단체 사진으로 마무리하기'],
    },
    {
      id: 'tonight-late-dinner',
      eyebrow: '밤공기와 함께 걷기',
      title: '금강공원 밤 산책',
      description: '밝은 산책 구간만 함께 걷고 온천장 쪽에서 편하게 마무리해요.',
      schedule: '오늘 오후 9:00',
      location: '온천장 금강공원 입구',
      kind: 'walk',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
      duration: '90분',
      missions: ['금강공원 입구에서 서로 인사하기', '밝은 산책 구간의 체크포인트 두 곳 걷기', '온천장 방향으로 돌아와 단체 사진 남기기'],
    },
  ],
  scheduled: [
    {
      id: 'scheduled-board-game',
      eyebrow: '다음 주 저녁 약속',
      title: '보드게임 데이',
      description: '미리 날짜를 정하고 설명하기 쉬운 게임부터 함께 시작해요.',
      schedule: '다음 주 화요일 오후 7:30',
      location: '부산대 앞 보드게임 카페',
      kind: 'board-game',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
      duration: '150분',
      missions: ['하고 싶은 게임을 한 표씩 고르기', '가벼운 게임과 팀 게임을 하나씩 완료하기', '가장 재미있던 장면을 단체 사진으로 남기기'],
    },
    {
      id: 'scheduled-jogging',
      eyebrow: '다음 주 운동 약속',
      title: '온천천 천천히 달리기',
      description: '운동 경험과 관계없이 대화할 수 있는 속도로 달리고 음료를 마셔요.',
      schedule: '다음 주 수요일 오후 8:00',
      location: '온천천 산책로',
      kind: 'run',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
      duration: '120분',
      missions: ['온천천 입구에서 속도와 코스 정하기', '대화 가능한 속도로 정해진 구간 왕복하기', '음료를 마시며 단체 사진으로 마무리하기'],
    },
    {
      id: 'scheduled-dinner',
      eyebrow: '다음 주 가벼운 산책 약속',
      title: '금강공원 같이 걷기',
      description: '낮 시간의 금강공원 산책로를 걷고 카페에서 짧게 마무리해요.',
      schedule: '다음 주 목요일 오후 7:00',
      location: '온천장 금강공원 입구',
      kind: 'walk',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
      duration: '120분',
      missions: ['입구에서 오늘 걸을 구간 함께 확인하기', '전망이 열린 지점까지 천천히 걷기', '내려온 뒤 단체 사진과 음료로 마무리하기'],
    },
    {
      id: 'scheduled-walk',
      eyebrow: '주말 오후 약속',
      title: '주말 산책',
      description: '금강공원 산책로를 걸으며 천천히 대화하는 부담 없는 만남이에요.',
      schedule: '다음 주 토요일 오후 4:00',
      location: '온천장 금강공원 산책로',
      kind: 'walk',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
      duration: '120분',
      missions: ['입구에서 서로 가명으로 인사하기', '사진 포인트 두 곳을 함께 찾아 걷기', '종료 전에 단체 사진과 다음 행동을 확인하기'],
    },
  ],
}

export function getQuantumEventApiCatalog() {
  return Object.fromEntries(
    (Object.keys(quantumEventCatalog) as QuantumEventMode[]).map((mode) => [
      mode,
      quantumEventCatalog[mode].map((event) => ({
        id: event.id,
        mode,
        kind: event.kind,
        eyebrow: event.eyebrow,
        title: event.title,
        description: event.description,
        location: event.location,
        schedule: event.schedule,
        total_people: event.totalPeople,
        male_count: event.maleCount,
        female_count: event.femaleCount,
        duration: event.duration,
        missions: event.missions,
        remaining: null,
      })),
    ]),
  ) as Record<QuantumEventMode, Array<{
    id: string
    mode: QuantumEventMode
    kind: QuantumEventKind
    eyebrow: string
    title: string
    description: string
    location: string
    schedule: string
    total_people: 5
    male_count: 2 | 3
    female_count: 2 | 3
    duration: '90분' | '120분' | '150분'
    missions: readonly [string, string, string]
    remaining: null
  }>>
}

export function getQuantumEventStartHref(eventId: string, party: QuantumPartyType): string {
  return `/match/start?event=${encodeURIComponent(eventId)}&party=${party}`
}

export function getQuantumEventById(eventId: string | null | undefined): QuantumEvent | null {
  if (!eventId) return null

  for (const events of Object.values(quantumEventCatalog)) {
    const event = events.find((candidate) => candidate.id === eventId)
    if (event) return event
  }

  return null
}

export function isQuantumPartyType(value: unknown): value is QuantumPartyType {
  return value === 'solo' || value === 'friends'
}

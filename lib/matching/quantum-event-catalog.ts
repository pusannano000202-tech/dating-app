export type QuantumEventMode = 'tonight' | 'scheduled'
export type QuantumPartyType = 'solo' | 'friends'
export type QuantumEventKind = 'run' | 'board-game' | 'drinks' | 'dinner' | 'walk'

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
    },
    {
      id: 'tonight-board-game',
      eyebrow: '말문이 쉽게 트이는 밤',
      title: '보드게임',
      description: '규칙이 쉬운 게임부터 시작해 처음 만난 사람과 자연스럽게 이야기해요.',
      schedule: '오늘 오후 8:00',
      location: '부산대 앞 보드게임 카페',
      kind: 'board-game',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
    },
    {
      id: 'tonight-casual-drinks',
      eyebrow: '늦은 저녁 한 잔',
      title: '가볍게 한잔',
      description: '종료 시간을 먼저 정하고 과음 없이 한 자리에서 대화해요.',
      schedule: '오늘 오후 8:30',
      location: '부산대 장전동',
      kind: 'drinks',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
    },
    {
      id: 'tonight-late-dinner',
      eyebrow: '가볍게 시작하기',
      title: '늦은 저녁',
      description: '메뉴와 자리는 Quantum이 정하고 다섯 명이 편하게 식사부터 시작해요.',
      schedule: '오늘 오후 9:00',
      location: '부산대 정문 근처',
      kind: 'dinner',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
    },
  ],
  scheduled: [
    {
      id: 'scheduled-board-game',
      eyebrow: '다음 주 저녁 약속',
      title: '보드게임',
      description: '미리 날짜를 정하고 설명하기 쉬운 게임부터 함께 시작해요.',
      schedule: '다음 주 화요일 오후 7:30',
      location: '부산대 앞 보드게임 카페',
      kind: 'board-game',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
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
    },
    {
      id: 'scheduled-dinner',
      eyebrow: '다음 주 식사 약속',
      title: '저녁',
      description: 'Quantum이 정한 식당과 시간에 다섯 명이 모여 편하게 식사해요.',
      schedule: '다음 주 목요일 오후 7:00',
      location: '부산대 정문 근처',
      kind: 'dinner',
      totalPeople: 5,
      maleCount: 2,
      femaleCount: 3,
    },
    {
      id: 'scheduled-walk',
      eyebrow: '주말 오후 약속',
      title: '산책',
      description: '금강공원 산책로를 걸으며 천천히 대화하는 부담 없는 만남이에요.',
      schedule: '다음 주 토요일 오후 4:00',
      location: '온천장 금강공원 산책로',
      kind: 'walk',
      totalPeople: 5,
      maleCount: 3,
      femaleCount: 2,
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

export type TonightActivityKind =
  | 'bar'
  | 'board_game'
  | 'cafe'
  | 'walk'
  | 'shopping'
  | 'experience'
  | 'online_game'
  | 'other'

export type TonightVenueCategory =
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'activity'
  | 'public-meeting-point'
  | 'other'

export interface TonightActivityTemplate {
  id: string
  title: string
  description: string
  imageUrl: string
  imageAlt: string
  activityKind: TonightActivityKind
  durationMinutes: number
  venueCategories: readonly TonightVenueCategory[]
}

type TemplatePair = readonly [TonightActivityTemplate, TonightActivityTemplate]

const BAR_ACTIVITIES: TemplatePair = [
  {
    id: 'pnu-snack-worldcup',
    title: '부산대 숨은 안주 월드컵',
    description: '팀원들이 대표 안주를 함께 맛보고 토너먼트로 오늘의 원픽을 정해요.',
    imageUrl: '/images/match/events/event-drinks.webp',
    imageAlt: '테이블에서 음식과 음료를 함께 고르는 사람들',
    activityKind: 'bar',
    durationMinutes: 75,
    venueCategories: ['bar'],
  },
  {
    id: 'pnu-darts-team-battle',
    title: '다트 팀 배틀 한 판',
    description: '간단한 연습 뒤 팀을 나눠 다트 세 라운드를 겨루며 자연스럽게 친해져요.',
    imageUrl: '/images/match/events/event-drinks.webp',
    imageAlt: '저녁 공간에서 팀 활동을 즐기는 사람들',
    activityKind: 'experience',
    durationMinutes: 70,
    venueCategories: ['bar', 'activity'],
  },
] as const

const PLAY_ACTIVITIES: TemplatePair = [
  {
    id: 'pnu-boardgame-three-match',
    title: '보드게임 팀전 3종',
    description: '설명하기 쉬운 협동·추리·순발력 게임을 한 판씩 하며 팀 호흡을 맞춰요.',
    imageUrl: '/images/match/events/event-board-game.webp',
    imageAlt: '보드게임을 함께 즐기는 대학생 모임',
    activityKind: 'board_game',
    durationMinutes: 80,
    venueCategories: ['activity'],
  },
  {
    id: 'pnu-table-mini-league',
    title: '테이블 미니게임 리그',
    description: '순발력 카드게임과 밸런스 게임을 짧게 돌며 팀원 모두 대화에 참여해요.',
    imageUrl: '/images/match/events/event-board-game.webp',
    imageAlt: '테이블 미니게임에 집중하는 사람들',
    activityKind: 'experience',
    durationMinutes: 65,
    venueCategories: ['activity'],
  },
] as const

const TASTE_ACTIVITIES: TemplatePair = [
  {
    id: 'pnu-dessert-pick-tour',
    title: '디저트 원픽 테이스팅',
    description: '서로 다른 디저트를 나눠 맛보고 취향표를 완성해 오늘의 원픽을 골라요.',
    imageUrl: '/images/match/events/event-dinner.webp',
    imageAlt: '디저트와 음식을 나누어 맛보는 모임',
    activityKind: 'cafe',
    durationMinutes: 70,
    venueCategories: ['cafe'],
  },
  {
    id: 'pnu-night-menu-tournament',
    title: '오늘의 야식 메뉴 토너먼트',
    description: '후보 메뉴를 함께 비교하고 한 테이블에서 최종 우승 메뉴를 직접 맛봐요.',
    imageUrl: '/images/match/events/event-dinner.webp',
    imageAlt: '저녁 메뉴를 함께 고르는 대학생 모임',
    activityKind: 'cafe',
    durationMinutes: 75,
    venueCategories: ['restaurant', 'cafe'],
  },
] as const

const TEMPLATE_GROUPS = [BAR_ACTIVITIES, PLAY_ACTIVITIES, TASTE_ACTIVITIES] as const

export const TONIGHT_ACTIVITY_TEMPLATE_CATALOG: readonly TonightActivityTemplate[] = Object.freeze(
  TEMPLATE_GROUPS.flatMap((group) => group).map((template) => Object.freeze({
    ...template,
    venueCategories: Object.freeze([...template.venueCategories]),
  })),
)

function parseServiceDay(serviceDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new TypeError('invalid_service_date')
  const timestamp = Date.parse(`${serviceDate}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== serviceDate) {
    throw new TypeError('invalid_service_date')
  }
  return Math.floor(timestamp / 86_400_000)
}

function marketOffset(marketCode: string): number {
  if (!/^[A-Z0-9_-]{2,24}$/.test(marketCode)) throw new TypeError('invalid_market_code')
  let hash = 2_166_136_261
  for (const character of marketCode) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

/**
 * Picks one bar, one play and one taste activity for a service day.
 *
 * The Gray-code cycle changes at least one choice every day, covers all eight
 * combinations before repeating, and remains deterministic so retries and
 * scheduled jobs cannot create a different round for the same market/date.
 */
export function selectTonightActivityTemplates({
  marketCode,
  serviceDate,
}: {
  marketCode: string
  serviceDate: string
}): readonly [TonightActivityTemplate, TonightActivityTemplate, TonightActivityTemplate] {
  const day = parseServiceDay(serviceDate)
  const offset = marketOffset(marketCode)
  const cycleIndex = (day + offset) & 7
  const grayCode = cycleIndex ^ (cycleIndex >> 1)
  const selected = TEMPLATE_GROUPS.map((group, groupIndex) => group[(grayCode >> groupIndex) & 1])

  const orderOffset = (day + (offset % 3)) % 3
  const ordered = [
    selected[orderOffset],
    selected[(orderOffset + 1) % 3],
    selected[(orderOffset + 2) % 3],
  ] as [TonightActivityTemplate, TonightActivityTemplate, TonightActivityTemplate]

  return Object.freeze(ordered)
}

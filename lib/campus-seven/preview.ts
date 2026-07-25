import type {
  CampusSevenDashboard,
  CampusSevenExperiencePreview,
  CampusSevenTab,
} from '@/components/matching/campus-seven/CampusSevenExperience'
import { getCampusSevenActionAvailability } from '@/lib/campus-seven/action-availability'
import { getCampusSevenLiveGuide } from '@/lib/campus-seven/live-guide'

export type CampusSevenPreviewSceneName =
  | 'waiting'
  | 'day-two-team'
  | 'interest'
  | 'date-request'
  | 'final-choice'
  | 'final-response'
  | 'final-result'
  | 'people'
  | 'safety'

export type CampusSevenPreviewScene = CampusSevenExperiencePreview & {
  scene: CampusSevenPreviewSceneName
  focusText: string
}

const PREVIEW_PARTICIPANTS: CampusSevenDashboard['participants'] = [
  participant('u-m1', '은하', 'male', '/appearance-ideal/male-64/MI01.jpg', '김도윤', 23, '기계공학부'),
  participant('u-m2', '파도', 'male', '/appearance-ideal/male-64/MI02.jpg', '박현우', 24, '경영학과'),
  participant('u-m3', '노을', 'male', '/appearance-ideal/male-64/MI03.jpg', '이준서', 22, '전기전자공학부'),
  participant('u-m4', '여름', 'male', '/appearance-ideal/male-64/MI04.jpg', '최민재', 25, '심리학과'),
  participant('u-f1', '새벽', 'female', '/appearance-ideal/female-64/FI01.jpg', '윤서아', 22, '미디어커뮤니케이션학과'),
  participant('u-f2', '구름', 'female', '/appearance-ideal/female-64/FI02.jpg', '정하린', 23, '국어국문학과'),
  participant('u-f3', '라일락', 'female', '/appearance-ideal/female-64/FI03.jpg', '한지우', 24, '간호학과'),
  participant('u-f4', '별빛', 'female', '/appearance-ideal/female-64/FI04.jpg', '오수빈', 22, '디자인학과'),
]

const SCENES: Record<CampusSevenPreviewSceneName, Omit<CampusSevenPreviewScene, 'dashboard'>> = {
  waiting: { scene: 'waiting', initialTab: 'live', label: 'Day 3 선택 전 LIVE', focusText: '지금 안내만 보이고 마음 선택은 아직 숨김' },
  'day-two-team': { scene: 'day-two-team', initialTab: 'live', label: 'Day 2 식사팀 선택', focusText: '함께 식사할 두 명을 골라주세요' },
  interest: { scene: 'interest', initialTab: 'live', label: 'Day 3 비공개 마음 선택', focusText: '오늘 더 알아가고 싶은 한 사람' },
  'date-request': { scene: 'date-request', initialTab: 'live', label: 'Day 6 특별 데이트 요청', focusText: '특별 데이트 요청' },
  'final-choice': { scene: 'final-choice', initialTab: 'live', label: 'Day 7 최종 선택', focusText: '최종 선택을 보낼 한 사람' },
  'final-response': { scene: 'final-response', initialTab: 'live', label: 'Day 7 최종 선택 응답', focusText: '도착한 최종 선택을 수락하거나 거절' },
  'final-result': { scene: 'final-result', initialTab: 'live', label: 'Day 7 성사 커플 공개', focusText: '성사된 최종 커플' },
  people: { scene: 'people', initialTab: 'people', label: 'Day 5 참가자 공개', focusText: '함께하는 8명' },
  safety: { scene: 'safety', initialTab: 'safety', label: '신고와 안전 이탈', focusText: '신고 또는 안전 이탈' },
}

export function getCampusSevenPreviewScene(value: string): CampusSevenPreviewScene | null {
  if (!isScene(value)) return null
  return {
    ...SCENES[value],
    dashboard: buildDashboard(value),
  }
}

function buildDashboard(scene: CampusSevenPreviewSceneName): CampusSevenDashboard {
  const dayNumber = scene === 'day-two-team' ? 2 : scene === 'people' ? 5 : scene === 'date-request' ? 6 : scene.startsWith('final') ? 7 : 3
  const currentUserId = scene === 'final-response'
    ? 'u-f2'
    : scene === 'day-two-team' || scene === 'date-request' || scene === 'people'
      ? 'u-f1'
      : 'u-m1'
  const current = PREVIEW_PARTICIPANTS.find((item) => item.userId === currentUserId) ?? PREVIEW_PARTICIPANTS[0]
  const startsAt = `2026-07-${20 + dayNumber}T10:00:00.000Z`
  const endsAt = `2026-07-${20 + dayNumber}T${dayNumber === 7 ? '14' : '13'}:00:00.000Z`
  const now = scene === 'interest'
    ? `2026-07-${20 + dayNumber}T12:40:00.000Z`
    : scene.startsWith('final')
      ? `2026-07-${20 + dayNumber}T14:10:00.000Z`
      : scene === 'date-request'
        ? `2026-07-${20 + dayNumber}T05:00:00.000Z`
        : scene === 'day-two-team'
          ? `2026-07-${20 + dayNumber}T10:10:00.000Z`
          : `2026-07-${20 + dayNumber}T11:10:00.000Z`

  const actionAvailability = getCampusSevenActionAvailability({
    schedule: { dayNumber, startsAt, endsAt },
    now,
  })

  return {
    application: { id: 'preview-application', status: 'accepted', appliedAt: '2026-07-18T03:00:00.000Z', cardSalePreference: false },
    enrollment: {
      id: `preview-enrollment-${current.userId}`,
      userId: current.userId,
      alias: current.alias,
      gender: current.gender,
      entryRole: scene === 'day-two-team' ? 'newcomer' : current.entryRole,
      status: 'active',
    },
    cohort: {
      id: 'preview-cohort',
      school: '부산대학교',
      status: scene === 'final-result' ? 'completed' : 'running',
      startDate: '2026-07-21',
      activityBudgetCapWon: 100000,
      refundableDepositWon: 50000,
    },
    dayNumber,
    participants: PREVIEW_PARTICIPANTS.map((item) => dayNumber >= 5 ? item : ({ ...item, verifiedName: null, exactAge: null })),
    liveGuide: getCampusSevenLiveGuide({
      dayNumber,
      startsAt,
      endsAt,
      now,
      meetingPointName: '부산대학교 정문 광장',
      venueName: '부산대 앞 공개 식당',
    }),
    actionAvailability,
    schedule: {
      id: `preview-schedule-${dayNumber}`,
      dayNumber,
      title: `Day ${dayNumber} 오늘의 장면`,
      summary: '앱 안내에 맞춰 공개된 장소에서 진행합니다.',
      meetingMode: dayNumber === 6 ? 'direct_to_venue' : 'campus_then_venue',
      budgetWon: dayNumber === 6 ? 15000 : dayNumber === 7 ? 20000 : 18000,
      startsAt,
      endsAt,
      meetingPointName: '부산대학교 정문 광장',
      meetingPointAddress: '부산 금정구 부산대학로63번길 2',
      venueName: '부산대 앞 공개 식당',
      venueAddress: '부산대역 도보 5분',
      venueBookingUrl: null,
      venueStatus: 'confirmed',
      allowedMenuNote: '음주 없이 식사와 카페 메뉴만 이용해요.',
    },
    reservationTask: null,
    attendance: { status: 'submitted', capturedAt: startsAt, deleteAfter: '2026-09-10T00:00:00.000Z' },
    interestVote: null,
    dayTwoTeam: null,
    dayFourTeam: null,
    gameResults: [],
    myGameRanks: [],
    dateChoiceEligible: scene === 'date-request',
    incomingDateChoices: scene === 'date-request'
      ? [{ id: 'preview-date-choice', chooserUserId: 'u-m2', chooserAlias: '파도', status: 'pending' }]
      : [],
    outgoingDateChoice: null,
    incomingFinalProposals: scene === 'final-response'
      ? [{ proposerUserId: 'u-m1', proposerAlias: '김도윤' }]
      : [],
    outgoingFinalProposal: scene === 'final-result'
      ? { targetUserId: 'u-f2', targetAlias: '정하린', response: 'accepted' }
      : null,
    finalPairs: scene === 'final-result'
      ? [{ proposerUserId: 'u-m1', proposerAlias: '김도윤', targetUserId: 'u-f2', targetAlias: '정하린' }]
      : [],
    deposit: { status: 'paid', amountWon: 50000 },
    depositReviews: [],
    cardPublication: null,
  }
}

function participant(
  userId: string,
  alias: string,
  gender: 'male' | 'female',
  photoUrl: string,
  verifiedName: string,
  exactAge: number,
  department: string,
): CampusSevenDashboard['participants'][number] {
  return {
    userId,
    alias,
    gender,
    photoUrl,
    verifiedName,
    exactAge,
    department,
    phone: null,
    entryRole: 'starter',
  }
}

function isScene(value: string): value is CampusSevenPreviewSceneName {
  return Object.prototype.hasOwnProperty.call(SCENES, value)
}

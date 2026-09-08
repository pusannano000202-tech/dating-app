import type { PublicPlaceDto } from '@/lib/places/contracts'

import type {
  AdminTonightData,
  PartnerTonightData,
  SuperAdminMemberView,
  SuperAdminTonightData,
  TonightActivityCard,
  TonightArrivalHelpView,
  TonightApplicationView,
  TonightJourneyView,
  TonightRoundView,
  UserTonightData,
} from './types'

export type RehearsalAdapters = Readonly<{
  user: import('./types').UserTonightAdapter
  partner: import('./types').PartnerTonightAdapter
  admin: import('./types').AdminTonightAdapter
  superAdmin: import('./types').SuperAdminTonightAdapter
}>

const round: TonightRoundView = {
  id: '11111111-1111-4111-8111-111111111111',
  marketCode: 'PNU',
  serviceDate: '2026-09-03',
  status: 'open',
  signupCloseAt: '2026-09-03T18:30:00+09:00',
  capacityLockAt: '2026-09-03T18:30:00+09:00',
  allocationPublishAt: '2026-09-03T18:32:00+09:00',
  depositDueAt: '2026-09-03T18:45:00+09:00',
  partnerAcceptanceDueAt: '2026-09-03T18:50:00+09:00',
  revealAt: '2026-09-03T18:55:00+09:00',
  arrivalAt: '2026-09-03T19:20:00+09:00',
  startsAt: '2026-09-03T19:30:00+09:00',
}

function roundStatus(stage: number): string {
  if (stage >= 7) return 'completed'
  if (stage >= 6) return 'in_progress'
  if (stage >= 4) return 'accepted'
  if (stage >= 3) return 'partner_confirmation'
  if (stage >= 1) return 'awaiting_deposits'
  return 'open'
}

const activities: [TonightActivityCard, TonightActivityCard, TonightActivityCard] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    title: '부산대 숨은 안주 월드컵',
    description: '다섯 명이 대표 안주를 함께 맛보고 토너먼트로 오늘의 원픽을 정해요.',
    imageUrl: '/images/match/events/event-drinks.webp',
    imageAlt: '테이블에서 음식과 음료를 함께 고르는 사람들',
    durationMinutes: 75,
    kind: 'bar',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    title: '보드게임 팀전 3종',
    description: '협동·추리·순발력 게임을 한 판씩 하며 다섯 명 모두 자연스럽게 대화해요.',
    imageUrl: '/images/match/events/event-board-game.webp',
    imageAlt: '보드게임을 함께 즐기는 다섯 명의 모임',
    durationMinutes: 80,
    kind: 'board_game',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    title: '디저트 원픽 테이스팅',
    description: '서로 다른 디저트를 나눠 맛보고 취향표를 완성해 오늘의 원픽을 골라요.',
    imageUrl: '/images/match/events/event-dinner.webp',
    imageAlt: '디저트와 음식을 나누어 맛보는 모임',
    durationMinutes: 70,
    kind: 'cafe',
  },
]

const venuePlace: PublicPlaceDto = {
  placeRef: 'venue:board-lounge',
  snapshotRevision: 'snapshot-2026-09-03-01',
  displayName: '장전 보드라운지',
  category: 'activity',
  areaLabel: '부산대역 3번 출구 인근',
  address: {
    road: '부산 금정구 금정로 68번길 12, 3층',
    evidence: 'operator-verified',
    verifiedAt: '2026-09-03T10:00:00+09:00',
  },
  coordinates: {
    latitude: 35.23071,
    longitude: 129.08414,
    evidence: 'operator-verified',
    verifiedAt: '2026-09-03T10:00:00+09:00',
  },
  providerLinks: {
    naver: { url: 'https://map.naver.com/p/search/%EC%9E%A5%EC%A0%84%20%EB%B3%B4%EB%93%9C%EB%9D%BC%EC%9A%B4%EC%A7%80', kind: 'search' },
    kakao: { url: 'https://map.kakao.com/?q=%EC%9E%A5%EC%A0%84%20%EB%B3%B4%EB%93%9C%EB%9D%BC%EC%9A%B4%EC%A7%80', kind: 'search' },
  },
}

const secondPlace: PublicPlaceDto = {
  ...venuePlace,
  placeRef: 'venue:evening-table',
  snapshotRevision: 'snapshot-2026-09-03-02',
  displayName: '장전 저녁테이블',
  category: 'bar',
  address: {
    road: '부산 금정구 부산대학로 50번길 8, 2층',
    evidence: 'operator-verified',
    verifiedAt: '2026-09-03T10:00:00+09:00',
  },
  coordinates: {
    latitude: 35.23152,
    longitude: 129.08351,
    evidence: 'operator-verified',
    verifiedAt: '2026-09-03T10:00:00+09:00',
  },
  providerLinks: {
    naver: { url: 'https://map.naver.com/p/search/%EC%9E%A5%EC%A0%84%20%EC%A0%80%EB%85%81%ED%85%8C%EC%9D%B4%EB%B8%94', kind: 'search' },
    kakao: { url: 'https://map.kakao.com/?q=%EC%9E%A5%EC%A0%84%20%EC%A0%80%EB%85%81%ED%85%8C%EC%9D%B4%EB%B8%94', kind: 'search' },
  },
}

const directoryAccounts = [
  { userId: '77777777-7777-4777-8777-777777777710', name: '김부산', email: 'busan@pusan.ac.kr' },
  { userId: '77777777-7777-4777-8777-777777777711', name: '정장전', email: 'owner@jangjeon.kr' },
] as const

const directoryVenues = [
  { venueId: '55555555-5555-4555-8555-555555555555', name: venuePlace.displayName, address: venuePlace.address?.road ?? null },
  { venueId: '55555555-5555-4555-8555-555555555556', name: secondPlace.displayName, address: secondPlace.address?.road ?? null },
] as const

function makeApplication(stage: number): TonightApplicationView | null {
  if (stage < 1) return null
  return {
    id: '22222222-2222-4222-8222-222222222222',
    status: stage >= 1 ? 'allocated' : 'applied',
    revision: 3,
    choices: activities.map((activity, index) => ({ activityId: activity.id, rank: index + 1 })),
    bundle: {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'confirmed',
      maxSize: 3,
      memberCount: 2,
    },
    deposit: {
      status: stage >= 7 ? 'held' : stage >= 2 ? 'paid' : 'pending',
      amount: 10000,
      revision: stage >= 7 ? 4 : stage >= 2 ? 2 : 1,
      refundStatus: stage >= 7 ? 'failed' : null,
      refundRevision: stage >= 7 ? 3 : null,
    },
  }
}

function makeJourney(stage: number): TonightJourneyView | null {
  if (stage < 1) return null
  const reveal = stage >= 4
  return {
    applicationId: '22222222-2222-4222-8222-222222222222',
    applicationStatus: 'allocated',
    teamId: '44444444-4444-4444-8444-444444444401',
    teamRevision: 4,
    teamCode: reveal ? 'Q-PNU-20260903-001' : null,
    teamStatus: stage >= 7
      ? 'completed'
      : stage >= 6
        ? 'in_progress'
        : stage >= 4
          ? 'revealed'
          : stage >= 3
            ? 'partner_pending'
            : 'deposit_pending',
    activityTitle: '보드게임 팀전 3종',
    canRevealExactVenue: reveal,
    attendanceStatus: stage >= 6 ? 'arrived' : 'pending',
    attendanceRevision: stage >= 6 ? 2 : 1,
    canMarkArrival: stage === 5,
    place: reveal ? venuePlace : null,
  }
}

function makeUserData(stage: number): UserTonightData {
  return {
    round: { ...round, status: roundStatus(stage) },
    activities,
    applicationsOpen: stage === 0,
    participationSummary: {
      scopeId: `tonight:${round.id}`,
      asOf: '2026-09-03T08:30:00.000Z',
      totalPeople: 7,
      genderBreakdown: {
        malePeople: 4,
        femalePeople: 2,
        otherOrUnspecifiedPeople: 1,
      },
      disclosureBasis: 'all_valid_participants',
      policyVersion: '2026-09-07-mandatory-aggregate-v1',
      basis: 'valid_applicants',
    },
    application: makeApplication(stage),
    journey: makeJourney(stage),
    arrivalHelpRequest: null,
  }
}

function makeArrivalHelpRequests(stage: number): TonightArrivalHelpView[] {
  if (stage < 5) return []
  return [{
    requestId: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaa1111',
    teamId: '44444444-4444-4444-8444-444444444402',
    teamCode: 'Q-PNU-20260903-002',
    venueName: venuePlace.displayName,
    category: 'team',
    status: 'requested',
    revision: 1,
    requestedAt: '2026-09-03T10:20:00.000Z',
    updatedAt: '2026-09-03T10:20:00.000Z',
    nextActor: 'partner',
    nextAction: '업장 담당자가 팀 번호를 보고 찾으러 갈 차례예요.',
  }]
}

function makePartnerData(stage: number): PartnerTonightData {
  const capacityStatus = stage >= 1 ? 'locked' : 'draft'
  const paidMemberCountFor = (memberCount: number) => stage >= 2 ? memberCount : stage >= 1 ? 3 : 0
  return {
    round: { ...round, status: roundStatus(stage) },
    venueId: '55555555-5555-4555-8555-555555555555',
    venueSnapshotId: '66666666-6666-4666-8666-666666666666',
    venueName: venuePlace.displayName,
    place: venuePlace,
    capacities: activities.map((activity, index) => ({
      id: `capacity-${index + 1}`,
      activityId: activity.id,
      activityTitle: activity.title,
      teamCapacity: index === 1 ? 3 : 1,
      ...(index === 1
        ? { maxTeamHeadcount: 6 as const }
        : { maxTeamHeadcount: 5 as const }),
      reservedTeamCount: stage >= 1 ? (index === 1 ? 2 : 1) : 0,
      status: capacityStatus,
      revision: stage >= 1 ? 2 : 1,
    })),
    teams: stage < 1 ? [] : [
      {
        id: '44444444-4444-4444-8444-444444444401',
        code: 'Q-PNU-20260903-001',
        status: stage >= 7
          ? 'completed'
          : stage >= 6
            ? 'in_progress'
            : stage >= 4
              ? 'revealed'
              : 'partner_pending',
        activityTitle: '보드게임 팀전 3종',
        teamRevision: 4,
        memberCount: 5,
        paidMemberCount: paidMemberCountFor(5),
        arrivedMemberCount: stage >= 5 ? 4 : 0,
        confirmedAttendeeCount: stage >= 7 ? 4 : null,
        serviceRevision: stage >= 7 ? 1 : 0,
        serviceConfirmAfter: '2026-09-03T20:50:00+09:00',
        canConfirmService: stage >= 7,
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        code: 'Q-PNU-20260903-002',
        status: stage >= 7
          ? 'completed'
          : stage >= 6
            ? 'in_progress'
            : stage >= 4
              ? 'revealed'
              : 'partner_pending',
        activityTitle: '보드게임 팀전 3종',
        teamRevision: 3,
        memberCount: 6,
        paidMemberCount: paidMemberCountFor(6),
        arrivedMemberCount: stage >= 5 ? 6 : 0,
        confirmedAttendeeCount: stage >= 7 ? 6 : null,
        serviceRevision: stage >= 7 ? 1 : 0,
        serviceConfirmAfter: '2026-09-03T20:50:00+09:00',
        canConfirmService: stage >= 7,
      },
    ],
    arrivalHelpRequests: makeArrivalHelpRequests(stage),
  }
}

function makeAdminData(stage: number): AdminTonightData {
  const partner = makePartnerData(stage)
  const teams = partner.teams.map((team, index) => ({
    id: team.id,
    teamNumber: index + 1,
    code: team.code,
    status: team.status,
    activityTitle: team.activityTitle,
    venueName: venuePlace.displayName,
    memberCount: team.memberCount,
    maleCount: 3,
    femaleCount: team.memberCount === 6 ? 3 : 2,
    paidCount: team.paidMemberCount,
    arrivedCount: team.arrivedMemberCount,
    confirmedCount: team.confirmedAttendeeCount,
    openReportCount: stage >= 5 && index === 1 ? 1 : 0,
  }))
  if (stage >= 1) {
    teams.push({
      id: '44444444-4444-4444-8444-444444444403',
      teamNumber: 3,
      code: 'Q-PNU-20260903-003',
      status: stage >= 7
        ? 'completed'
        : stage >= 6
          ? 'in_progress'
          : stage >= 4
            ? 'revealed'
            : 'partner_pending',
      activityTitle: '부산대 숨은 안주 월드컵',
      venueName: secondPlace.displayName,
      memberCount: 5,
      maleCount: 3,
      femaleCount: 2,
      paidCount: stage >= 2 ? 5 : 4,
      arrivedCount: stage >= 5 ? 5 : 0,
      confirmedCount: stage >= 7 ? 5 : null,
      openReportCount: 0,
    })
  }
  return {
    rounds: [{
      ...round,
      status: roundStatus(stage),
      applicationCount: 40,
      maleApplicationCount: 19,
      femaleApplicationCount: 21,
      waitlistedCount: stage >= 1 ? 24 : 0,
      settlementExceptionCount: stage >= 7 ? 2 : 0,
    }],
    activeRoundId: round.id,
    teams,
    roundPage: { cursor: null, nextCursor: null, limit: 50 },
    teamPage: { afterTeamNumber: null, nextAfterTeamNumber: null, limit: 50 },
    exceptionPage: {
      afterExceptionKey: null,
      nextAfterExceptionKey: null,
      limit: 50,
      totalCount: stage >= 7 ? 8 : stage >= 5 ? 2 : 0,
      counts: {},
    },
    financialHealth: {
      depositDispositionActiveCount: stage >= 7 ? 1 : 0,
      depositDeadLetterCount: stage >= 7 ? 1 : 0,
      oldestDepositDispositionActiveAt: stage >= 7 ? '2026-09-03T10:52:00.000Z' : null,
      settlementActiveCount: stage >= 7 ? 1 : 0,
      settlementDeadLetterCount: stage >= 7 ? 1 : 0,
      oldestSettlementActiveAt: stage >= 7 ? '2026-09-03T10:54:00.000Z' : null,
      refundActiveCount: 0,
      refundFailedCount: stage >= 7 ? 1 : 0,
      oldestRefundActiveAt: null,
      reconciliationActiveCount: 0,
      reconciliationFailedCount: stage >= 7 ? 1 : 0,
      oldestReconciliationActiveAt: null,
      notificationActiveCount: stage >= 7 ? 1 : 0,
      notificationFailedCount: stage >= 7 ? 1 : 0,
      oldestNotificationActiveAt: stage >= 7 ? '2026-09-03T10:55:00.000Z' : null,
      pushActiveCount: 0,
      pushFailedCount: stage >= 7 ? 1 : 0,
      oldestPushActiveAt: null,
      jobs: stage >= 7 ? [{
        kind: 'deposit_disposition',
        id: 'edededed-eded-4ded-8ded-ededededed01',
        revision: 3,
        teamId: '44444444-4444-4444-8444-444444444401',
        teamCode: 'Q-PNU-20260903-001',
        status: 'dead_letter',
        attemptCount: 8,
        lastErrorCode: 'business_transition_failed',
        createdAt: '2026-09-03T10:40:00.000Z',
        updatedAt: '2026-09-03T10:58:00.000Z',
      }, {
        kind: 'settlement',
        id: 'fefefefe-fefe-4efe-8efe-fefefefefe02',
        revision: 4,
        teamId: '44444444-4444-4444-8444-444444444403',
        teamCode: 'Q-PNU-20260903-003',
        status: 'dead_letter',
        attemptCount: 8,
        lastErrorCode: 'worker_deadline',
        createdAt: '2026-09-03T10:42:00.000Z',
        updatedAt: '2026-09-03T10:59:00.000Z',
      }] : [],
    },
    financialJobPage: {
      cursor: null,
      nextCursor: null,
      limit: 50,
    },
    allocationFailures: stage >= 1 ? [{
      roundId: round.id,
      lowerBoundTeamCount: 7,
      upperBoundTeamCount: 8,
      applicantCount: 40,
      attemptedAt: '2026-09-03T09:32:00.123456+00:00',
      errorCode: 'allocation_unproven',
      status: 'open',
      revision: 2,
    }] : [],
    allocationFailurePage: {
      cursor: null,
      nextCursor: null,
      limit: 50,
    },
    arrivalHelpRequests: makeArrivalHelpRequests(stage),
    exceptions: (stage >= 5 ? [
      {
        kind: 'missing_arrival' as const,
        teamId: '44444444-4444-4444-8444-444444444401',
        teamCode: 'Q-PNU-20260903-001',
        subjectUserId: '77777777-7777-4777-8777-777777777705',
        subjectName: '정도윤',
        subjectPhone: '010-0000-7705',
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        status: 'pending',
      },
      {
        kind: 'active_report' as const,
        teamId: '44444444-4444-4444-8444-444444444402',
        teamCode: 'Q-PNU-20260903-002',
        subjectUserId: '77777777-7777-4777-8777-777777777708',
        subjectName: '최도윤',
        subjectPhone: '010-0000-3340',
        reporterUserId: '77777777-7777-4777-8777-777777777709',
        reporterName: '한지우',
        reporterPhone: '010-0000-1182',
        reportId: '99999999-9999-4999-8999-999999999999',
        category: 'harassment',
        refundRequestId: null,
        refundRevision: null,
        status: 'open',
      },
      ...(stage >= 7 ? [{
        kind: 'refund_dead_letter' as const,
        teamId: '44444444-4444-4444-8444-444444444401',
        teamCode: 'Q-PNU-20260903-001',
        subjectUserId: null,
        subjectName: null,
        subjectPhone: null,
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        refundRevision: 3,
        status: 'dead_letter',
      }, {
        kind: 'service_confirmation_missing' as const,
        teamId: '44444444-4444-4444-8444-444444444401',
        teamCode: 'Q-PNU-20260903-001',
        subjectUserId: null,
        subjectName: null,
        subjectPhone: null,
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        serviceAttemptId: 'abababab-abab-4bab-8bab-abababababab',
        reportedAttendeeCount: 4,
        observedArrivedCount: 4,
        serviceConfirmationRevision: 0,
        status: 'confirmation_missing',
      }, {
        kind: 'headcount_mismatch' as const,
        teamId: '44444444-4444-4444-8444-444444444402',
        teamCode: 'Q-PNU-20260903-002',
        subjectUserId: null,
        subjectName: null,
        subjectPhone: null,
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        serviceAttemptId: 'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc',
        reportedAttendeeCount: 4,
        observedArrivedCount: 5,
        serviceConfirmationRevision: 0,
        status: 'mismatch',
      }, {
        kind: 'settlement_finalize_pending' as const,
        teamId: '44444444-4444-4444-8444-444444444403',
        teamCode: 'Q-PNU-20260903-003',
        subjectUserId: null,
        subjectName: null,
        subjectPhone: null,
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        status: 'pending',
      }, {
        kind: 'deposit_manual_review' as const,
        teamId: '44444444-4444-4444-8444-444444444401',
        teamCode: 'Q-PNU-20260903-001',
        subjectUserId: '77777777-7777-4777-8777-777777777705',
        subjectName: '정도윤',
        subjectPhone: '010-0000-7705',
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        status: 'manual_review',
      }, {
        kind: 'deposit_reconciliation_failed' as const,
        teamId: '44444444-4444-4444-8444-444444444402',
        teamCode: 'Q-PNU-20260903-002',
        subjectUserId: '77777777-7777-4777-8777-777777777708',
        subjectName: '최도윤',
        subjectPhone: '010-0000-3340',
        reporterUserId: null,
        reporterName: null,
        reporterPhone: null,
        reportId: null,
        category: null,
        refundRequestId: null,
        refundRevision: null,
        status: 'lookup_failed',
      }] : []),
    ] : []).map((exception, index) => ({
      ...exception,
      key: `0000000001:10:${exception.kind}:00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      detailLoaded: false,
    })),
  }
}

const memberFixtures: readonly SuperAdminMemberView[] = [
  ['77777777-7777-4777-8777-777777777701', '김하린', '010-0000-7701', '/appearance-ideal/female-64/FI03.jpg', 23, 'female', 76, 2, 'bundle-friend-a', 1],
  ['77777777-7777-4777-8777-777777777702', '서유나', '010-0000-7702', '/appearance-ideal/female-64/FI11.jpg', 22, 'female', 74, 0, 'bundle-friend-a', 2],
  ['77777777-7777-4777-8777-777777777703', '이준호', '010-0000-7703', '/appearance-ideal/male-64/MI08.jpg', 24, 'male', 75, 1, null, 3],
  ['77777777-7777-4777-8777-777777777704', '박해솔', '010-0000-7704', '/appearance-ideal/male-64/MI14.jpg', 23, 'male', 72, 0, null, 4],
  ['77777777-7777-4777-8777-777777777705', '정도윤', '010-0000-7705', '/appearance-ideal/male-64/MI19.jpg', 25, 'male', 73, -1, null, 5],
].map(([userId, name, phone, photo, age, gender, automatic, adjustment, bundle, seat]) => ({
  teamRevision: 3,
  applicationId: `application-${userId}`,
  userId: userId as string,
  name: name as string,
  phone: phone as string,
  photoUrls: [photo as string],
  age: age as number,
  gender: gender as 'male' | 'female',
  automaticScore: automatic as number,
  adjustment: adjustment as number,
  finalScore: (automatic as number) + (adjustment as number),
  featureRevision: 2,
  bundleId: bundle as string | null,
  seatNumber: seat as number,
  depositStatus: 'paid',
  attendanceStatus: seat === 5 ? 'pending' : 'arrived',
  attendanceRevision: 1,
}))

const femaleTrioSixthFixture: SuperAdminMemberView = {
  ...memberFixtures[4],
  applicationId: 'application-77777777-7777-4777-8777-777777777706',
  userId: '77777777-7777-4777-8777-777777777706',
  name: '윤서진',
  phone: '010-0000-7706',
  photoUrls: ['/appearance-ideal/female-64/FI18.jpg'],
  age: 24,
  gender: 'female',
  automaticScore: 71,
  adjustment: -1,
  finalScore: 70,
  bundleId: 'bundle-female-trio',
  seatNumber: 6,
}

function makeSuperData(stage: number): SuperAdminTonightData {
  const admin = makeAdminData(stage)
  const partnerTeamRevisions = new Map(
    makePartnerData(stage).teams.map((team) => [team.id, team.teamRevision] as const),
  )
  return {
    admin,
    databaseApplicationsOpen: stage === 0,
    activeTeamId: null,
    members: [],
    teamBundles: admin.teams.map((team, index) => {
      const teamRevision = partnerTeamRevisions.get(team.id) ?? 5
      return {
        teamId: team.id,
        teamCode: team.code,
        teamRevision,
        bundles: team.memberCount === 6 ? [
        { bundleId: 'bundle-female-trio', memberCount: 3 },
        { bundleId: `bundle-male-${index + 1}-1`, memberCount: 1 },
        { bundleId: `bundle-male-${index + 1}-2`, memberCount: 1 },
        { bundleId: `bundle-male-${index + 1}-3`, memberCount: 1 },
      ] : index === 0 ? [
        { bundleId: 'bundle-friend-a', memberCount: 2 },
        { bundleId: 'bundle-solo-a', memberCount: 1 },
        { bundleId: 'bundle-solo-b', memberCount: 1 },
        { bundleId: 'bundle-solo-c', memberCount: 1 },
      ] : [
        { bundleId: `bundle-friend-${index + 1}`, memberCount: 2 },
        { bundleId: `bundle-solo-${index + 1}-1`, memberCount: 1 },
        { bundleId: `bundle-solo-${index + 1}-2`, memberCount: 1 },
        { bundleId: `bundle-solo-${index + 1}-3`, memberCount: 1 },
      ],
      }
    }),
    audit: [
      ...(stage >= 2 ? [
        { id: 'audit-1', actor: '최고관리자 김종현', at: '18:36:12', action: 'appearance.adjusted', before: '{"score":7.4}', after: '{"score":7.6}' },
      ] : []),
      ...(stage >= 6 ? [
        { id: 'audit-2', actor: '운영자 이가영', at: '19:24:03', action: 'attendance.updated', before: '{"status":"pending"}', after: '{"status":"arrived"}' },
      ] : []),
    ],
    auditPage: {
      cursor: null,
      nextCursor: null,
      limit: 50,
    },
    memberships: [
      { id: 'member-market-1', revision: 1, label: '김하린 · kim***@pusan.ac.kr', role: 'user', marketCode: 'PNU', venueName: null, status: 'active' },
      { id: 'member-partner-1', revision: 1, label: '정장전 · owner***@mail.com', role: 'partner', marketCode: null, venueName: venuePlace.displayName, status: 'active' },
      { id: '77777777-7777-4777-8777-777777777799', revision: 0, label: '이가영 · ops***@quantum.kr', role: 'admin', marketCode: null, venueName: null, status: 'active' },
    ],
    accessLoaded: false,
    marketMembershipPage: {
      afterMembershipId: null,
      nextAfterMembershipId: null,
      limit: 50,
      userId: null,
    },
    partnerMembershipPage: {
      afterMembershipId: null,
      nextAfterMembershipId: null,
      limit: 50,
      userId: null,
      venueId: null,
    },
    venueSnapshots: [venuePlace, secondPlace],
    notificationFailures: stage >= 6 ? [
      {
        kind: 'push',
        id: '88888888-8888-4888-8888-888888888801',
        revision: 3,
        roundId: admin.activeRoundId ?? admin.rounds[0]?.id ?? '',
        teamId: admin.teams[0]?.id ?? null,
        eventType: 'arrival_due',
        recipientRef: 'usr_a1b2c3d4e5f6',
        teamRef: 'team_a1b2c3d4e5f6',
        failureCode: 'push_http_410',
        attemptCount: 5,
        failedAt: '2026-09-03T10:18:00.123456+00:00',
        resubscribeRequired: true,
      },
      {
        kind: 'in_app',
        id: '88888888-8888-4888-8888-888888888802',
        revision: 2,
        roundId: admin.activeRoundId ?? admin.rounds[0]?.id ?? '',
        teamId: admin.teams[1]?.id ?? null,
        eventType: 'partner_acceptance_due',
        recipientRef: 'usr_0f1e2d3c4b5a',
        teamRef: 'team_0f1e2d3c4b5a',
        failureCode: 'in_app_delivery_failed',
        attemptCount: 8,
        failedAt: '2026-09-03T09:51:00.654321+00:00',
        resubscribeRequired: false,
      },
    ] : [],
    notificationFailurePage: {
      cursor: null,
      nextCursor: null,
      limit: 50,
    },
  }
}

export function createRehearsalAdapters(stage: number): RehearsalAdapters {
  let userData = makeUserData(stage)
  let partnerData = makePartnerData(stage)
  let adminData = makeAdminData(stage)
  let superData = makeSuperData(stage)
  let arrivalHelpRequests = makeArrivalHelpRequests(stage)

  const refreshArrivalHelp = () => {
    const active = arrivalHelpRequests.filter((request) =>
      ['requested', 'acknowledged', 'escalated'].includes(request.status))
    userData = {
      ...userData,
      arrivalHelpRequest: active.find((request) => request.teamId === userData.journey?.teamId) ?? null,
    }
    partnerData = { ...partnerData, arrivalHelpRequests: active }
    adminData = { ...adminData, arrivalHelpRequests: active }
  }

  const updateArrivalHelp = (
    requestId: string,
    action: 'acknowledge' | 'escalate' | 'resolve',
    expectedRevision: number,
  ) => {
    const current = arrivalHelpRequests.find((request) => request.requestId === requestId)
    if (!current) throw new Error('현장 도움 요청을 찾지 못했어요.')
    if (current.revision !== expectedRevision) throw new Error('다른 곳에서 상태가 먼저 바뀌었어요.')
    const status = action === 'acknowledge'
      ? 'acknowledged' as const
      : action === 'escalate'
        ? 'escalated' as const
        : 'resolved' as const
    arrivalHelpRequests = arrivalHelpRequests.map((request) => request.requestId === requestId ? {
      ...request,
      status,
      revision: request.revision + 1,
      updatedAt: new Date().toISOString(),
      nextActor: status === 'escalated' ? 'operator' as const : status === 'acknowledged' ? 'partner' as const : null,
      nextAction: status === 'escalated'
        ? '운영자가 팀 번호와 업장을 확인하고 있어요.'
        : status === 'acknowledged'
          ? '업장 담당자가 찾으러 가고 있어요.'
          : '도움 요청이 해결됐어요.',
    } : request)
    refreshArrivalHelp()
  }

  const refreshShared = () => {
    refreshArrivalHelp()
    if (userData.journey) {
      const userPartnerTeam = partnerData.teams.find((team) => team.id === userData.journey?.teamId)
      if (userPartnerTeam) {
        userData = {
          ...userData,
          journey: {
            ...userData.journey,
            teamRevision: userPartnerTeam.teamRevision ?? userData.journey.teamRevision,
            teamStatus: userPartnerTeam.status,
          },
        }
      }
    }
    adminData = {
      ...adminData,
      teams: adminData.teams.map((team) => {
        const partnerTeam = partnerData.teams.find((item) => item.id === team.id)
        return partnerTeam ? {
          ...team,
          status: partnerTeam.status,
          paidCount: partnerTeam.paidMemberCount,
          arrivedCount: partnerTeam.arrivedMemberCount,
          confirmedCount: partnerTeam.confirmedAttendeeCount,
        } : team
      }),
    }
    const activeSuperTeam = adminData.teams.find((team) => team.id === superData.activeTeamId)
    superData = {
      ...superData,
      admin: adminData,
      members: activeSuperTeam
        ? superData.members.map((member, index) => ({
            ...member,
            depositStatus: index < activeSuperTeam.paidCount ? 'paid' : 'pending',
            attendanceStatus: index < activeSuperTeam.arrivedCount ? 'arrived' : 'pending',
            attendanceRevision: index < activeSuperTeam.arrivedCount ? 2 : 1,
          }))
        : superData.members,
    }
  }

  return {
    user: {
      async load() { return userData },
      async apply(input) {
        const allocatedFixture = makeApplication(1)!
        userData = {
          ...makeUserData(0),
          application: {
            ...allocatedFixture,
            status: 'applied',
            choices: input.rankedActivityIds.map((activityId, index) => ({ activityId, rank: index + 1 })),
            bundle: allocatedFixture.bundle ? {
              ...allocatedFixture.bundle,
              status: 'forming',
              memberCount: 1,
            } : null,
            deposit: null,
          },
          journey: null,
        }
        return userData
      },
      async beginDeposit(input) {
        if (!userData.application || userData.application.id !== input.applicationId) {
          throw new Error('현재 신청의 보증금만 결제할 수 있어요.')
        }
        const shouldIncrementTeamPaidCount = userData.application.deposit?.status !== 'paid'
        userData = { ...userData, application: { ...userData.application, deposit: { status: 'paid', amount: 10000, revision: 2, refundStatus: null, refundRevision: null } } }
        if (shouldIncrementTeamPaidCount && userData.journey?.teamId) {
          partnerData = {
            ...partnerData,
            teams: partnerData.teams.map((team) => team.id === userData.journey?.teamId
              ? { ...team, paidMemberCount: Math.min(team.memberCount, team.paidMemberCount + 1) }
              : team),
          }
        }
        refreshShared()
        return {}
      },
      async markArrival(input) {
        if (!userData.journey || userData.journey.teamId !== input.teamId) {
          throw new Error('현재 팀의 도착만 확인할 수 있어요.')
        }
        if (userData.journey.attendanceRevision !== input.expectedRevision) {
          throw new Error('다른 곳에서 출석 상태가 먼저 바뀌었어요.')
        }
        const shouldIncrementTeamArrival = userData.journey.attendanceStatus !== 'arrived'
        if (shouldIncrementTeamArrival) {
          userData = {
            ...userData,
            journey: {
              ...userData.journey,
              attendanceStatus: 'arrived',
              attendanceRevision: (userData.journey.attendanceRevision ?? 0) + 1,
              canMarkArrival: false,
            },
          }
          partnerData = {
            ...partnerData,
            teams: partnerData.teams.map((team) => team.id === input.teamId
              ? { ...team, arrivedMemberCount: Math.min(team.memberCount, team.arrivedMemberCount + 1) }
              : team),
          }
        }
        refreshShared()
        return userData
      },
      async requestArrivalHelp(input) {
        if (!userData.journey?.teamId || userData.journey.teamId !== input.teamId) {
          throw new Error('현재 팀의 도움 요청만 만들 수 있어요.')
        }
        const existing = arrivalHelpRequests.find((request) =>
          request.teamId === input.teamId && ['requested', 'acknowledged', 'escalated'].includes(request.status))
        if (!existing) {
          arrivalHelpRequests = [...arrivalHelpRequests, {
            requestId: `fixture-arrival-help-${arrivalHelpRequests.length + 1}`,
            teamId: input.teamId,
            teamCode: userData.journey.teamCode ?? 'Q-PNU-20260903-001',
            venueName: userData.journey.place?.displayName ?? venuePlace.displayName,
            category: input.category,
            status: 'requested',
            revision: 1,
            requestedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nextActor: 'partner',
            nextAction: '업장 담당자가 팀 번호를 보고 찾으러 갈 차례예요.',
          }]
        }
        refreshShared()
        return userData
      },
      async cancelArrivalHelp(input) {
        const current = arrivalHelpRequests.find((request) => request.requestId === input.requestId)
        if (!current || current.teamId !== userData.journey?.teamId) throw new Error('도움 요청을 찾지 못했어요.')
        if (current.revision !== input.expectedRevision) throw new Error('다른 곳에서 상태가 먼저 바뀌었어요.')
        arrivalHelpRequests = arrivalHelpRequests.map((request) => request.requestId === input.requestId ? {
          ...request,
          status: 'cancelled',
          revision: request.revision + 1,
          updatedAt: new Date().toISOString(),
          nextActor: null,
          nextAction: '도움 요청을 취소했어요.',
        } : request)
        refreshShared()
        return userData
      },
      async report() { return { reportId: 'fixture-report-created' } },
      async requestRefund() { return { refundRequestId: 'fixture-refund-created' } },
    },
    partner: {
      async load() { return partnerData },
      async saveCapacity(input) {
        partnerData = { ...partnerData, capacities: partnerData.capacities.map((capacity) => capacity.activityId === input.activityId ? { ...capacity, teamCapacity: input.teamCapacity, maxTeamHeadcount: input.maxTeamHeadcount, status: 'locked', revision: capacity.revision + 1 } : capacity) }
        return partnerData
      },
      async acceptTeam(input) {
        partnerData = { ...partnerData, teams: partnerData.teams.map((team) => team.id === input.teamId ? { ...team, status: 'accepted', teamRevision: (team.teamRevision ?? 0) + 1 } : team) }
        refreshShared()
        return partnerData
      },
      async confirmAttendance(input) {
        partnerData = { ...partnerData, teams: partnerData.teams.map((team) => team.id === input.teamId ? { ...team, status: 'completed', confirmedAttendeeCount: input.confirmedAttendeeCount, serviceRevision: (team.serviceRevision ?? 0) + 1 } : team) }
        refreshShared()
        return partnerData
      },
      async updateArrivalHelp(input) {
        if (input.venueId !== partnerData.venueId) throw new Error('다른 업장의 요청은 처리할 수 없어요.')
        updateArrivalHelp(input.requestId, input.action, input.expectedRevision)
        refreshShared()
        return partnerData
      },
    },
    admin: {
      async load(input) {
        return {
          ...adminData,
          activeRoundId: input?.roundId ?? adminData.activeRoundId,
          roundPage: {
            ...adminData.roundPage,
            cursor: input?.roundCursor ?? null,
          },
          teamPage: {
            ...adminData.teamPage,
            afterTeamNumber: input?.afterTeamNumber ?? null,
          },
          exceptionPage: {
            ...adminData.exceptionPage,
            afterExceptionKey: input?.afterExceptionKey ?? null,
          },
          financialJobPage: {
            ...adminData.financialJobPage,
            cursor: input?.financialCursor ?? null,
          },
          allocationFailurePage: {
            ...adminData.allocationFailurePage,
            cursor: input?.allocationFailureCursor ?? null,
          },
        }
      },
      async loadExceptionDetail(input) {
        const found = adminData.exceptions.find((exception) => exception.key === input.exceptionKey)
        if (!found) throw new Error('선택한 예외를 찾지 못했어요.')
        const detail = { ...found, detailLoaded: true }
        adminData = {
          ...adminData,
          exceptions: adminData.exceptions.map((exception) =>
            exception.key === input.exceptionKey ? detail : exception),
        }
        refreshShared()
        return detail
      },
      async recordCall(input) {
        adminData = { ...adminData, exceptions: adminData.exceptions.map((exception) => exception.teamId === input.teamId && exception.subjectUserId === input.subjectUserId ? { ...exception, callStatus: input.outcome } : exception) }
        refreshShared()
        return adminData
      },
      async updateArrivalHelp(input) {
        updateArrivalHelp(input.requestId, input.action, input.expectedRevision)
        refreshShared()
        return adminData
      },
    },
    superAdmin: {
      async load(input) {
        const teamId = input?.teamId ?? null
        const selectedTeam = superData.admin.teams.find((team) => team.id === teamId)
        const teamRevision = superData.teamBundles.find((team) => team.teamId === teamId)?.teamRevision ?? 0
        const baseMembers = !teamId
          ? []
          : teamId === superData.admin.teams[0]?.id
            ? memberFixtures.map((member) => ({ ...member, teamRevision }))
            : memberFixtures.map((member, index) => ({ ...member, teamRevision, applicationId: `${member.applicationId}-${teamId}`, userId: `${member.userId.slice(0, -1)}${index + 1}`, name: ['최도윤', '한지우', '강민재', '정수빈', '오세현'][index] }))
        const selectedMembers = selectedTeam?.memberCount === 6
          ? [
              ...baseMembers.map((member) => member.gender === 'female'
                ? { ...member, bundleId: 'bundle-female-trio' }
                : member),
              { ...femaleTrioSixthFixture, teamRevision, applicationId: `${femaleTrioSixthFixture.applicationId}-${teamId}` },
            ]
          : baseMembers
        const synchronizedMembers = selectedMembers.map((member, index) => ({
          ...member,
          teamRevision,
          depositStatus: index < (selectedTeam?.paidCount ?? 0) ? 'paid' : 'pending',
          attendanceStatus: index < (selectedTeam?.arrivedCount ?? 0) ? 'arrived' : 'pending',
          attendanceRevision: index < (selectedTeam?.arrivedCount ?? 0) ? 2 : 1,
        }))
        superData = {
          ...superData,
          admin: {
            ...superData.admin,
            roundPage: {
              ...superData.admin.roundPage,
              cursor: input?.roundCursor ?? superData.admin.roundPage.cursor,
            },
            teamPage: {
              ...superData.admin.teamPage,
              afterTeamNumber: input?.afterTeamNumber ?? null,
            },
            exceptionPage: {
              ...superData.admin.exceptionPage,
              afterExceptionKey: input?.afterExceptionKey ?? null,
            },
            financialJobPage: {
              ...superData.admin.financialJobPage,
              cursor: input?.financialCursor ?? null,
            },
            allocationFailurePage: {
              ...superData.admin.allocationFailurePage,
              cursor: input?.allocationFailureCursor ?? null,
            },
          },
          activeTeamId: teamId,
          members: synchronizedMembers,
          notificationFailurePage: {
            ...superData.notificationFailurePage,
            cursor: input?.notificationFailureCursor ?? superData.notificationFailurePage.cursor,
          },
          auditPage: {
            ...superData.auditPage,
            cursor: input?.auditCursor ?? superData.auditPage.cursor,
          },
        }
        return superData
      },
      async loadExceptionDetail(input) {
        const found = superData.admin.exceptions.find((exception) => exception.key === input.exceptionKey)
        if (!found) throw new Error('선택한 예외를 찾지 못했어요.')
        const detail = { ...found, detailLoaded: true }
        adminData = {
          ...adminData,
          exceptions: adminData.exceptions.map((exception) =>
            exception.key === input.exceptionKey ? detail : exception),
        }
        superData = { ...superData, admin: adminData }
        return detail
      },
      async loadAccess(input) {
        superData = {
          ...superData,
          accessLoaded: true,
          marketMembershipPage: {
            afterMembershipId: input?.afterMembershipId ?? null,
            nextAfterMembershipId: null,
            limit: 50,
            userId: input?.userId ?? null,
          },
          partnerMembershipPage: {
            afterMembershipId: input?.partnerAfterMembershipId ?? null,
            nextAfterMembershipId: null,
            limit: 50,
            userId: input?.partnerUserId ?? null,
            venueId: input?.partnerVenueId ?? null,
          },
        }
        return superData
      },
      async loadAccessDetail(input) {
        const found = superData.memberships.find((membership) => membership.id === input.membershipId)
        if (!found) throw new Error('선택한 사용자 자격을 찾지 못했어요.')
        const detail = { ...found, detailLoaded: true }
        superData = {
          ...superData,
          memberships: superData.memberships.map((membership) =>
            membership.id === input.membershipId ? detail : membership),
        }
        return detail
      },
      async searchDirectory(query) {
        const accounts = directoryAccounts.filter((account) => !query || [account.name, account.email].some((value) => value.includes(query)))
        return {
          accounts,
          venues: directoryVenues,
        }
      },
      async setDatabaseApplicationsOpen(input) {
        const before = superData.databaseApplicationsOpen
        superData = {
          ...superData,
          databaseApplicationsOpen: input.value,
          audit: [{
            id: `audit-database-gate-${Date.now()}`,
            actor: '현재 최고관리자',
            at: '방금',
            action: 'app_config.updated',
            before: JSON.stringify({ key: 'tonight_applications_open', value: before }),
            after: JSON.stringify({ key: 'tonight_applications_open', value: input.value }),
          }, ...superData.audit],
        }
        return superData
      },
      async adjustAppearance(input) {
        const members = superData.members.map((member) => member.applicationId === input.applicationId ? { ...member, adjustment: input.score - member.automaticScore, finalScore: input.score, featureRevision: member.featureRevision + 1 } : member)
        superData = { ...superData, members, audit: [{ id: `audit-score-${Date.now()}`, actor: '현재 최고관리자', at: '방금', action: 'appearance.adjusted', before: '{"score":"previous"}', after: `{"score":${input.score}}` }, ...superData.audit] }
        return superData
      },
      async swapBundles(input) {
        superData = { ...superData, audit: [{ id: `audit-swap-${Date.now()}`, actor: '현재 최고관리자', at: '방금', action: 'friend_bundle.swapped', before: JSON.stringify({ team: input.teamAId, bundle: input.bundleAId }), after: JSON.stringify({ team: input.teamBId, bundle: input.bundleAId }) }, ...superData.audit] }
        return superData
      },
      async updateAttendance(input) {
        superData = { ...superData, members: superData.members.map((member) => member.userId === input.userId ? { ...member, attendanceStatus: input.status, attendanceRevision: member.attendanceRevision + 1 } : member), audit: [{ id: `audit-attendance-${Date.now()}`, actor: '현재 최고관리자', at: '방금', action: 'attendance.updated', before: '{"status":"previous"}', after: JSON.stringify({ status: input.status }) }, ...superData.audit] }
        return superData
      },
      async recoverServiceConfirmation(input) {
        adminData = {
          ...adminData,
          exceptions: adminData.exceptions.filter((exception) => !(
            exception.teamId === input.teamId
            && (exception.kind === 'service_confirmation_missing' || exception.kind === 'headcount_mismatch')
          )),
        }
        superData = {
          ...superData,
          admin: adminData,
          audit: [{
            id: `audit-service-recovery-${Date.now()}`,
            actor: '현재 최고관리자',
            at: '방금',
            action: 'service_confirmation.recovered',
            before: JSON.stringify({ teamId: input.teamId, revision: input.expectedRevision }),
            after: JSON.stringify({ teamId: input.teamId, attemptId: input.attemptId }),
          }, ...superData.audit],
        }
        return superData
      },
      async retryRefund(input) {
        adminData = {
          ...adminData,
          exceptions: adminData.exceptions.map((exception) => (
            exception.kind === 'refund_dead_letter' && exception.refundRequestId === input.requestId
              ? { ...exception, status: 'retry_queued', refundRevision: input.expectedRevision + 1 }
              : exception
          )),
        }
        superData = {
          ...superData,
          admin: adminData,
          audit: [{
            id: `audit-refund-${Date.now()}`,
            actor: '현재 최고관리자',
            at: '방금',
            action: 'refund.retry_queued',
            before: JSON.stringify({ requestId: input.requestId, revision: input.expectedRevision, status: 'dead_letter' }),
            after: JSON.stringify({ requestId: input.requestId, revision: input.expectedRevision + 1, status: 'retry_queued' }),
          }, ...superData.audit],
        }
        return superData
      },
      async retryFinancialJob(input) {
        adminData = {
          ...adminData,
          financialHealth: {
            ...adminData.financialHealth,
            depositDeadLetterCount: input.jobKind === 'deposit_disposition'
              ? Math.max(0, adminData.financialHealth.depositDeadLetterCount - 1)
              : adminData.financialHealth.depositDeadLetterCount,
            settlementDeadLetterCount: input.jobKind === 'settlement'
              ? Math.max(0, adminData.financialHealth.settlementDeadLetterCount - 1)
              : adminData.financialHealth.settlementDeadLetterCount,
            jobs: adminData.financialHealth.jobs.filter((job) => job.id !== input.jobId),
          },
        }
        superData = {
          ...superData,
          admin: adminData,
          audit: [{
            id: `audit-financial-${Date.now()}`,
            actor: '현재 최고관리자',
            at: '방금',
            action: 'financial_job.retry_requested',
            before: JSON.stringify({ kind: input.jobKind, jobId: input.jobId, revision: input.expectedRevision, status: 'dead_letter' }),
            after: JSON.stringify({ kind: input.jobKind, jobId: input.jobId, revision: input.expectedRevision + 1, status: 'pending' }),
          }, ...superData.audit],
        }
        return superData
      },
      async retryNotificationFailure(input) {
        const target = superData.notificationFailures.find((failure) => failure.id === input.failureId)
        superData = {
          ...superData,
          notificationFailures: superData.notificationFailures.filter((failure) => failure.id !== input.failureId),
          audit: [{
            id: `audit-notification-${Date.now()}`,
            actor: '현재 최고관리자',
            at: '방금',
            action: target?.resubscribeRequired
              ? 'notification.resubscribe_notice_queued'
              : 'notification.retry_queued',
            before: JSON.stringify({
              kind: input.failureKind,
              failureId: input.failureId,
              revision: input.expectedRevision,
            }),
            after: JSON.stringify({
              status: target?.resubscribeRequired ? 'resubscribe_required' : 'retry_queued',
            }),
          }, ...superData.audit],
        }
        return superData
      },
      async updateMembership(input) {
        if (input.action === 'revoke') {
          superData = { ...superData, memberships: superData.memberships.map((membership) => membership.id === input.subject ? { ...membership, status: 'revoked' } : membership) }
        } else {
          const account = directoryAccounts.find((candidate) => candidate.userId === input.subject)
          const venue = directoryVenues.find((candidate) => candidate.venueId === input.venueId)
          superData = {
            ...superData,
            memberships: [{
              id: `membership-${Date.now()}`,
              revision: 1,
              label: account ? `${account.name} · ${account.email}` : '선택한 가입 계정',
              role: input.role,
              marketCode: input.marketCode ?? null,
              venueName: venue?.name ?? null,
              status: 'active',
            }, ...superData.memberships],
          }
        }
        return superData
      },
      async saveVenueSnapshot(input) {
        const nextPlace: PublicPlaceDto = { ...venuePlace, placeRef: `venue:${input.venueId}`, snapshotRevision: `fixture-${Date.now()}`, coordinates: { latitude: input.latitude, longitude: input.longitude, evidence: 'operator-verified', verifiedAt: new Date().toISOString() } }
        superData = { ...superData, venueSnapshots: [nextPlace, ...superData.venueSnapshots] }
        return superData
      },
      async loadVenueSnapshots(input) {
        const selectedVenue = directoryVenues.find((venue) => venue.venueId === input.venueId)
        return superData.venueSnapshots.filter((place) => (
          place.placeRef === `venue:${input.venueId}`
          || place.displayName === selectedVenue?.name
        ))
      },
    },
  }
}

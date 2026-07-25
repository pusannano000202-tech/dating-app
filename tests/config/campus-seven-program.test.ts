import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDayTwoTeams,
  CAMPUS_SEVEN_DAYS,
  CAMPUS_SEVEN_GAMES,
  CAMPUS_SEVEN_RESERVATION_PENALTY_WON,
  CAMPUS_SEVEN_TOTAL_BUDGET_WON,
  containsProhibitedContact,
  getCampusSevenFeatureState,
  getDayFourStandings,
  getParticipantDisclosure,
  getReservationPenaltyCandidate,
  isAdultOnDate,
  resolveFinalPairs,
} from '../../lib/campus-seven/program'

test('campus seven schedule keeps the approved seven-day 97,000 won budget', () => {
  assert.equal(CAMPUS_SEVEN_DAYS.length, 7)
  assert.equal(
    CAMPUS_SEVEN_DAYS.reduce((total, day) => total + day.budgetWon, 0),
    97_000,
  )
  assert.equal(CAMPUS_SEVEN_TOTAL_BUDGET_WON, 100_000)
  assert.equal(CAMPUS_SEVEN_DAYS[6]?.endsAt, '23:00')
})

test('day four uses the five approved familiar board games', () => {
  assert.deepEqual(CAMPUS_SEVEN_GAMES, [
    '윷놀이',
    '할리갈리',
    '우노',
    '다빈치 코드',
    '루미큐브',
  ])
})

test('participant identity is revealed only from day five and contact only to a final pair', () => {
  assert.deepEqual(getParticipantDisclosure({ dayNumber: 4, isFinalPair: false }), {
    alias: true,
    verifiedName: false,
    exactAge: false,
    department: false,
    phone: false,
  })
  assert.deepEqual(getParticipantDisclosure({ dayNumber: 5, isFinalPair: false }), {
    alias: true,
    verifiedName: true,
    exactAge: true,
    department: false,
    phone: false,
  })
  assert.deepEqual(getParticipantDisclosure({ dayNumber: 7, isFinalPair: true }), {
    alias: true,
    verifiedName: true,
    exactAge: true,
    department: true,
    phone: true,
  })
})

test('production requires separate program and application flags while card payment stays off by default', () => {
  assert.deepEqual(getCampusSevenFeatureState({
    nodeEnv: 'production',
    enabled: 'false',
    applicationsOpen: 'true',
    cardPaymentsEnabled: 'true',
  }), {
    visible: false,
    applicationsOpen: false,
    cardPaymentsEnabled: false,
  })

  assert.deepEqual(getCampusSevenFeatureState({
    nodeEnv: 'production',
    enabled: 'true',
    applicationsOpen: 'true',
    cardPaymentsEnabled: 'false',
  }), {
    visible: true,
    applicationsOpen: true,
    cardPaymentsEnabled: false,
  })
})

test('day two always creates two balanced teams without exposing newcomer-to-newcomer choice', () => {
  const result = buildDayTwoTeams({
    existingMen: ['m1', 'm2', 'm3'],
    existingWomen: ['w1', 'w2', 'w3'],
    newcomerMan: 'm4',
    newcomerWoman: 'w4',
    newcomerManChoices: ['w1', 'w3'],
    newcomerWomanChoices: ['m1', 'm2'],
  })

  assert.deepEqual(result.teamA, ['m4', 'w1', 'w3', 'm3'])
  assert.deepEqual(result.teamB, ['w4', 'm1', 'm2', 'w2'])
  assert.equal(new Set([...result.teamA, ...result.teamB]).size, 8)
})

test('day four standing uses points, first-place count, then the short Halli Galli result', () => {
  const standings = getDayFourStandings({
    results: [
      { game: '윷놀이', orderedTeamIds: ['a', 'b', 'c', 'd'] },
      { game: '할리갈리', orderedTeamIds: ['b', 'a', 'c', 'd'] },
      { game: '우노', orderedTeamIds: ['a', 'b', 'd', 'c'] },
      { game: '다빈치 코드', orderedTeamIds: ['b', 'c', 'a', 'd'] },
      { game: '루미큐브', orderedTeamIds: ['c', 'd', 'a', 'b'] },
    ],
    halliGalliTieBreakOrder: ['b', 'a', 'c', 'd'],
  })

  assert.equal(standings[0]?.teamId, 'b')
  assert.equal(standings[1]?.teamId, 'a')
  assert.equal(standings[0]?.points, standings[1]?.points)
  assert.equal(standings[0]?.firstPlaceCount, standings[1]?.firstPlaceCount)
})

test('day seven returns only accepted matching proposals', () => {
  assert.deepEqual(resolveFinalPairs({
    proposals: [
      { proposerId: 'm1', targetId: 'w1' },
      { proposerId: 'm2', targetId: 'w1' },
      { proposerId: 'm3', targetId: 'w2' },
    ],
    responses: [
      { targetId: 'w1', acceptedProposerId: 'm2' },
      { targetId: 'w2', acceptedProposerId: null },
    ],
  }), [
    { proposerId: 'm2', targetId: 'w1' },
  ])
})

test('free text blocks phone, email, handles, and contact-channel invitations', () => {
  assert.equal(containsProhibitedContact('오늘 대화가 편해서 좋았어요'), false)
  assert.equal(containsProhibitedContact('010-1234-5678로 연락해요'), true)
  assert.equal(containsProhibitedContact('hello@example.com'), true)
  assert.equal(containsProhibitedContact('@quantum_me로 디엠 줘요'), true)
  assert.equal(containsProhibitedContact('카톡 아이디 알려줄게요'), true)
})

test('reservation deposit review is created only after ignored reminders and deadline', () => {
  assert.equal(CAMPUS_SEVEN_RESERVATION_PENALTY_WON, 10_000)
  assert.equal(getReservationPenaltyCandidate({
    deadlinePassed: true,
    remindersSent: 2,
    attempted: false,
    substituteRequested: false,
    venueUnavailableReported: false,
  }), true)
  assert.equal(getReservationPenaltyCandidate({
    deadlinePassed: true,
    remindersSent: 2,
    attempted: true,
    substituteRequested: false,
    venueUnavailableReported: true,
  }), false)
})

test('adult eligibility uses the nineteenth birthday on the program start date', () => {
  assert.equal(isAdultOnDate('2007-07-17', '2026-07-17'), true)
  assert.equal(isAdultOnDate('2007-07-18', '2026-07-17'), false)
})

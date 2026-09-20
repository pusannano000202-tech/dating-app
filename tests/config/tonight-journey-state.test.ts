import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTonightCount, tonightServiceDateLabel, canShowTonightMeetingCoaching } from '../../components/tonight/tonight-journey-state'
import { getMeetingCoachingCards, resolveMeetingCoachingMode, moveMeetingCoachingCard } from '../../components/matching/meeting-coaching-content'
import { TonightRoundUnavailableError, isExplicitMissingTonightRound, isTonightRoundUnavailable } from '../../components/tonight/tonight-journey-errors'

test('unavailable, malformed and negative counts never become a fictional zero', () => {
  for (const value of [undefined, null, -1, 1.5, NaN, Infinity, '12']) {
    assert.equal(formatTonightCount(value, '명'), '확인 불가')
  }
  assert.equal(formatTonightCount(0, '팀'), '0팀')
  assert.equal(formatTonightCount(1234, '명'), '1,234명')
})

test('date is the server service date and invalid dates do not become today', () => {
  assert.equal(tonightServiceDateLabel('2026-09-15'), '9월 15일 화요일')
  assert.equal(tonightServiceDateLabel('2026-02-31'), '회차 날짜 확인 필요')
  assert.equal(tonightServiceDateLabel(''), '회차 날짜 확인 필요')
})

test('coaching requires explicit unlock and explicit non-preview; display never authorizes a meeting', () => {
  assert.equal(resolveMeetingCoachingMode({}), 'preview')
  assert.equal(resolveMeetingCoachingMode({ unlocked: true }), 'preview')
  assert.equal(resolveMeetingCoachingMode({ preview: false }), 'preview')
  assert.equal(resolveMeetingCoachingMode({ preview: true, unlocked: true }), 'preview')
  assert.equal(resolveMeetingCoachingMode({ preview: false, unlocked: true }), 'unlocked')
})

test('cards start with a concrete introduction and keep couple and singles wording separate', () => {
  const singles = getMeetingCoachingCards('singles', 'board_game')
  const couples = getMeetingCoachingCards('couples', 'board_game')
  assert.match(singles[0].action, /이름/)
  assert.match(couples[0].action, /각자/)
  assert.match(singles[1].action, /규칙/)
  assert.equal(new Set(singles.map(card => card.id)).size, singles.length)
  assert.ok(singles.every(card => card.action && card.example && card.title))
  assert.doesNotMatch(JSON.stringify(couples), /호감 투표|파트너 교체|연락처 교환/)
})

test('unknown activities get neutral guidance, not a game or an afternoon/five-meeting claim', () => {
  const cards = getMeetingCoachingCards('singles', 'unknown')
  assert.match(cards[1].action, /활동/)
  assert.doesNotMatch(JSON.stringify(cards), /오후|5회|다섯 번|게임 규칙/)
})

test('one-card navigation is bounded and never submits or completes the meeting', () => {
  assert.equal(moveMeetingCoachingCard(0, -1, 4), 0)
  assert.equal(moveMeetingCoachingCard(0, 1, 4), 1)
  assert.equal(moveMeetingCoachingCard(3, 1, 4), 3)
  assert.equal(moveMeetingCoachingCard(99, -1, 4), 2)
  assert.equal(moveMeetingCoachingCard(0, 1, 0), 0)
})

const ongoing = {
  round: { status: 'in_progress', serviceDate: '2026-09-15', startsAt: '2026-09-15T19:30:00+09:00' },
  application: { id: 'application', status: 'allocated', deposit: { status: 'paid' } },
  journey: { applicationId: 'application', teamId: 'team', teamStatus: 'in_progress', attendanceStatus: 'arrived', canRevealExactVenue: true },
}
const now = Date.parse('2026-09-15T20:00:00+09:00')

test('actual meeting coaching requires matching server participant, arrival, paid and current in-progress state', () => {
  assert.equal(canShowTonightMeetingCoaching(ongoing, now), true)
  for (const next of [
    { ...ongoing, application: null },
    { ...ongoing, journey: null },
    { ...ongoing, application: { ...ongoing.application, status: 'cancelled' } },
    { ...ongoing, application: { ...ongoing.application, deposit: { status: 'pending' } } },
    { ...ongoing, journey: { ...ongoing.journey, applicationId: 'someone-else' } },
    { ...ongoing, journey: { ...ongoing.journey, teamId: null } },
    { ...ongoing, journey: { ...ongoing.journey, attendanceStatus: 'pending' } },
    { ...ongoing, journey: { ...ongoing.journey, teamStatus: 'completed' } },
    { ...ongoing, journey: { ...ongoing.journey, canRevealExactVenue: false } },
    { ...ongoing, round: { ...ongoing.round, status: 'completed' } },
    { ...ongoing, round: { ...ongoing.round, startsAt: 'invalid' } },
  ]) assert.equal(canShowTonightMeetingCoaching(next, now), false)
  assert.equal(canShowTonightMeetingCoaching(ongoing, now - 3600000), false)
  assert.equal(canShowTonightMeetingCoaching(ongoing, now + 86400000), false)
})

test('accepted/revealed live teams unlock only after the start; legacy workflow need not write in_progress', () => {
  const revealed = { ...ongoing, round: { ...ongoing.round, status: 'accepted' }, journey: { ...ongoing.journey, teamStatus: 'revealed' } }
  assert.equal(canShowTonightMeetingCoaching(revealed, now), true)
  assert.equal(canShowTonightMeetingCoaching(revealed, now - 3600000), false)
  assert.equal(canShowTonightMeetingCoaching({ ...revealed, journey: { ...revealed.journey, teamStatus: 'deposit_pending' } }, now), false)
  assert.equal(canShowTonightMeetingCoaching({ ...revealed, round: { ...revealed.round, status: 'awaiting_deposits' } }, now), false)
})

test('only an explicit successful null round is normal absence, never a malformed snapshot', () => {
  assert.equal(isExplicitMissingTonightRound({ round: null, applications_open: false }), true)
  for (const payload of [null, undefined, [], {}, { round: undefined }, { round: {} }, { round: { round: {} } }, { error: 'not_found' }]) {
    assert.equal(isExplicitMissingTonightRound(payload), false)
  }
})

test('only the dedicated missing-round error renders empty; network/auth/unknown 404 stay errors', () => {
  assert.equal(isTonightRoundUnavailable(new TonightRoundUnavailableError()), true)
  for (const error of [new Error('not_found'), new Error('Failed to fetch'), new Error('오늘 진행 중인 부산대 회차가 없어요.'), { code: 'not_found' }, { code: 'unauthenticated' }, null]) {
    assert.equal(isTonightRoundUnavailable(error), false)
  }
})
import { isTonightSnapshotFresh } from '../../components/tonight/tonight-journey-state'

test('live snapshot freshness expires and failure never leaves old counts authoritative', () => {
  assert.equal(isTonightSnapshotFresh(1000,2000,false),true)
  assert.equal(isTonightSnapshotFresh(1000,76_000,false),false)
  assert.equal(isTonightSnapshotFresh(1000,2000,true),false)
  assert.equal(isTonightSnapshotFresh(null,2000,false),false)
  assert.equal(isTonightSnapshotFresh(3000,2000,false),false)
})

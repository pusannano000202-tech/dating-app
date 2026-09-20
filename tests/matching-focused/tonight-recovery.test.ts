import assert from 'node:assert/strict'
import test from 'node:test'
import { tonightRecruitmentState } from '../../components/tonight/tonight-journey-state'
import { tonightLoadFailureAction, TonightRoundUnavailableError, TonightAccessError } from '../../components/tonight/tonight-journey-errors'

const open = {
  applicationsOpen: true,
  round: { status: 'open', signupOpenAt: '2026-09-20T09:00:00+09:00', signupCloseAt: '2026-09-20T18:30:00+09:00' },
}
const now = Date.parse('2026-09-20T17:00:00+09:00')

test('recruitment separates before opening, gate pause, expiry and stale reads', () => {
  assert.equal(tonightRecruitmentState(open, now), 'open')
  assert.equal(tonightRecruitmentState(open, now - 9 * 3600000), 'upcoming')
  assert.equal(tonightRecruitmentState({ ...open, applicationsOpen: false }, now), 'paused')
  assert.equal(tonightRecruitmentState(open, now + 90 * 60000), 'closed')
  assert.equal(tonightRecruitmentState(open, now, false), 'unavailable')
  assert.equal(tonightRecruitmentState({ ...open, applicationsAvailable: false }, now), 'unavailable')
  assert.equal(tonightRecruitmentState({ ...open, round: { ...open.round, status: 'allocating' } }, now), 'closed')
  assert.equal(tonightRecruitmentState({ ...open, round: { ...open.round, signupCloseAt: '' } }, now), 'unavailable')
})

test('null current recruitment must not erase an already received participation', () => {
  const missing = new TonightRoundUnavailableError()
  assert.equal(tonightLoadFailureAction({ application: { id: 'mine' } }, missing), 'retain')
  assert.equal(tonightLoadFailureAction({ application: null }, missing), 'unavailable')
  assert.equal(tonightLoadFailureAction(null, missing), 'unavailable')
})

test('transient failure preserves received data, while access failure clears private data', () => {
  assert.equal(tonightLoadFailureAction({ application: { id: 'mine' } }, new Error('network')), 'retain')
  assert.equal(tonightLoadFailureAction({ application: null }, new Error('network')), 'retain')
  assert.equal(tonightLoadFailureAction(null, new Error('network')), 'error')
  assert.equal(tonightLoadFailureAction({ application: { id: 'mine' } }, new TonightAccessError('로그인이 필요해요.')), 'error')
})

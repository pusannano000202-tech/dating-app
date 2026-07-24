import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getMatchViewState,
  isActiveMatchStatus,
} from '../../lib/matching/match-view-state'

test('match view state keeps terminal outcomes out of the active matching flow', () => {
  assert.equal(isActiveMatchStatus('pending'), true)
  assert.equal(isActiveMatchStatus('confirmed'), true)
  assert.equal(isActiveMatchStatus('completed'), false)
  assert.equal(isActiveMatchStatus('cancelled'), false)
  assert.equal(isActiveMatchStatus('no_show'), false)
})

test('unknown and inactive match statuses never render as confirmed', () => {
  assert.equal(getMatchViewState('cancelled'), 'inactive')
  assert.equal(getMatchViewState('no_show'), 'inactive')
  assert.equal(getMatchViewState('something_new'), 'unknown')
  assert.equal(getMatchViewState('confirmed'), 'confirmed')
})

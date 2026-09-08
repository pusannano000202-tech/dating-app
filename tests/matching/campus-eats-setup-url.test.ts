import assert from 'node:assert/strict'
import test from 'node:test'
import { readCampusEatsUrlState, writeCampusEatsUrlState } from '../../lib/campus-eats/url-state'

test('setup mode roundtrips without changing to map or resumed battle', () => {
  const state = readCampusEatsUrlState('?category=pizza&mode=setup')
  assert.equal(state.mode, 'setup')
  assert.equal(state.categoryId, 'pizza')
  assert.match(writeCampusEatsUrlState(state), /mode=setup/)
})

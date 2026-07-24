import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGroupQueueState,
  isGroupQueueActive,
} from '../../lib/matching/group-queue-state'

test('group queue state follows match_pool instead of inferring from groups.ready', () => {
  assert.equal(getGroupQueueState('ready', 'waiting'), 'active')
  assert.equal(getGroupQueueState('ready', 'rolled_over'), 'active')
  assert.equal(getGroupQueueState('ready', null), 'inactive')
  assert.equal(getGroupQueueState('forming', null), 'inactive')
  assert.equal(getGroupQueueState('matched', null), 'matched')
})

test('group queue active helper only accepts active match_pool rows', () => {
  assert.equal(isGroupQueueActive('waiting'), true)
  assert.equal(isGroupQueueActive('rolled_over'), true)
  assert.equal(isGroupQueueActive('cancelled'), false)
  assert.equal(isGroupQueueActive(null), false)
})

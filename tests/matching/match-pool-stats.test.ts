import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateMatchPoolStats } from '../../lib/match-pool-stats'

test('aggregateMatchPoolStats keeps 2:2, 3:3, and mixed queue counts separate', () => {
  const stats = aggregateMatchPoolStats([
    { gender: 'male', group_size: 2, group_count: 3 },
    { gender: 'female', group_size: 2, group_count: 2 },
    { gender: 'mixed', group_size: 2, group_count: 1 },
    { gender: 'male', group_size: 3, group_count: 4 },
    { gender: 'female', group_size: 3, group_count: 5 },
    { gender: 'mixed', group_size: 3, group_count: 2 },
  ])

  assert.equal(stats.male, 7)
  assert.equal(stats.female, 7)
  assert.equal(stats.mixed, 3)
  assert.deepEqual(stats.bySize['2'], { male: 3, female: 2, mixed: 1 })
  assert.deepEqual(stats.bySize['3'], { male: 4, female: 5, mixed: 2 })
})

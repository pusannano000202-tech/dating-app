import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeliveryContest, chooseDeliveryCandidate, restoreDeliveryContest } from '../../lib/campus-eats/delivery-contest'

test('eight and odd-sized brackets finish in exactly n-1 choices and resume safely', () => {
  for (const size of [8, 9, 15]) {
    const ids = Array.from({ length: size }, (_, index) => `candidate-${index}`)
    let contest = createDeliveryContest(ids)
    let choices = 0
    while (!contest.winner) {
      contest = chooseDeliveryCandidate(contest, contest.remaining[0])
      contest = restoreDeliveryContest(JSON.parse(JSON.stringify(contest)))!
      choices++
      assert.ok(choices <= size)
    }
    assert.equal(choices, size - 1)
    assert.equal(contest.winner, ids[0])
  }
})
test('unknown choices, duplicate candidates and corrupt stored states fail closed', () => {
  assert.throws(() => createDeliveryContest(['a', 'b']))
  assert.throws(() => createDeliveryContest(Array(8).fill('same')))
  const contest = createDeliveryContest(Array.from({ length: 8 }, (_, index) => `candidate-${index}`))
  assert.deepEqual(chooseDeliveryCandidate(contest, 'unknown'), contest)
  assert.deepEqual(chooseDeliveryCandidate(contest, 'candidate-5'), contest)
  assert.equal(restoreDeliveryContest({ ...contest, remaining: ['candidate-0', 'candidate-0'] }), null)
  assert.equal(restoreDeliveryContest({ ...contest, winner: 'candidate-0' }), null)
  assert.equal(restoreDeliveryContest({ ...contest, remaining: [], winners: [] }), null)
  assert.equal(restoreDeliveryContest({ ...contest, candidateIds: [...contest.candidateIds, {}] }), null)
})

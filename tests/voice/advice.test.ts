import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areComplementaryAdviceRoles,
  parseAdviceNextInput,
  parseAdviceQueueInput,
} from '../../lib/voice/advice'

const id = '11111111-1111-4111-8111-111111111111'

test('advice queue accepts only an explicit talker or listener role', () => {
  assert.deepEqual(
    parseAdviceQueueInput({
      action: 'join',
      role: 'talker',
      adviceTopic: 'romance',
      searchId: id,
      idempotencyKey: id,
    }),
    {
      action: 'join',
      role: 'talker',
      adviceTopic: 'romance',
      searchId: id,
      idempotencyKey: id,
    },
  )
  assert.throws(
    () =>
      parseAdviceQueueInput({
        action: 'join',
        role: 'both',
        adviceTopic: 'romance',
        searchId: id,
        idempotencyKey: id,
      }),
    /invalid_input/,
  )
  assert.throws(
    () =>
      parseAdviceQueueInput({
        action: 'join',
        role: 'listener',
        adviceTopic: 'romance',
        searchId: id,
        idempotencyKey: id,
        userId: id,
      }),
    /invalid_input/,
  )
  assert.throws(
    () =>
      parseAdviceQueueInput({
        action: 'join',
        role: 'listener',
        adviceTopic: 'baseball',
        searchId: id,
        idempotencyKey: id,
      }),
    /invalid_input/,
  )
})

test('advice queue leave and next use opaque UUIDs and reject extra authority', () => {
  assert.deepEqual(parseAdviceQueueInput({ action: 'leave', searchId: id, idempotencyKey: id }), {
    action: 'leave',
    searchId: id,
    idempotencyKey: id,
  })
  assert.deepEqual(parseAdviceNextInput({ sessionId: id, idempotencyKey: id }), {
    sessionId: id,
    idempotencyKey: id,
  })
  assert.throws(() => parseAdviceNextInput({ sessionId: 'bad', idempotencyKey: id }))
  assert.throws(() => parseAdviceNextInput({ sessionId: id, idempotencyKey: id, role: 'talker' }))
  assert.deepEqual(
    parseAdviceQueueInput({ action: 'resume', idempotencyKey: id }),
    { action: 'resume', idempotencyKey: id },
  )
})

test('advice pairs only opposite roles', () => {
  assert.equal(areComplementaryAdviceRoles('talker', 'listener'), true)
  assert.equal(areComplementaryAdviceRoles('listener', 'talker'), true)
  assert.equal(areComplementaryAdviceRoles('talker', 'talker'), false)
  assert.equal(areComplementaryAdviceRoles('listener', 'listener'), false)
})

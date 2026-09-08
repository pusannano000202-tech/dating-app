import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCheerJoinInput } from '../../lib/voice/cheer-service'

const id = '11111111-1111-4111-8111-111111111111'

test('cheer join resolves a trusted catalog team and never trusts client labels', () => {
  const result = parseCheerJoinInput({
    teamId: 'kbo-lotte-giants',
    idempotencyKey: id,
  })
  assert.equal(result.team.id, 'kbo-lotte-giants')
  assert.equal(result.team.league, 'kbo')
  assert.equal(result.idempotencyKey, id)
  assert.throws(() =>
    parseCheerJoinInput({
      teamId: 'kbo-lotte-giants',
      teamName: 'forged',
      idempotencyKey: id,
    }),
  )
})

test('cheer join rejects unknown teams and malformed retry keys', () => {
  assert.throws(() => parseCheerJoinInput({ teamId: 'kbo-fake', idempotencyKey: id }))
  assert.throws(() =>
    parseCheerJoinInput({ teamId: 'lck-t1', idempotencyKey: 'retry-me' }),
  )
})

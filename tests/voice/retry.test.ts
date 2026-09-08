import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceRetryKey } from '../../lib/voice/retry'

test('lost create response retries the same payload without creating a second room', () => {
  let count = 0
  const next = () => `key-${++count}`
  const first = voiceRetryKey(null, { title: '고민 나눔', capacity: 12 }, next)
  assert.deepEqual(voiceRetryKey(first, { title: '고민 나눔', capacity: 12 }, next), first)
  assert.notEqual(voiceRetryKey(first, { title: '고민 나눔', capacity: 8 }, next).key, first.key)
})

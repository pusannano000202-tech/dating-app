import assert from 'node:assert/strict'
import test from 'node:test'
import { getEventListeners } from 'node:events'
import { readWithDeadline } from '../../lib/matching/tonight-ranked/read-with-deadline'

test('deadline aborts the actual read instead of only dismissing the loading UI', async () => {
  let transportSignal: AbortSignal | undefined
  await assert.rejects(readWithDeadline(signal => {
    transportSignal = signal
    return new Promise(() => {})
  }, undefined, 10), /연결이 지연/)
  assert.equal(transportSignal?.aborted, true)
})

test('leaving or replacing the view cancels pending transport and cannot accept a late result', async () => {
  const owner = new AbortController()
  let transportSignal: AbortSignal | undefined
  let resolveRead!: (value: string) => void
  const pending = readWithDeadline(signal => {
    transportSignal = signal
    return new Promise<string>(resolve => { resolveRead = resolve })
  }, owner.signal)
  await Promise.resolve()
  owner.abort()
  resolveRead('old account or old request')
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(transportSignal?.aborted, true)
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
})

test('a cancelled read never starts another transport', async () => {
  const owner = new AbortController()
  owner.abort()
  let calls = 0
  await assert.rejects(readWithDeadline(async () => { calls++; return 'unused' }, owner.signal), { name: 'AbortError' })
  assert.equal(calls, 0)
})

test('successful reads clean up without aborting and errors keep their identity', async () => {
  const owner = new AbortController()
  let transportSignal: AbortSignal | undefined
  assert.equal(await readWithDeadline(async signal => { transportSignal = signal; return 'snapshot' }, owner.signal), 'snapshot')
  assert.equal(transportSignal?.aborted, false)
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
  const failure = new Error('permission denied')
  await assert.rejects(readWithDeadline(async () => { throw failure }, owner.signal), error => error === failure)
  assert.equal(getEventListeners(owner.signal, 'abort').length, 0)
})

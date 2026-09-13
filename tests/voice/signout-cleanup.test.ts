import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanVoiceBeforeSignOut } from '../../lib/voice/signout-cleanup'

test('sign-out waits an in-flight operation then cancels the latest server ownership', async () => {
  const calls: string[] = []
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  const cleanup = cleanVoiceBeforeSignOut({
    pending, isCurrent: () => true,
    disconnect: async () => { calls.push('disconnect') },
    read: async () => { calls.push('read'); return { status: 'waiting', revision: 2, session: null } },
    cancel: async revision => { calls.push(`cancel:${revision}`) },
    leave: async () => { calls.push('leave') },
  })
  await Promise.resolve()
  assert.deepEqual(calls, ['disconnect'])
  finish()
  await cleanup
  assert.deepEqual(calls, ['disconnect', 'read', 'cancel:2'])
})

test('a queue changing into an offer is cleaned by one bounded fresh-state retry', async () => {
  const calls: string[] = []
  let reads = 0
  await cleanVoiceBeforeSignOut({
    pending: null, isCurrent: () => true, disconnect: async () => {},
    read: async () => ++reads === 1
      ? { status: 'waiting', revision: 1, session: null }
      : { status: 'offered', revision: 3, session: { id: 'session', revision: 3 } },
    cancel: async () => { calls.push('cancel'); throw new Error('stale_revision') },
    leave: async (id, revision) => { calls.push(`leave:${id}:${revision}`) },
  })
  assert.deepEqual(calls, ['cancel', 'leave:session:3'])
})

test('a changed account never receives the old cleanup mutation', async () => {
  let current = true
  await cleanVoiceBeforeSignOut({
    pending: null, isCurrent: () => current, disconnect: async () => {},
    read: async () => { current = false; return { status: 'waiting', revision: 1, session: null } },
    cancel: async () => assert.fail('must not mutate a new account'),
    leave: async () => assert.fail('must not mutate a new account'),
  })
})

test('cleanup failure is not reported as success and retries are bounded', async () => {
  let attempts = 0
  await assert.rejects(() => cleanVoiceBeforeSignOut({
    pending: null, isCurrent: () => true, disconnect: async () => {},
    read: async () => ({ status: 'cleanup_required', revision: 1, session: { id: 'session', revision: 1 } }),
    cancel: async () => {},
    leave: async () => { attempts++; throw new Error('offline') },
  }), /offline/)
  assert.equal(attempts, 2)
})

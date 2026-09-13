import test from 'node:test'
import assert from 'node:assert/strict'

import { ChatPollRequestCoordinator } from '../../lib/chat-polls/coordinator'

const firstViewer = '11111111-1111-4111-8111-111111111111'
const secondViewer = '22222222-2222-4222-8222-222222222222'

test('a late read cannot replace a newer board in the same room scope', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const first = coordinator.beginRead(scope)
  const second = coordinator.beginRead(scope)
  assert.ok(first && second)
  assert.deepEqual(coordinator.acceptRead(first, firstViewer), { accepted: false, viewerChanged: false })
  assert.deepEqual(coordinator.acceptRead(second, firstViewer), { accepted: true, viewerChanged: false })
})

test('viewer changes are explicit and revoke all old-account request tokens', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const initial = coordinator.beginRead(scope)
  assert.ok(initial)
  assert.deepEqual(coordinator.acceptRead(initial, firstViewer), { accepted: true, viewerChanged: false })

  const oldMutation = coordinator.beginMutation(scope)
  assert.ok(oldMutation)
  coordinator.leaveScope(scope)
  const nextScope = coordinator.enterScope()
  assert.deepEqual(coordinator.acceptMutation(oldMutation, firstViewer), { accepted: false, viewerChanged: false })

  const nextRead = coordinator.beginRead(nextScope)
  assert.ok(nextRead)
  assert.deepEqual(coordinator.acceptRead(nextRead, secondViewer), { accepted: true, viewerChanged: false })
})

test('a successful read under a different account reports the binding change', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const first = coordinator.beginRead(scope)
  assert.ok(first)
  coordinator.acceptRead(first, firstViewer)
  const second = coordinator.beginRead(scope)
  assert.ok(second)
  assert.deepEqual(coordinator.acceptRead(second, secondViewer), { accepted: true, viewerChanged: true })
})

test('latest access failure clears the viewer while stale failures are ignored', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const first = coordinator.beginRead(scope)
  const second = coordinator.beginRead(scope)
  assert.ok(first && second)
  assert.equal(coordinator.revokeRead(first), false)
  assert.equal(coordinator.revokeRead(second), true)
  assert.equal(coordinator.beginMutation(scope), null)
})

test('a mutation response from a different account is identified before private state can be reused', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const initial = coordinator.beginRead(scope)
  assert.ok(initial)
  coordinator.acceptRead(initial, firstViewer)

  const mutation = coordinator.beginMutation(scope)
  assert.ok(mutation)
  assert.deepEqual(coordinator.acceptMutation(mutation, secondViewer), { accepted: false, viewerChanged: true })
  assert.equal(coordinator.revokeMutation(mutation), true)
  assert.equal(coordinator.beginMutation(scope), null)
})

test('the mutation guard rejects duplicate same-frame actions until the active request ends', () => {
  const coordinator = new ChatPollRequestCoordinator()
  const scope = coordinator.enterScope()
  const initial = coordinator.beginRead(scope)
  assert.ok(initial)
  coordinator.acceptRead(initial, firstViewer)

  const first = coordinator.beginMutation(scope)
  assert.ok(first)
  assert.equal(coordinator.beginMutation(scope), null)
  assert.equal(coordinator.endMutation(first), true)

  const second = coordinator.beginMutation(scope)
  assert.ok(second)
})

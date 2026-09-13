import test from 'node:test'
import assert from 'node:assert/strict'

import { parseChatPollBoard } from '../../lib/chat-polls/contract'
import { createChatPollOfflineTransport } from '../../lib/chat-polls/offline-fixture'

async function payload(response: { json(): Promise<unknown> }) {
  return await response.json() as { data?: unknown; viewer_binding?: string }
}

test('offline fixture exercises single and multiple replacement without calling a service API', async () => {
  const fixture = createChatPollOfflineTransport()
  const endpoint = `/api/chat-polls/activity-rooms/${fixture.roomId}`
  const initial = await payload(await fixture.transport(endpoint))
  const viewerBinding = initial.viewer_binding
  let board = parseChatPollBoard(initial.data)
  assert.ok(board)
  assert.ok(viewerBinding)
  const single = board.polls.find(poll => poll.selectionMode === 'single')
  const multiple = board.polls.find(poll => poll.selectionMode === 'multiple')
  assert.ok(single && multiple)

  await fixture.transport(`${endpoint}/${single.id}/vote`, {
    method: 'POST', body: JSON.stringify({ expected_viewer_binding: viewerBinding, option_ids: [single.options[0].id] }),
  })
  await fixture.transport(`${endpoint}/${multiple.id}/vote`, {
    method: 'POST', body: JSON.stringify({ expected_viewer_binding: viewerBinding, option_ids: [multiple.options[0].id, multiple.options[1].id] }),
  })
  board = parseChatPollBoard((await payload(await fixture.transport(endpoint))).data)
  assert.ok(board)
  assert.deepEqual(board.polls.find(poll => poll.id === single.id)?.options.filter(option => option.selectedByMe).map(option => option.id), [single.options[0].id])
  assert.deepEqual(board.polls.find(poll => poll.id === multiple.id)?.options.filter(option => option.selectedByMe).map(option => option.id), [multiple.options[0].id, multiple.options[1].id])
})

test('offline fixture exposes the real close and cancel presentation states', async () => {
  const fixture = createChatPollOfflineTransport()
  const endpoint = `/api/chat-polls/activity-rooms/${fixture.roomId}`
  const initial = await payload(await fixture.transport(endpoint))
  const viewerBinding = initial.viewer_binding
  let board = parseChatPollBoard(initial.data)
  assert.ok(board)
  assert.ok(viewerBinding)
  const [first, second] = board.polls
  await fixture.transport(`${endpoint}/${first.id}/close`, { method: 'POST', body: JSON.stringify({ expected_viewer_binding: viewerBinding }) })
  await fixture.transport(`${endpoint}/${second.id}/cancel`, { method: 'POST', body: JSON.stringify({ expected_viewer_binding: viewerBinding }) })
  board = parseChatPollBoard((await payload(await fixture.transport(endpoint))).data)
  assert.ok(board)
  assert.equal(board.polls.find(poll => poll.id === first.id)?.status, 'closed')
  assert.equal(board.polls.find(poll => poll.id === second.id)?.status, 'cancelled')
})

test('offline fixture rejects a stale board viewer before mutating its local ledger', async () => {
  const fixture = createChatPollOfflineTransport()
  const endpoint = `/api/chat-polls/activity-rooms/${fixture.roomId}`
  const initial = await payload(await fixture.transport(endpoint))
  const board = parseChatPollBoard(initial.data)
  assert.ok(board)
  const poll = board.polls[0]
  const response = await fixture.transport(`${endpoint}/${poll.id}/close`, {
    method: 'POST',
    body: JSON.stringify({ expected_viewer_binding: '99000000-0000-4000-8000-000000000001' }),
  })
  assert.equal(response.status, 401)
  const after = parseChatPollBoard((await payload(await fixture.transport(endpoint))).data)
  assert.equal(after?.polls.find(item => item.id === poll.id)?.status, 'open')
})

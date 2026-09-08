import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const key = '20000000-0000-4000-8000-000000000001'
function chat() {
  assert.ok(existsSync(resolve('lib/matching/friend-direct-chat.ts')), 'persistent friend chat input contract must be restored')
  return require('../../lib/matching/friend-direct-chat') as {
    parseFriendDirectChatInput(value: unknown): { message: string; idempotencyKey: string } | null
    parseFriendDirectChatMessages(value: unknown): unknown[] | null
    revokeFriendDirectChatState(sequence: number): unknown
    mapFriendChatRpcError(error: unknown): { error: string; status: number }
  }
}

test('friend chat validates a bounded message and a stable request key without caller identities', () => {
  const { parseFriendDirectChatInput: parse } = chat()
  assert.deepEqual(parse({ message: '  반가워요\r\n같이 정해요  ', idempotency_key: key }), { message: '반가워요\n같이 정해요', idempotencyKey: key })
  for (const input of [null, {}, { message: 'hello' }, { message: 'hello', idempotency_key: 'bad' },
    { message: '  ', idempotency_key: key }, { message: '가'.repeat(1001), idempotency_key: key },
    { message: 'hello', idempotency_key: key, sender_user_id: key }, { message: '\u0000', idempotency_key: key }]) {
    assert.equal(parse(input), null)
  }
  assert.ok(parse({ message: '🙂'.repeat(1000), idempotency_key: key }))
})

test('friend chat uses private bounded errors and never returns database details', () => {
  assert.equal(typeof chat().mapFriendChatRpcError, 'function')
  const map = chat().mapFriendChatRpcError
  assert.deepEqual(map({ message: 'active_friendship_required' }), { status: 403, error: 'friendship_required' })
  assert.deepEqual(map({ message: 'idempotency_conflict' }), { status: 409, error: 'retry_conflict' })
  assert.deepEqual(map({ message: 'friend_chat_rate_limited' }), { status: 429, error: 'rate_limited' })
  assert.deepEqual(map({ message: 'private database hostname password unknown' }), { status: 503, error: 'service_unavailable' })
})

test('friend chat restores the real route and sends one stable request without a preview fallback', () => {
  const apiPath = resolve('app/api/friends/[id]/chat/route.ts')
  const uiPath = resolve('components/friends/FriendChatRoom.tsx')
  assert.ok(existsSync(apiPath) && existsSync(uiPath), 'actual API and UI must be restored')
  const api = readFileSync(apiPath, 'utf8')
  const ui = readFileSync(uiPath, 'utf8')
  assert.match(api, /assertTrustedMutationOrigin\(request\)/)
  assert.match(api, /requireRequestAccess/)
  assert.match(api, /p_idempotency_key/)
  assert.match(ui, /resolveMutationAttempt/)
  assert.doesNotMatch(ui, /PREVIEW_MESSAGES|preview\??:|isDevPreviewClientSession/)
  assert.match(readFileSync(resolve('app/friends/[id]/page.tsx'), 'utf8'), /친구 1:1 채팅 열기/)
})

test('friend chat response projection is bounded and rejects malformed rows', () => {
  const { parseFriendDirectChatMessages: parse } = chat()
  const row = { id: key, is_mine: true, body: '안녕', created_at: '2026-09-06T11:00:00.000Z' }
  assert.deepEqual(parse([row]), [{ id: key, isMine: true, body: '안녕', createdAt: row.created_at }])
  assert.equal(parse(Array.from({ length: 101 }, () => row)), null)
  assert.equal(parse([{ ...row, is_mine: 'true' }]), null)
  assert.equal(parse([{ ...row, created_at: 'yesterday' }]), null)
  assert.equal(parse([row, row]), null)
})

test('revoked friendship clears the visible conversation, draft and stale response sequence', () => {
  assert.deepEqual(chat().revokeFriendDirectChatState(4), { access: 'revoked', draft: '', messages: [], refreshSequence: 5 })
})

test('friend chat persistence requires accepted consent, current friendship and idempotent writes', () => {
  const sql = readFileSync(resolve('supabase/migrations/20260906113338_community_friend_chat_preservation.sql'), 'utf8')
  assert.match(sql, /create table public\.friend_direct_messages/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /request\.status = 'accepted'/)
  assert.match(sql, /friendship\.status = 'active'/)
  assert.match(sql, /for update of friendship/i)
  assert.match(sql, /unique \(sender_user_id, idempotency_key\)/i)
  assert.match(sql, /idempotency_conflict/)
  assert.match(sql, /revoke all on table public\.friend_direct_messages from public, anon, authenticated/i)
  assert.doesNotMatch(sql, /create or replace function public\.(remove_friend|restore_friend|sync_department)/i)
})

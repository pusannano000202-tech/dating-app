import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function recognition() {
  const path = resolve('lib/friends/recognition-name.ts')
  assert.ok(existsSync(path), 'friend recognition name contract must exist')
  return require('../../lib/friends/recognition-name') as {
    parseFriendRecognitionName(value: unknown): string | null
  }
}

function inviteToken() {
  const path = resolve('lib/friends/invite-token.ts')
  assert.ok(existsSync(path), 'friend invite token contract must exist')
  return require('../../lib/friends/invite-token') as {
    createFriendInviteToken(): { rawToken: string; tokenHash: string }
    createRetrySafeFriendInviteToken(idempotencyKey: string, secret: string): { rawToken: string; tokenHash: string }
    hashFriendInviteToken(value: string): string
    normalizeFriendInviteToken(value: unknown): string | null
  }
}

test('friend recognition name normalizes ordinary spacing without changing the public alias', () => {
  const parse = recognition().parseFriendRecognitionName
  assert.equal(parse('  김   친구  '), '김 친구')
  assert.equal(parse('Jean-Luc O’Neil'), 'Jean-Luc O’Neil')
})

test('friend recognition name rejects missing, oversized, and invisible control values', () => {
  const parse = recognition().parseFriendRecognitionName
  for (const value of [null, '', '가', '가'.repeat(41), '김\n친구', '김\u202e친구', { name: '김친구' }]) {
    assert.equal(parse(value), null)
  }
})

test('friend invite tokens are 256-bit capabilities and only deterministic hashes are stored', () => {
  const token = inviteToken()
  const created = token.createFriendInviteToken()
  assert.match(created.rawToken, /^[0-9a-f]{64}$/)
  assert.match(created.tokenHash, /^[0-9a-f]{64}$/)
  assert.notEqual(created.rawToken, created.tokenHash)
  assert.equal(token.hashFriendInviteToken(created.rawToken), created.tokenHash)
  assert.equal(token.normalizeFriendInviteToken(created.rawToken.toUpperCase()), created.rawToken)
  assert.equal(token.normalizeFriendInviteToken('not-a-token'), null)
  const retryA = token.createRetrySafeFriendInviteToken('11111111-1111-4111-8111-111111111111', 'x'.repeat(32))
  const retryB = token.createRetrySafeFriendInviteToken('11111111-1111-4111-8111-111111111111', 'x'.repeat(32))
  assert.deepEqual(retryA, retryB)
  assert.equal(token.hashFriendInviteToken(retryA.rawToken), retryA.tokenHash)
})

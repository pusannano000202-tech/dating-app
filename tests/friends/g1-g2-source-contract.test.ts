import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

test('signup stores a separate private friend recognition name without replacing the alias', () => {
  const form = read('components/profile/BasicInfoForm.tsx')
  const parser = read('lib/profile/basic-profile-input.ts')
  const route = read('app/api/profile/basic/route.ts')
  assert.match(form, /friend_recognition_name/)
  assert.match(form, /친구 초대와 수락한 친구/)
  assert.match(parser, /parseFriendRecognitionName/)
  assert.match(route, /complete_minimum_signup_with_friend_name/)
  assert.match(route, /p_friend_recognition_name/)
  assert.match(form, /display_name/)
})

test('friend name and invite routes use user guards, trusted origins, hashed capabilities, and no-store output', () => {
  for (const path of [
    'app/api/profile/friend-name/route.ts',
    'app/api/friend-invites/route.ts',
    'app/api/friend-invites/[token]/route.ts',
    'app/api/friend-invites/[token]/accept/route.ts',
    'app/api/friend-invites/[token]/decline/route.ts',
    'app/api/friend-invites/by-id/[inviteId]/cancel/route.ts',
  ]) assert.ok(existsSync(resolve(path)), `${path} must exist`)
  const combined = [
    read('app/api/profile/friend-name/route.ts'),
    read('app/api/friend-invites/route.ts'),
    read('app/api/friend-invites/[token]/route.ts'),
    read('app/api/friend-invites/[token]/accept/route.ts'),
    read('app/api/friend-invites/[token]/decline/route.ts'),
    read('app/api/friend-invites/by-id/[inviteId]/cancel/route.ts'),
  ].join('\n')
  assert.match(combined, /requireRequestAccess/)
  assert.match(combined, /assertTrustedMutationOrigin/)
  assert.match(combined, /hashFriendInviteToken/)
  assert.match(combined, /private, no-store/)
  assert.doesNotMatch(combined, /service_role|SUPABASE_SERVICE_ROLE/)
})

test('friend URLs never carry private names and conversation APIs expose read cursors', () => {
  const friends = read('app/friends/page.tsx')
  const chatPage = read('app/friends/[id]/chat/page.tsx')
  const chatRoute = read('app/api/friends/[id]/chat/route.ts')
  const conversations = read('app/api/friends/conversations/route.ts')
  assert.doesNotMatch(friends, /\?name=/)
  assert.doesNotMatch(chatPage, /searchParams|get\(['"]name['"]\)/)
  assert.match(chatRoute, /next_cursor/)
  assert.match(chatRoute, /my_last_read_message_id/)
  assert.match(conversations, /get_my_friend_conversations/)
  assert.ok(existsSync(resolve('app/api/friends/[id]/chat/read/route.ts')))
})

test('friend UI connects conversations, retry-safe chat, share invites, and explicit voice invitations', () => {
  const friends = read('app/friends/page.tsx')
  const chat = read('components/friends/FriendChatRoom.tsx')
  const conversations = read('components/friends/ConversationList.tsx')
  assert.match(friends, /ConversationList/)
  assert.match(friends, /friend-invites/)
  assert.match(chat, /loadOlder/)
  assert.match(chat, /idempotency_key/)
  assert.match(chat, /\/api\/voice\/friend-invitations/)
  assert.match(chat, /\/api\/voice\/rules/)
  assert.match(chat, /\/api\/voice\/queue/)
  assert.match(chat, /마이크는 통화 화면에서 제가 직접 켭니다/)
  assert.match(chat, /\/community\/voice\/session\//)
  for (const source of [chat, conversations]) {
    assert.match(source, /createClient/)
    assert.match(source, /friend_conversation_revisions/)
    assert.match(source, /postgres_changes/)
    assert.match(source, /isFriendConversationInvalidation/)
    assert.match(source, /\.subscribe\(\)/)
    assert.match(source, /\.unsubscribe\(\)/)
  }
  assert.match(conversations, /setInterval\(wake, 8000\)/)
  assert.match(chat, /setInterval\(wake, 8000\)/)
})

test('SQL draft keeps names and cursors private while preserving accepted-request chat evidence', () => {
  const sql = read('docs/implementation/community-voice/g1-g2-schema.sql')
  assert.match(sql, /friend_recognition_name/i)
  assert.match(sql, /token_hash[^\n]+check/i)
  assert.doesNotMatch(sql, /raw_token\s+text/i)
  assert.match(sql, /friend_direct_message_read_cursors/i)
  assert.match(sql, /request\.status\s*=\s*'accepted'/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /revoke all on function/i)
  assert.match(sql, /active_friendship_required/i)
  assert.match(sql, /create table public\.friend_conversation_revisions/i)
  assert.match(sql, /alter publication supabase_realtime add table public\.friend_conversation_revisions/i)
  assert.match(sql, /auth\.uid\(\) in \(friendship_user_id,friendship_friend_user_id\)/i)
  const revisionTable = sql.match(
    /create table public\.friend_conversation_revisions\s*\(([\s\S]*?)\n\);/i,
  )?.[1] ?? ''
  assert.ok(revisionTable)
  assert.doesNotMatch(
    revisionTable,
    /\b(body|friend_recognition_name|display_name|message_id|sender_user_id)\b/i,
  )
})

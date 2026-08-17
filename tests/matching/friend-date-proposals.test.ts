import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function readSource(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

test('friend date proposals are active-friend-only, private, and stateful', () => {
  const migration = readSource('supabase/migrations/20260809213000_friend_date_proposals.sql')

  assert.match(migration, /CREATE TABLE public\.friend_date_proposals/i)
  assert.match(migration, /friendship_user_id UUID NOT NULL/i)
  assert.match(migration, /friendship_friend_user_id UUID NOT NULL/i)
  assert.match(migration, /FOREIGN KEY \(friendship_user_id, friendship_friend_user_id\)[\s\S]*REFERENCES public\.friendships/i)
  assert.match(migration, /status IN \('pending', 'accepted', 'declined', 'cancelled'\)/i)
  assert.match(migration, /kind IN \('meal', 'cafe', 'walk', 'custom'\)/i)
  assert.match(migration, /f\.status = 'active'/i)
  assert.match(migration, /REVOKE ALL ON public\.friend_date_proposals FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_friend_date_proposal/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.respond_friend_date_proposal/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_friend_date_proposals/i)
})

test('friend date proposal APIs support mobile bearer authentication and safe RPCs', () => {
  const collectionRoute = readSource('app/api/friend-date-proposals/route.ts')
  const responseRoute = readSource('app/api/friend-date-proposals/[id]/respond/route.ts')
  const cancelRoute = readSource('app/api/friend-date-proposals/[id]/cancel/route.ts')

  assert.match(collectionRoute, /createSupabaseRequestClient\(request\)/)
  assert.match(collectionRoute, /get_friend_date_proposals/)
  assert.match(collectionRoute, /create_friend_date_proposal/)
  assert.match(collectionRoute, /if \(!otherUserId\) return jsonError\('invalid_friend_user_id', 400\)/)
  assert.doesNotMatch(collectionRoute, /createSupabaseAdminClient/)
  assert.match(responseRoute, /createSupabaseRequestClient\(request\)/)
  assert.match(responseRoute, /respond_friend_date_proposal/)
  assert.match(cancelRoute, /createSupabaseRequestClient\(request\)/)
  assert.match(cancelRoute, /function isUuid\(value: string\): boolean/)
  assert.match(cancelRoute, /\[1-8\]\[0-9a-f\]\{3\}/i)
})

test('web friends can open a private date proposal screen', () => {
  const friendsPage = readSource('app/friends/page.tsx')
  const proposalPage = readSource('app/friends/[id]/page.tsx')

  assert.match(friendsPage, /href=\{`\/friends\/\$\{encodeURIComponent\(friend\.user_id\)\}/)
  assert.match(friendsPage, /href="#friend-list"/)
  assert.match(friendsPage, /href="#friend-search"/)
  assert.doesNotMatch(friendsPage, /href="\/group\/create"/)
  assert.match(proposalPage, /\/api\/friend-date-proposals\?friend_user_id=/)
  assert.match(proposalPage, /recipient_user_id/)
  assert.match(proposalPage, /\/respond/)
  assert.match(proposalPage, /\/cancel/)
  assert.match(proposalPage, /밥 먹을래요\?/)
  assert.match(proposalPage, /카페 갈래요\?/)
})

test('web chat hub lists actual match rooms instead of a static redirect card', () => {
  const chatPage = readSource('app/chat/page.tsx')

  assert.match(chatPage, /fetch\('\/api\/matches'/)
  assert.match(chatPage, /href=\{`\/match\/\$\{encodeURIComponent\(match\.match_id\)\}\/chat`\}/)
  assert.match(chatPage, /확정된 약속/)
})

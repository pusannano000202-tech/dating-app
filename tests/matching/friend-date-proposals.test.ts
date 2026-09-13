import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

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
  const chatHub = readSource('components/chat/ChatHub.tsx')
  const matchingRooms = readSource('components/chat/MatchingRoomsSection.tsx')

  assert.match(chatPage, /import ChatHub from '@\/components\/chat\/ChatHub'/)
  assert.match(chatPage, /return <ChatHub \/>/)
  assert.match(chatHub, /<OwnedChatHub key=\{account\} ownerId=\{account\}/)
  assert.match(chatHub, /tab==='matching'\?<MatchingRoomsSection\/>/)
  assert.match(matchingRooms, /fetch\('\/api\/matches',\{cache:'no-store'/)
  assert.match(matchingRooms, /href=\{'\/match\/'/)
  assert.match(matchingRooms, /매칭 · 확정된 약속/)
  assert.match(matchingRooms, /참여 권한·채팅 개방 시간 확인 후 입장/)
  assert.match(matchingRooms, /setRooms\(\[\]\);setStatus\('error'\)/)

  const filterSource = matchingRooms.match(/const allowed=payload\.matches\.filter[\s\S]*?(?=\r?\n   if\(ticket===epoch\.current\))/)?.[0]
  assert.ok(filterSource, 'the actual room projection validates confirmed or completed matches before rendering')
  const filterCode = ts.transpileModule(`${filterSource}\nreturn allowed`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const filter = new Function('payload', filterCode) as (payload: { matches: unknown[] }) => { match_id: string; match_status: string }[]
  const id = '11111111-1111-4111-8111-111111111111'
  const fixtures = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'].map(match_status => ({ match_id: id, match_status }))
  assert.deepEqual(filter({ matches: fixtures }).map(room => room.match_status), ['confirmed', 'completed'])
  assert.throws(() => filter({ matches: [{ match_id: '../admin', match_status: 'confirmed' }] }), /invalid/)
  const hrefExpression = matchingRooms.match(/href=\{('\/match\/'[^}]+)\}/)?.[1]
  assert.ok(hrefExpression, 'each actual matching card links to its existing chat route')
  const href = new Function('room', `return ${hrefExpression}`) as (room: { match_id: string }) => string
  assert.equal(href({ match_id: id }), `/match/${id}/chat`)
  assert.equal(href({ match_id: '../admin' }), '/match/..%2Fadmin/chat')
})

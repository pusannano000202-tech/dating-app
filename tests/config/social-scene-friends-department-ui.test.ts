import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('friends surface separates the directory from messages and keeps profile to direct-chat navigation', () => {
  const page = read('app/friends/page.tsx')
  const profile = read('app/friends/[id]/page.tsx')
  const chatHub = read('app/chat/page.tsx')
  const conversations = read('components/friends/ConversationList.tsx')
  const friendChat = read('components/friends/FriendChatRoom.tsx')
  assert.match(page, /친구\s*\(\d*\)?|>친구</)
  assert.match(page, />대화</)
  assert.match(page, /ConversationList/)
  assert.match(page, /FriendSceneBadge/)
  assert.match(page, /\/api\/friends\/scenes/)
  assert.ok(page.indexOf('<FriendDirectory') < page.indexOf('친구 추가·요청 관리'))
  assert.match(profile, /\/friends\/\$\{encodeURIComponent\(friendUserId\)\}\/chat/)
  assert.match(profile, /친구 1:1 채팅/)
  assert.match(chatHub, /약속 대화/)
  assert.match(chatHub, /친구 대화/)
  assert.match(chatHub, /ConversationList/)
  assert.match(chatHub, /\/api\/meetups/)
  assert.match(chatHub, /최근 모집에서 찾은 참여 모임/)
  assert.match(chatHub, /error \? null : loading/)
  assert.match(conversations, /!loading && !error/)
  assert.match(friendChat, /error \|\| access !== 'active'/)
  assert.match(friendChat, /친구 정보 확인 중/)
})

test('friend scene API returns a private minimal projection backed by a dedicated RPC', () => {
  const routePath = 'app/api/friends/scenes/route.ts'
  assert.equal(existsSync(routePath), true)
  const route = read(routePath)
  assert.match(route, /requireRequestAccess/)
  assert.match(route, /get_my_friend_scene_summaries/)
  assert.match(route, /friendPrivateJson/)
  assert.match(route, /parseFriendSceneList/)
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE_ROLE/)

  const migration = readdirSync('supabase/migrations').find((name) => /_friend_scene\.sql$/.test(name))
  assert.ok(migration, 'forward-only friend_scene migration must exist')
  const sql = read(`supabase/migrations/${migration}`)
  assert.match(sql, /friend_invites[\s\S]*direct_invite/i)
  assert.match(sql, /source_match_id[\s\S]*matching/i)
  assert.match(sql, /unclassified/i)
  assert.match(sql, /revoke all on function public\.get_my_friend_scene_summaries/i)
  assert.match(sql, /grant execute on function public\.get_my_friend_scene_summaries/i)
})

test('meetup hub opens a photo-led department challenge journey with real invite APIs', () => {
  const entryPath = 'components/meetups/DepartmentChallengeEntry.tsx'
  assert.equal(existsSync(entryPath), true)
  const entry = read(entryPath)
  const hub = read('components/meetups/MeetupHub.tsx')
  const challenge = read('components/community/department/DepartmentChallengeExperience.tsx')
  assert.match(entry, /PhotoSceneCarousel/)
  assert.match(entry, /images\/meetups\/meetup-gaming\.webp/)
  assert.match(entry, /social-scenes\/football\.png/)
  assert.match(entry, /LoL/)
  assert.match(hub, /DepartmentChallengeEntry/)
  assert.match(challenge, /종목 선택/)
  assert.match(challenge, /정원 슬롯/)
  assert.match(challenge, /친구 초대/)
  assert.match(challenge, /\/invites/)
  assert.match(challenge, /상대 학과/)
  assert.match(challenge, /일정/)
  assert.match(challenge, /createOpen/)
  assert.match(challenge, /우리 팀 만들기/)
  assert.match(challenge, /aria-label="모집 제목"/)
  assert.match(challenge, /loadError \?/)

  for (const routePath of [
    'app/api/community/department/challenges/[id]/invites/route.ts',
    'app/api/community/department/challenges/[id]/invites/[inviteId]/accept/route.ts',
  ]) {
    assert.equal(existsSync(routePath), true, `${routePath} must exist`)
    const route = read(routePath)
    assert.match(route, /assertTrustedMutationOrigin/)
    assert.match(route, /createSupabaseRequestClient/)
  }
})

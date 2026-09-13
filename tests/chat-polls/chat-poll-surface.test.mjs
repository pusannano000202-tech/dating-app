import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('activity chat exposes an accessible preview-before-publish poll composer and advisory agreement language', async () => {
  const chat = await readFile(new URL('../../components/meetups/ActivityRoomChat.tsx', import.meta.url), 'utf8')
  const board = await readFile(new URL('../../components/chat-polls/ActivityRoomPolls.tsx', import.meta.url), 'utf8')
  assert.match(chat, /<ActivityRoomPolls roomId=\{roomId\}/)
  for (const copy of [
    '채팅방에 투표 올리기', '미리보기', '투표 게시하기', '결과는 제안이에요',
    '일정', '장소', '역할', '자유 투표', '다시 시도', '합의 제안으로 고정', '이 버전 확인하기',
  ]) assert.match(board, new RegExp(copy))
  assert.match(board, /role="dialog"/)
  assert.match(board, /aria-modal="true"/)
})

test('chat poll API routes never accept caller-supplied actor ids', async () => {
  const paths = [
    '../../app/api/chat-polls/activity-rooms/[roomId]/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/vote/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/close/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/cancel/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/agreement/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/agreement/[agreementId]/confirm/route.ts',
  ]
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /actor_id|user_id/i, path)
    assert.match(source, /chatPollRpc|chatPollMutation/, path)
    assert.doesNotMatch(source, /request\.json/, path)
    assert.match(source, /withChatPollMutation/, path)
  }
})

test('one strict shared room-kind adapter serves existing and native collaboration rooms', async () => {
  const source = await readFile(new URL('../../app/api/chat-polls/[roomKind]/[roomId]/[[...action]]/route.ts', import.meta.url), 'utf8')
  const contract = await readFile(new URL('../../lib/chat-polls/contract.ts', import.meta.url), 'utf8')
  assert.match(source, /resolveChatPollRoomKind\(roomKind\)/)
  for (const kind of ['meetups', 'friends', 'department-challenges', 'league-teams', 'study-rooms', 'mentoring-rooms']) {
    assert.match(contract, new RegExp(`\\b${kind.replaceAll('-', '\\-')}\\b`))
  }
  for (const rpc of [
    'get_chat_room_polls', 'create_chat_room_poll', 'vote_chat_room_poll',
    'close_chat_room_poll', 'cancel_chat_room_poll',
    'propose_chat_room_poll_agreement', 'confirm_chat_room_poll_agreement',
  ]) assert.match(source, new RegExp(`'${rpc}'`))
  assert.doesNotMatch(source, /actor_id|user_id/i)
})

test('each authorized collaboration surface mounts the same server-backed poll board', async () => {
  const meetup = await readFile(new URL('../../components/meetups/MeetupDetailExperience.tsx', import.meta.url), 'utf8')
  const friend = await readFile(new URL('../../components/friends/FriendChatRoom.tsx', import.meta.url), 'utf8')
  const department = await readFile(new URL('../../components/community/department/DepartmentChallengeExperience.tsx', import.meta.url), 'utf8')
  assert.match(meetup, /<ActivityRoomPolls roomId=\{meetup\.id\} roomKind="meetups"/)
  assert.match(friend, /access === 'active'.*<ActivityRoomPolls roomId=\{friendUserId\} roomKind="friends"/s)
  assert.match(department, /<ActivityRoomPolls roomId=\{challenge\.id\} roomKind="department-challenges"/)
})

test('offline interaction fixture reuses the real poll board behind development and offline-ui guards', async () => {
  const page = await readFile(new URL('../../app/community/chat-polls-preview/page.tsx', import.meta.url), 'utf8')
  const fixture = await readFile(new URL('../../components/chat-polls/ChatPollOfflineFixture.tsx', import.meta.url), 'utf8')
  assert.match(page, /process\.env\.NODE_ENV !== 'development'/)
  assert.match(page, /process\.env\.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'/)
  assert.match(fixture, /실제 투표가 아니며 저장되지 않아요/)
  assert.match(fixture, /<ActivityRoomPolls[\s\S]*transport=\{transport\}/)
})

test('close and cancel use an accessible in-app confirmation instead of a blocking browser dialog', async () => {
  const board = await readFile(new URL('../../components/chat-polls/ActivityRoomPolls.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(board, /window\.confirm/)
  assert.match(board, /aria-labelledby="poll-status-confirmation-title"/)
  assert.match(board, /계속 투표하기/)
  assert.match(board, /투표 마감하기/)
  assert.match(board, /투표 취소하기/)
})

test('every mutation binds the account that loaded the board before invoking an RPC', async () => {
  const board = await readFile(new URL('../../components/chat-polls/ActivityRoomPolls.tsx', import.meta.url), 'utf8')
  const server = await readFile(new URL('../../lib/chat-polls/server.ts', import.meta.url), 'utf8')
  const routePaths = [
    '../../app/api/chat-polls/activity-rooms/[roomId]/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/vote/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/close/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/cancel/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/agreement/route.ts',
    '../../app/api/chat-polls/activity-rooms/[roomId]/[pollId]/agreement/[agreementId]/confirm/route.ts',
    '../../app/api/chat-polls/[roomKind]/[roomId]/[[...action]]/route.ts',
  ]
  assert.match(board, /expected_viewer_binding:\s*token\.viewerBinding/)
  assert.match(board, /onAuthStateChange/)
  assert.match(server, /safeViewerBindingEqual\(expectedViewerBinding, mutation\.viewerBinding\)/)
  assert.match(server, /request\.headers\.get\('X-Expected-Account'\)/)
  assert.ok(server.indexOf('safeViewerBindingEqual') < server.indexOf('client.rpc'), 'binding is checked before any RPC')
  for (const path of routePaths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /parseChatPollMutationEnvelope/, path)
    assert.match(source, /expectedViewerBinding/, path)
  }
})

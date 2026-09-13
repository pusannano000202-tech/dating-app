import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')

const targets = Object.freeze({
  activityRoom: 'components/meetups/ActivityRoomChat.tsx',
  meetup: 'components/meetups/MeetupDetailExperience.tsx',
  friend: 'components/friends/FriendChatRoom.tsx',
  department: 'components/community/department/DepartmentChallengeExperience.tsx',
})

test('all four real parent experiences open chatter-authored polls through the shared composer action', async () => {
  const entries = await Promise.all(Object.entries(targets).map(async ([name, path]) => [name, await source(path)]))
  for (const [name, code] of entries) {
    const shared=name==='activityRoom'||name==='meetup'
    assert.match(code, shared?/import SocialMessenger,\s*\{SocialChatComposer\}/:/import ChatComposerActions from '@\/components\/chat-polls\/ChatComposerActions'/, `${name} must use the shared plus action`)
    assert.match(code, /const \[pollComposerRequest, setPollComposerRequest\] = useState\(0\)/, `${name} needs a local open request counter`)
    assert.match(code, /composerRequest=\{pollComposerRequest\}/, `${name} must forward every request to its poll surface`)
    if(shared)assert.match(code, /<SocialChatComposer[^\n]+disabled=\{[^}]+\}[^\n]+onCreatePoll=\{[^\n]*setPollComposerRequest\(value=>value\+1\)/)
    else assert.match(code, /<ChatComposerActions[\s\S]{0,180}onCreatePoll=\{\(\) => setPollComposerRequest\(value => value \+ 1\)\}[\s\S]{0,180}disabled=\{[^}]+\}/, `${name} must keep the action disabled with its parent mutation state`)
  }
})

test('activity-room polls use the shared room menu and preserve the composer entry', async () => {
  const code = await source(targets.activityRoom)
  const messages = code.indexOf('<SocialMessenger')
  const polls = code.indexOf('<ActivityRoomPolls', messages)
  const composer = code.indexOf('<SocialChatComposer', polls)
  assert.ok(messages > 0 && polls > messages && composer > polls)
  assert.match(code,/tools=\{room\?<ActivityRoomPolls/)
  assert.equal(code.indexOf('<ActivityRoomPolls'), polls)
})

test('meetup uses shared menu polls and friend keeps its existing inline poll flow', async () => {
  const meetup = await source(targets.meetup)
  const meetupChat = meetup.indexOf('<SocialMessenger')
  const meetupPolls = meetup.indexOf('<ActivityRoomPolls', meetupChat)
  const meetupComposer = meetup.indexOf('<SocialChatComposer', meetupPolls)
  assert.ok(meetupChat > 0 && meetupPolls > meetupChat && meetupComposer > meetupPolls)
  assert.match(meetup,/tools=\{active&&!readOnly\?<ActivityRoomPolls/)

  const friend = await source(targets.friend)
  const friendMessages = friend.indexOf('aria-label={`${friendName}님과의 메시지`}')
  const friendPolls = friend.indexOf('<ActivityRoomPolls', friendMessages)
  const friendForm = friend.indexOf('<form onSubmit={send}', friendPolls)
  const friendAction = friend.indexOf('<ChatComposerActions', friendForm)
  const friendInput = friend.indexOf('<textarea', friendAction)
  assert.ok(friendMessages > 0 && friendPolls > friendMessages && friendForm > friendPolls && friendAction > friendForm && friendInput > friendAction)
  assert.equal(friend.indexOf('<ActivityRoomPolls'), friendPolls, 'friend chat must not retain the detached panel')
})

test('department challenge keeps polls by team discussion without inventing text chat', async () => {
  const code = await source(targets.department)
  const discussion = code.indexOf('팀 토론 투표')
  const action = code.indexOf('<ChatComposerActions', discussion)
  const polls = code.indexOf('<ActivityRoomPolls', action)
  assert.ok(discussion > 0 && action > discussion && polls > action)
  assert.doesNotMatch(code, /학과 대항 메시지|department[^\n]{0,40}\/chat/i)
})

test('a composer request made while polls load remains pending until the board is ready', async () => {
  const code = await source('components/chat-polls/ActivityRoomPolls.tsx')
  const effect = code.indexOf('if (!composerRequest || composerRequest === handledComposerRequest.current) return')
  const boardGuard = code.indexOf('if (!board)', effect)
  const consume = code.indexOf('handledComposerRequest.current = composerRequest', effect)
  assert.ok(effect > 0 && boardGuard > effect && consume > boardGuard, 'do not consume a request before the poll board exists')
})

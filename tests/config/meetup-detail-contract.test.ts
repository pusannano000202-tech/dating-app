import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { socialChatHref } from '../../lib/chat/social-room-presentation'

const read = (path: string) => readFileSync(path, 'utf8')

test('meetup detail exposes authenticated detail, chat, guide, and lifecycle routes', () => {
  const expected = [
    ['app/api/meetups/[id]/route.ts', 'get_my_activity_meetup_detail'],
    ['app/api/meetups/[id]/chat/route.ts', 'get_my_activity_meetup_chat'],
    ['app/api/meetups/[id]/guide/route.ts', 'get_my_activity_meetup_guide'],
    ['app/api/meetups/[id]/schedule/route.ts', 'update_my_activity_meetup_schedule'],
    ['app/api/meetups/[id]/cancel/route.ts', 'cancel_my_activity_meetup'],
    ['app/api/meetups/[id]/complete/route.ts', 'complete_my_activity_meetup'],
    ['app/api/meetups/[id]/help/route.ts', 'record_my_activity_meetup_personal_action'],
  ] as const

  for (const [path, rpc] of expected) {
    assert.equal(existsSync(path), true, `${path} must exist`)
    const source = read(path)
    assert.match(source, new RegExp(rpc))
    assert.match(source, /createSupabaseRequestClient/)
  }
  for (const path of expected.slice(1).map(([route]) => route)) {
    const source = read(path)
    if (!source.includes('export async function GET') || source.includes('export async function POST')) {
      assert.match(source, /assertTrustedMutationOrigin/)
    }
  }
})

test('meetup detail UI keeps host lifecycle separate from personal leave and offers real guide destinations', () => {
  const page = read('app/meetups/[id]/page.tsx')
  const experience = read('components/meetups/MeetupDetailExperience.tsx')
  const guide = read('components/meetups/LiveActivityGuide.tsx')

  assert.match(page, /MeetupDetailExperience/)
  assert.match(experience, /schedule/)
  assert.match(experience, /cancel/)
  assert.match(experience, /complete/)
  assert.match(experience, /\/join/)
  assert.match(experience, /개인 나가기/)
  assert.match(experience, /모임 전체 취소/)
  assert.match(experience, /meetup\.joined && !chatOnly[\s\S]*href=\{\(socialChatHref\(\{kind: 'meetup', id: meetup\.id\}\)/)
  assert.match(experience, /action === 'open_chat'[\s\S]*router\.push\(\(socialChatHref\(\{kind: 'meetup', id: meetup\.id\}\)/)
  const roomId = '11111111-1111-4111-8111-111111111111'
  assert.equal(socialChatHref({ kind: 'meetup', id: roomId }), `/chat/rooms/meetup/${roomId}`)
  assert.equal(socialChatHref({ kind: 'meetup', id: '../admin' }), null)
  const chatPage = read('app/chat/rooms/[kind]/[id]/page.tsx')
  const roomPage = read('components/chat/SocialChatRoomPage.tsx')
  assert.match(chatPage, /isSocialChatRoomKind\(kind\)/)
  assert.match(chatPage, /isChatUuid\(id\)/)
  assert.match(chatPage, /<SocialChatRoomPage kind=\{kind\} id=\{id\.toLowerCase\(\)\}/)
  assert.match(roomPage, /<MeetupDetailExperience meetupId=\{id\} chatOnly/)
  assert.match(experience, /if\(chatOnly&&meetup\.joined\)return <SocialMessenger/)
  assert.match(guide, /늦었어요/)
  assert.match(guide, /도움 요청/)
  assert.match(guide, /잠깐 쉬기/)
  assert.match(guide, /DalmutiRulesGuide/)
  assert.match(guide, /모임이 취소됐어요/)
})

test('meetup create and discovery preserve user-created rooms and expose school or department scope', () => {
  const route = read('app/api/meetups/route.ts')
  const form = read('components/meetups/CreateMeetupForm.tsx')
  const hub = read('components/meetups/MeetupHub.tsx')

  assert.match(route, /create_activity_meetup_v4/)
  assert.match(route, /list_activity_meetups_v4/)
  assert.match(form, /scope_type/)
  assert.match(form, /activity_key/)
  assert.match(form, /학교 전체/)
  assert.match(form, /내 학과/)
  assert.match(hub, /\/meetups\/\$\{meetup\.id\}/)
  assert.match(hub, /학과 대항/)
})

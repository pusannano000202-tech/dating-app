import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('room invitation notifications open the exact invite acceptance screen', () => {
  const notifications = readSource('app/notifications/page.tsx')

  assert.match(notifications, /quantum_event_room_invite/)
  assert.ok(notifications.includes('/match/invite/${encodeURIComponent(token)}'))
  assert.match(notifications, /같은 방 초대가 도착했어요/)
  assert.match(notifications, /15분/)
})

test('application cancellation exposes immediate pending feedback and returns home only after success', () => {
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(application, /신청을 취소하고 있어요/)
  assert.match(application, /aria-busy=\{saving\}/)
  assert.match(application, /취소 처리 중/)
  assert.match(application, /useRouter/)
  assert.match(application, /router\.replace\('\/'\)/)
  assert.doesNotMatch(application, /setState\('ready_to_apply'\)[\s\S]{0,240}신청을 취소했어요/)
  assert.match(application, /신청 취소에 실패했어요/)
  assert.match(application, /신청을 저장하고 있어요/)
})

test('room invite acceptance lets the invitee decline without joining the room', () => {
  const acceptScreen = readSource('components/matching/QuantumEventRoomInviteAccept.tsx')

  assert.match(acceptScreen, /event-room-invites\/decline/)
  assert.match(acceptScreen, /이번 초대 거절/)
  assert.match(acceptScreen, /초대를 거절했어요/)
  assert.match(acceptScreen, /decline_quantum_event_room_invite|declineInvite/)
  assert.match(acceptScreen, /disabled=\{busy\}/)
})

test('room invite acceptance has a peach-air development preview without saving', () => {
  const acceptScreen = readSource('components/matching/QuantumEventRoomInviteAccept.tsx')
  const invitePage = readSource('app/match/invite/[token]/page.tsx')
  const previewPage = readSource('app/dev/event-room-invite-preview/page.tsx')

  assert.match(acceptScreen, /preview\s*=\s*false/)
  assert.match(acceptScreen, /미리보기에서는 저장하지 않아요/)
  assert.match(acceptScreen, /bg-boot-coral/)
  assert.doesNotMatch(invitePage, /#EAF7F5/)
  assert.match(invitePage, /#FFF8F5/)
  assert.match(previewPage, /process\.env\.NODE_ENV\s*===\s*'production'/)
  assert.match(previewPage, /QuantumEventRoomInviteAccept/)
  assert.match(previewPage, /preview/)
})

test('participant pre-card dialog supports keyboard dismissal without exposing profiles', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(lobby, /event\.key === 'Escape'/)
  assert.match(lobby, /document\.body\.style\.overflow = 'hidden'/)
  assert.equal(
    lobby.match(/document\.body\.style\.overflow = 'hidden'/g)?.length,
    1,
    'only the dialog should own the body scroll lock',
  )
  assert.match(lobby, /document\.body\.style\.overflow = previousOverflow/)
  assert.match(lobby, /참가자를 누르면 얼굴 대신 사전 카드를 볼 수 있어요/)
  assert.doesNotMatch(lobby, /participant\.(?:photo|avatar|display_name|department|phone|appearance)/i)
})

test('development room preview can open the same safe pre-card shape immediately', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')
  const preview = readSource('app/dev/event-room-lobby-preview/page.tsx')

  assert.match(lobby, /initialCardOpen\s*=\s*false/)
  assert.match(lobby, /initialCardOpenedRef/)
  assert.match(preview, /initialCardOpen/)
  assert.match(preview, /실제 API와 같은 취향 카드 항목/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')

test('activity room keeps the combined guide in shared chat management', async () => {
  const code = await source('components/meetups/ActivityRoomChat.tsx')
  const messages = code.indexOf('<SocialMessenger')
  const management = code.indexOf('management={',messages)
  const guide = code.indexOf('<details className={styles.chatGuide}>')
  const summary = code.indexOf('약속과 모임 안내', guide)
  const hint = code.indexOf('먼저 이전 대화에서 약속을 확인해요', guide)
  const promptDeck = code.indexOf('<ActivityPromptDeck', guide)
  assert.ok(messages > 0 && management > messages && guide > management && summary > guide && hint > summary && promptDeck > hint)
  assert.doesNotMatch(code.slice(guide, summary), /\bopen=|\bdefaultOpen=/, 'the secondary guide must be closed by default')
})

test('activity room delegates the message scroll and composer to the common conversation', async () => {
  const code = await source('components/meetups/ActivityRoomChat.tsx')
  assert.match(code, /<SocialMessenger scope=\{roomId\} root=\{messagesRef\}/)
  assert.match(code, /composer=\{<SocialChatComposer/)
  assert.doesNotMatch(code,/role="log"|useLayoutEffect|className=\{styles\.messages\}/)
})

test('friend voice controls collapse but force open for invitations or an accepted session', async () => {
  const code = await source('components/friends/FriendChatRoom.tsx')
  const details = code.indexOf('<details open={voiceToolsOpen}')
  const summary = code.indexOf('음성 통화와 대화 약속', details)
  const rules = code.indexOf('voiceRulesChecked', summary)
  const chat = code.indexOf('aria-label={`${friendName}님과의 메시지`}', rules)
  assert.ok(details > 0 && summary > details && rules > summary && chat > rules)
  assert.match(code, /const voiceAttention = incomingVoice\.length > 0 \|\| Boolean\(voiceSessionId\)/)
  assert.match(code, /if \(voiceAttention\) setVoiceToolsOpen\(true\)/)
  assert.match(code, /if \(voiceAttention && !event\.currentTarget\.open\)/)
})

test('friend chat uses cream canvas, small quiet bubbles, and compact 16px input without moving polls', async () => {
  const code = await source('components/friends/FriendChatRoom.tsx')
  assert.match(code, /bg-\[#FFF8F3\]/)
  assert.match(code, /max-w-\[78%\][^`]*px-3 py-2/)
  assert.match(code, /bg-\[#F8E3D8\] text-boot-ink/)
  const composerSource = code.slice(code.indexOf('<form onSubmit={send}'))
  assert.match(composerSource, /rows=\{1\}/)
  assert.match(composerSource, /className="[^"]*text-base/)
  const messages = code.indexOf('aria-label={`${friendName}님과의 메시지`}')
  const polls = code.indexOf('<ActivityRoomPolls', messages)
  const composer = code.indexOf('<form onSubmit={send}', polls)
  assert.ok(messages > 0 && polls > messages && composer > polls)
})

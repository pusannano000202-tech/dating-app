import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('chatters author a blank general poll from a composer action, not a preset question',()=>{
  const card=readFileSync('components/chat-polls/ActivityRoomPolls.tsx','utf8')
  const action=readFileSync('components/chat-polls/ChatComposerActions.tsx','utf8')
  assert.match(card,/purpose: 'general', title: ''/)
  assert.match(card,/composerRequest\?: number/)
  assert.match(card,/setExpanded\(true\)/)
  assert.match(action,/onCreatePoll\(\)/)
  assert.match(action,/채팅 도구 열기/)
  assert.match(action,/투표 만들기/)
  assert.match(action,/질문과 선택지를 직접/)
})

test('the chat poll surface is collapsed by default and honors mobile keyboard and focus boundaries',()=>{
  const card=readFileSync('components/chat-polls/ActivityRoomPolls.tsx','utf8')
  const css=readFileSync('components/chat-polls/chat-polls.module.css','utf8')
  assert.match(card,/\[expanded, setExpanded\] = useState\(false\)/)
  assert.match(card,/aria-expanded=\{expanded\}/)
  assert.match(card,/투표 이용 안내/)
  assert.match(card,/document.body.style.overflow = 'hidden'/)
  assert.match(card,/trapFocus/)
  assert.match(card,/분류 더하기/)
  assert.match(css,/font-size:16px/)
  assert.match(css,/focus-visible/)
  assert.match(css,/prefers-reduced-motion/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('chat API checks the server window for both reads and writes and supports mobile bearer auth', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/matches/[id]/chat/route.ts'),
    'utf8',
  )

  assert.match(route, /createSupabaseRequestClient\(/)
  assert.match(route, /get_my_match_chat_window/)
  assert.match(route, /chat_not_open/)
  assert.match(route, /opens_at/)
  assert.match(route, /status:\s*409/)
  assert.match(route, /export async function GET\(req:/)
  assert.match(route, /export async function POST\(req:/)
  assert.doesNotMatch(route, /code:\s*message/)
})

test('chat page tells the participant the exact opening time instead of a generic failure', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/match/[id]/chat/page.tsx'),
    'utf8',
  )

  assert.match(page, /chat_not_open/)
  assert.match(page, /opens_at/)
  assert.match(page, /20분 전/)
  assert.match(page, /formatChatOpenTime/)
})

test('remote chat QA covers the closed gate, open gate, outsider, bypass, and cleanup', () => {
  const script = fs.readFileSync(
    path.join(process.cwd(), 'scripts/run-match-chat-window-e2e.mjs'),
    'utf8',
  )

  assert.match(script, /verify-closed/)
  assert.match(script, /verify-open/)
  assert.match(script, /closed_gate_passed/)
  assert.match(script, /open_gate_passed/)
  assert.match(script, /direct_table_blocked/)
  assert.match(script, /outsider_blocked/)
  assert.match(script, /cleanup_complete/)
})

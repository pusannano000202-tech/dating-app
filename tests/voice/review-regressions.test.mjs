import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('normal queue requests cannot trigger global provider cleanup', () => {
  const source = readFileSync('app/api/voice/queue/route.ts', 'utf8')
  assert.doesNotMatch(source, /drainVoiceMediaOutbox/)
  assert.match(source, /requireUuid\(b\.idempotencyKey\)/)
})

test('delayed operator rooms remain reschedulable', () => {
  const source = readFileSync('components/voice/VoiceOperatorConsole.tsx', 'utf8')
  assert.match(source, /\['scheduled', 'open', 'delayed'\]\.includes\(r\.status\)/)
})

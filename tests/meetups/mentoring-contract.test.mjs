import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMentoringCommand, parseMentoringSnapshot, classifyMentoringError } from '../../lib/mentoring/contract.ts'

test('mentoring command rejects actor injection and unbounded/non-JSON fields', () => {
  assert.ok(parseMentoringCommand({ action: 'join', args: { role: 'mentee', topic: 'courses' } }))
  assert.equal(parseMentoringCommand({ action: 'join', args: { role: 'mentee', topic: 'courses', user_id: crypto.randomUUID() } }), null)
  assert.equal(parseMentoringCommand({ action: 'status', args: {} }), null)
  assert.equal(parseMentoringCommand({ action: 'message', args: { session_id: crypto.randomUUID(), text: 'x'.repeat(1001), client_id: crypto.randomUUID() } }), null)
  assert.equal(parseMentoringCommand({ action: 'constructor', args: {} }), null)
  assert.equal(parseMentoringCommand({ action: 'report', args: { session_id: crypto.randomUUID(), reason: '' } }), null)
})
test('snapshot blocks identity or chat in unaccepted offers and maps errors safely', () => {
  const offer = { phase: 'offered', role: 'mentor', topic: 'courses', session_id: crypto.randomUUID(), expires_at: new Date().toISOString(), server_now: new Date().toISOString(), my_accepted: false, alias: null, peer_alias: null, messages: [], mentor_waiting: 0, mentee_waiting: 0 }
  assert.ok(parseMentoringSnapshot(offer))
  assert.equal(parseMentoringSnapshot({ ...offer, peer_alias: '공개 금지' }), null)
  assert.equal(parseMentoringSnapshot({ ...offer, messages: [{ id: crypto.randomUUID(), mine: false, text: '공개 금지', created_at: new Date().toISOString() }] }), null)
  assert.deepEqual(classifyMentoringError({ message: 'sensitive DB error' }), { error: 'unavailable', status: 503 })
  assert.deepEqual(classifyMentoringError({ message: 'mentoring_forbidden', code: '42501' }), { error: 'forbidden', status: 403 })
})

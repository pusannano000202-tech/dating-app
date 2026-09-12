import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAdmissionApplicationInput, parseAdmissionDepositQuote, parseAdmissionRoomTarget, validateAdmissionApplication } from '../../lib/meetups/admission-contract.ts'

const room = { kind: 'custom_meetup', id: '11111111-1111-4111-8111-111111111111' }
const quote = { id: '22222222-2222-4222-8222-222222222222', room, amountKrw: 17000, currency: 'KRW', policyVersion: 'room-policy-v1', expiresAt: '2026-09-12T12:30:00Z', paymentMethods: ['new'] }
const input = { intro: '같이 꾸준히 공부하고 싶어요.', strength: '풀이 설명을 도울게요.', paymentMethod: 'new', consent: true, policyVersion: quote.policyVersion, quoteId: quote.id, idempotencyKey: '33333333-3333-4333-8333-333333333333' }
const context = { room, quote, nowMs: Date.parse('2026-09-12T12:00:00Z') }

test('a configured server quote accepts an application without inventing payment or approval', () => {
  assert.deepEqual(validateAdmissionApplication(input, context), { ok: true, value: input })
  assert.equal(parseAdmissionDepositQuote(quote)?.amountKrw, 17000)
})
test('missing or malformed server policy never becomes a free or paid application', () => {
  assert.equal(validateAdmissionApplication(input, { ...context, quote: null }).error, 'deposit_policy_unavailable')
  for (const amountKrw of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseAdmissionDepositQuote({ ...quote, amountKrw }), null)
    assert.equal(validateAdmissionApplication(input, { ...context, quote: { ...quote, amountKrw } }).ok, false)
  }
})
test('request cannot inject amount, payment status, actor, room, or extra consent metadata', () => {
  for (const field of ['amountKrw', 'userId', 'payment', 'admission', 'room', 'providerPaymentKey', '__proto__']) {
    const payload = JSON.parse(JSON.stringify(input))
    Object.defineProperty(payload, field, { value: field === 'amountKrw' ? 1 : 'injected', enumerable: true })
    assert.equal(parseAdmissionApplicationInput(payload).ok, false, field)
  }
})
test('intro and strength are normalized and bounded without treating literal markup as commands', () => {
  const parsed = parseAdmissionApplicationInput({ ...input, intro: '  <함께> & 꾸준히  ', strength: '  ' })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.value.intro, '<함께> & 꾸준히')
  assert.equal(parsed.value.strength, '')
  for (const intro of ['', '   ', 'x'.repeat(81), null, 8]) assert.equal(parseAdmissionApplicationInput({ ...input, intro }).ok, false)
  for (const strength of ['x'.repeat(121), null, 7]) assert.equal(parseAdmissionApplicationInput({ ...input, strength }).ok, false)
  const { strength, ...withoutStrength } = input
  assert.equal(parseAdmissionApplicationInput(withoutStrength).ok, true)
})
test('explicit consent, method, quote, policy and retry identity are required', () => {
  for (const consent of [false, null, 1, 'true']) assert.equal(parseAdmissionApplicationInput({ ...input, consent }).ok, false)
  for (const paymentMethod of ['', 'mock', 'paid', null]) assert.equal(parseAdmissionApplicationInput({ ...input, paymentMethod }).ok, false)
  for (const field of ['quoteId', 'idempotencyKey']) for (const value of ['', '../other', 'not-a-uuid', null]) assert.equal(parseAdmissionApplicationInput({ ...input, [field]: value }).ok, false)
  for (const policyVersion of ['', ' ', 'x'.repeat(81), null]) assert.equal(parseAdmissionApplicationInput({ ...input, policyVersion }).ok, false)
})

test('introductions preserve existing Unicode character limits and reject hidden/control text', () => {
  assert.equal(parseAdmissionApplicationInput({ ...input, intro: '😀'.repeat(80), strength: '😀'.repeat(120) }).ok, true)
  assert.equal(parseAdmissionApplicationInput({ ...input, strength: '수비와\n패스' }).ok, true)
  for (const intro of ['😀'.repeat(81), '한줄\n금지', '제어\u0085문자', '숨김\u200b문자', '방향\u202e문자']) assert.equal(parseAdmissionApplicationInput({ ...input, intro }).ok, false)
  for (const strength of ['😀'.repeat(121), '강점\r금지', '제어\u0001문자', '숨김\u2060문자']) assert.equal(parseAdmissionApplicationInput({ ...input, strength }).ok, false)
})
test('wrong room, quote and changed policy are rejected against current server context', () => {
  assert.equal(validateAdmissionApplication({ ...input, quoteId: input.idempotencyKey }, context).error, 'deposit_quote_mismatch')
  assert.equal(validateAdmissionApplication(input, { ...context, room: { ...room, kind: 'study' } }).error, 'deposit_quote_mismatch')
  assert.equal(validateAdmissionApplication(input, { ...context, room: { ...room, id: input.idempotencyKey } }).error, 'deposit_quote_mismatch')
  assert.equal(validateAdmissionApplication({ ...input, policyVersion: 'old-policy' }, context).error, 'deposit_policy_changed')
})
test('expired quotes and an unknown server clock fail closed', () => {
  for (const nowMs of [Date.parse(quote.expiresAt), Date.parse(quote.expiresAt) + 1]) assert.equal(validateAdmissionApplication(input, { ...context, nowMs }).error, 'deposit_quote_expired')
  for (const nowMs of [NaN, Infinity, -1]) assert.equal(validateAdmissionApplication(input, { ...context, nowMs }).ok, false)
  assert.equal(parseAdmissionDepositQuote({ ...quote, expiresAt: '2026-09-12T12:30:00' }), null)
})
test('carryover is unavailable unless the server quote explicitly permits it', () => {
  const rollover = { ...input, paymentMethod: 'carryover' }
  assert.equal(validateAdmissionApplication(rollover, context).error, 'deposit_payment_method_unavailable')
  assert.equal(validateAdmissionApplication(rollover, { ...context, quote: { ...quote, paymentMethods: ['new', 'carryover'] } }).ok, true)
  for (const paymentMethods of [[], ['mock'], ['new', 'new'], null]) assert.equal(parseAdmissionDepositQuote({ ...quote, paymentMethods }), null)
})
test('same validated retry identity is preserved; validation does not claim persistence or idempotent settlement', () => {
  assert.deepEqual(validateAdmissionApplication(input, context), validateAdmissionApplication(input, context))
  assert.equal(validateAdmissionApplication(input, context).value.idempotencyKey, input.idempotencyKey)
})
test('room discriminator and identifiers cannot be broadened by extra properties', () => {
  assert.deepEqual(parseAdmissionRoomTarget(room), room)
  for (const bad of [null, [], { ...room, kind: 'wallet' }, { ...room, id: '/other' }, { ...room, userId: input.quoteId }]) assert.equal(parseAdmissionRoomTarget(bad), null)
  for (const bad of [null, [], { ...quote, currency: 'USD' }, { ...quote, userId: input.quoteId }]) assert.equal(parseAdmissionDepositQuote(bad), null)
})

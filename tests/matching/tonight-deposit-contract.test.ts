import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTonightDepositPaymentRequestDraft,
  isTonightDepositOrderIdForContext,
  normalizeTonightDepositReturnPath,
} from '../../lib/payments/tonight-deposit'

test('Tonight deposit order is bound to one application and user with dedicated callbacks', () => {
  const draft = buildTonightDepositPaymentRequestDraft({
    provider: 'toss',
    applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    origin: 'https://quantum.example',
    paymentState: 'v1.test-state',
  })

  assert.equal(draft.amount, 10_000)
  assert.equal(isTonightDepositOrderIdForContext(
    draft.orderId,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ), true)
  assert.equal(isTonightDepositOrderIdForContext(
    draft.orderId,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ), false)
  assert.match(draft.successUrl, /^https:\/\/quantum\.example\/api\/payments\/tonight-deposit\/confirm\?/)
  assert.match(draft.failUrl, /^https:\/\/quantum\.example\/api\/payments\/tonight-deposit\/cancel\?/)
  assert.equal(new URL(draft.successUrl).searchParams.get('application_id'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(new URL(draft.successUrl).searchParams.get('return_path'), '/tonight')
  assert.equal(new URL(draft.successUrl).searchParams.get('state'), 'v1.test-state')
})

test('Tonight payment return path cannot escape its user journey', () => {
  assert.equal(normalizeTonightDepositReturnPath('/tonight'), '/tonight')
  assert.equal(normalizeTonightDepositReturnPath('/tonight?payment=pending'), '/tonight?payment=pending')
  for (const unsafe of ['https://evil.example', '//evil.example', '/admin/tonight', '/partner/tonight']) {
    assert.equal(normalizeTonightDepositReturnPath(unsafe), '/tonight')
  }
})

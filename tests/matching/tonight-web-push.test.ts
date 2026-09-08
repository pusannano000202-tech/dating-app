import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTonightPushPayload,
  classifyTonightPushError,
  getTonightWebPushConfig,
  isAllowedTonightPushEndpoint,
  isTonightWebPushReady,
} from '../../lib/notifications/tonight-contract'

test('Tonight Web Push is disabled unless explicit feature flag and complete VAPID config exist', () => {
  const config = getTonightWebPushConfig({
    TONIGHT_NOTIFICATIONS_ENABLED: 'true',
    WEB_PUSH_VAPID_PUBLIC_KEY: 'p'.repeat(32),
    WEB_PUSH_VAPID_PRIVATE_KEY: 's'.repeat(32),
    WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
  })

  assert.equal(isTonightWebPushReady(config), true)
  assert.equal(isTonightWebPushReady({ ...config, enabled: false }), false)
})

test('Tonight push payload is generic and does not expose venue or user PII', () => {
  const payload = buildTonightPushPayload({
    notification_id: '00000000-0000-4000-8000-000000000001',
    event_type: 'venue_revealed',
    audience: 'participant',
  })

  assert.deepEqual(payload, {
    title: 'Quantum',
    body: '오늘밤 만나기 새 안내가 도착했어요. 앱에서 확인해 주세요.',
    url: '/tonight',
    notificationId: '00000000-0000-4000-8000-000000000001',
  })
  assert.doesNotMatch(JSON.stringify(payload), /address|phone|display_name|department|venue_name/i)
})

test('partner push opens the partner Tonight console', () => {
  const payload = buildTonightPushPayload({
    notification_id: '00000000-0000-4000-8000-000000000002',
    event_type: 'partner_acceptance_due',
    audience: 'partner',
  })

  assert.equal(payload.url, '/partner/tonight')
})

test('gone push endpoints are revoked while transient failures remain retryable', () => {
  assert.deepEqual(classifyTonightPushError({ statusCode: 410 }), {
    errorCode: 'push_http_410',
    revokeSubscription: true,
  })
  assert.deepEqual(classifyTonightPushError(new Error('timeout')), {
    errorCode: 'push_send_failed',
    revokeSubscription: false,
  })
})

test('Tonight only sends to browser-vendor Push Service endpoints', () => {
  assert.equal(isAllowedTonightPushEndpoint('https://fcm.googleapis.com/fcm/send/token'), true)
  assert.equal(isAllowedTonightPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/token'), true)
  assert.equal(isAllowedTonightPushEndpoint('https://web.push.apple.com/token'), true)
  assert.equal(isAllowedTonightPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=x'), true)

  assert.equal(isAllowedTonightPushEndpoint('https://127.0.0.1/push'), false)
  assert.equal(isAllowedTonightPushEndpoint('https://fcm.googleapis.com.attacker.example/push'), false)
  assert.equal(isAllowedTonightPushEndpoint('https://user@fcm.googleapis.com/fcm/send/token'), false)
  assert.equal(isAllowedTonightPushEndpoint('http://fcm.googleapis.com/fcm/send/token'), false)
})

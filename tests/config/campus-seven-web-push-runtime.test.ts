import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCampusSevenPushError,
  getCampusSevenWebPushConfig,
  isAuthorizedCampusSevenPushCron,
  isCampusSevenWebPushReady,
} from '../../lib/campus-seven/web-push'

const secret = 'a'.repeat(48)

test('web push is ready only with an explicit flag and complete VAPID config', () => {
  const config = getCampusSevenWebPushConfig({
    CAMPUS_SEVEN_NOTIFICATIONS_ENABLED: 'true',
    WEB_PUSH_VAPID_PUBLIC_KEY: 'p'.repeat(64),
    WEB_PUSH_VAPID_PRIVATE_KEY: 'k'.repeat(48),
    WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
    CAMPUS_SEVEN_PUSH_CRON_SECRET: secret,
  })

  assert.equal(isCampusSevenWebPushReady(config), true)
  assert.equal(isCampusSevenWebPushReady({ ...config, enabled: false }), false)
  assert.equal(isCampusSevenWebPushReady({ ...config, subject: 'ops@example.com' }), false)
  assert.equal(isCampusSevenWebPushReady({ ...config, privateKey: '' }), false)
})

test('cron authorization accepts only an exact bearer secret', () => {
  assert.equal(isAuthorizedCampusSevenPushCron(`Bearer ${secret}`, secret), true)
  assert.equal(isAuthorizedCampusSevenPushCron(`Bearer ${secret}x`, secret), false)
  assert.equal(isAuthorizedCampusSevenPushCron('Basic abc', secret), false)
  assert.equal(isAuthorizedCampusSevenPushCron(null, secret), false)
})

test('gone push endpoints are revoked while transient failures retry', () => {
  assert.deepEqual(classifyCampusSevenPushError({ statusCode: 404 }), {
    errorCode: 'push_http_404',
    revokeSubscription: true,
  })
  assert.deepEqual(classifyCampusSevenPushError({ statusCode: 410 }), {
    errorCode: 'push_http_410',
    revokeSubscription: true,
  })
  assert.deepEqual(classifyCampusSevenPushError({ statusCode: 503 }), {
    errorCode: 'push_http_503',
    revokeSubscription: false,
  })
  assert.deepEqual(classifyCampusSevenPushError(new Error('timeout')), {
    errorCode: 'push_send_failed',
    revokeSubscription: false,
  })
})

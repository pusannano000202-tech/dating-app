import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_REAUTH_MAX_AGE_MS,
  isRecentAccountAuthentication,
  parseAccountDeletionRequest,
  resolveVoiceCleanupStatus,
} from '../../lib/account/deletion-contract'

const KEY = '11111111-1111-4111-8111-111111111111'

test('account deletion requires the exact Korean confirmation and an idempotency key', () => {
  assert.deepEqual(parseAccountDeletionRequest({
    confirmation: ACCOUNT_DELETION_CONFIRMATION,
    idempotencyKey: KEY,
  }), { confirmation: ACCOUNT_DELETION_CONFIRMATION, idempotencyKey: KEY })

  for (const input of [
    null,
    {},
    { confirmation: 'delete', idempotencyKey: KEY },
    { confirmation: `${ACCOUNT_DELETION_CONFIRMATION} `, idempotencyKey: KEY },
    { confirmation: ACCOUNT_DELETION_CONFIRMATION, idempotencyKey: 'not-a-uuid' },
  ]) assert.equal(parseAccountDeletionRequest(input), null)
})

test('recent authentication is fail closed for missing, old, invalid, or future timestamps', () => {
  const now = Date.parse('2026-09-07T12:00:00.000Z')
  assert.equal(isRecentAccountAuthentication('2026-09-07T11:59:00.000Z', now), true)
  assert.equal(isRecentAccountAuthentication(new Date(now - ACCOUNT_REAUTH_MAX_AGE_MS).toISOString(), now), true)
  assert.equal(isRecentAccountAuthentication(new Date(now - ACCOUNT_REAUTH_MAX_AGE_MS - 1).toISOString(), now), false)
  assert.equal(isRecentAccountAuthentication(undefined, now), false)
  assert.equal(isRecentAccountAuthentication('invalid', now), false)
  assert.equal(isRecentAccountAuthentication(new Date(now + 31_000).toISOString(), now), false)
})

test('voice cleanup reports success only when no work failed or remains pending', () => {
  assert.equal(resolveVoiceCleanupStatus({ failed: 0, pending: false }), 'requested')
  assert.equal(resolveVoiceCleanupStatus({ failed: 1, pending: false }), 'retry_pending')
  assert.equal(resolveVoiceCleanupStatus({ failed: 0, pending: true }), 'retry_pending')
  assert.equal(resolveVoiceCleanupStatus({ failed: 1, pending: true }), 'retry_pending')
})

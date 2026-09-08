import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createContinuationFeeOrder,
  verifyContinuationFeeEvent,
} from '../../lib/payments/continuation-fee'
import { canIssueFriendRequestEntitlement } from '../../lib/matching/continuation-entitlement'
import { createContinuationOutboxMessage } from '../../lib/notifications/continuation-outbox'

const order = createContinuationFeeOrder({
  orderId: '10000000-0000-4000-8000-000000000001',
  ownerUserId: '20000000-0000-4000-8000-000000000001',
  transitionId: '30000000-0000-4000-8000-000000000001',
  purpose: 'next_occurrence',
  provider: 'local_verified_simulator',
})

test('continuation fee event requires authenticated provider truth and exact ownership fields', () => {
  assert.equal(order.amountKrw, 1000)
  assert.equal(order.currency, 'KRW')

  const verified = verifyContinuationFeeEvent(order, {
    eventId: 'evt-1',
    providerTransactionId: 'local-tx-1',
    orderId: order.orderId,
    ownerUserId: order.ownerUserId,
    transitionId: order.transitionId,
    purpose: order.purpose,
    amountKrw: 1000,
    currency: 'KRW',
    provider: order.provider,
    providerVerified: true,
  }, new Set())
  assert.deepEqual(verified, { ok: true, eventId: 'evt-1', providerTransactionId: 'local-tx-1' })

  assert.deepEqual(verifyContinuationFeeEvent(order, {
    eventId: 'evt-2', providerTransactionId: 'local-tx-2', orderId: order.orderId,
    ownerUserId: '20000000-0000-4000-8000-000000000099', transitionId: order.transitionId,
    purpose: order.purpose, amountKrw: 1000, currency: 'KRW', provider: order.provider,
    providerVerified: true,
  }, new Set()), { ok: false, error: 'payment_owner_mismatch' })

  assert.deepEqual(verifyContinuationFeeEvent(order, {
    eventId: 'evt-3', providerTransactionId: 'local-tx-3', orderId: order.orderId,
    ownerUserId: order.ownerUserId, transitionId: order.transitionId,
    purpose: order.purpose, amountKrw: 1000, currency: 'KRW', provider: order.provider,
    providerVerified: false,
  }, new Set()), { ok: false, error: 'provider_verification_failed' })

  assert.deepEqual(verifyContinuationFeeEvent(order, {
    eventId: 'evt-1', providerTransactionId: 'local-tx-1', orderId: order.orderId,
    ownerUserId: order.ownerUserId, transitionId: order.transitionId,
    purpose: order.purpose, amountKrw: 1000, currency: 'KRW', provider: order.provider,
    providerVerified: true,
  }, new Set(['evt-1'])), { ok: false, error: 'payment_event_replayed' })
})

test('friend request entitlement is separate and requires actual attendance plus its own paid purpose', () => {
  assert.equal(canIssueFriendRequestEntitlement({
    requesterPresent: true,
    targetPresent: true,
    feePurpose: 'friend_request',
    feeStatus: 'verified',
    alreadyFriends: false,
  }), true)
  assert.equal(canIssueFriendRequestEntitlement({
    requesterPresent: true,
    targetPresent: false,
    feePurpose: 'friend_request',
    feeStatus: 'verified',
    alreadyFriends: false,
  }), false)
  assert.equal(canIssueFriendRequestEntitlement({
    requesterPresent: true,
    targetPresent: true,
    feePurpose: 'next_occurrence',
    feeStatus: 'verified',
    alreadyFriends: false,
  }), false)
})

test('outbox payload is deduplicated and contains no private choice or contact data', () => {
  const message = createContinuationOutboxMessage({
    recipientUserId: order.ownerUserId,
    transitionId: order.transitionId,
    kind: 'transition_ready',
    revision: 3,
    deepLink: `/match/series/${order.transitionId}`,
  })
  assert.equal(message.dedupeKey, `transition_ready:${order.transitionId}:${order.ownerUserId}:3`)
  assert.doesNotMatch(JSON.stringify(message.payload), /choice|phone|contact|declined/i)
})


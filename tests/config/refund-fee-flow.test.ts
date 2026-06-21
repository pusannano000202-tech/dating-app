import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appFeeToRefundAmount,
  getAppFeeFlowDecision,
  MIN_PRIVATE_APP_FEE,
} from '../../lib/refund/fee-flow'

test('appFeeToRefundAmount converts user-facing app fee into backend refund amount', () => {
  assert.equal(appFeeToRefundAmount(0), 10000)
  assert.equal(appFeeToRefundAmount(3000), 7000)
  assert.equal(appFeeToRefundAmount(10000), 0)
  assert.equal(appFeeToRefundAmount(12000), 0)
})

test('getAppFeeFlowDecision accepts the full 10000원 deposit without extra confirmation', () => {
  assert.deepEqual(getAppFeeFlowDecision(10000), {
    kind: 'submit',
    normalizedAppFee: 10000,
    requiresPartnerZeroNotification: false,
  })
  assert.equal(MIN_PRIVATE_APP_FEE, 10000)
})

test('getAppFeeFlowDecision asks for the full deposit before accepting a lower app fee', () => {
  assert.deepEqual(getAppFeeFlowDecision(5000), {
    kind: 'ask_for_min_fee',
    normalizedAppFee: 5000,
    requiresPartnerZeroNotification: false,
  })
})

test('getAppFeeFlowDecision requires final zero notification confirmation for 0원', () => {
  assert.deepEqual(getAppFeeFlowDecision(0), {
    kind: 'ask_for_min_fee',
    normalizedAppFee: 0,
    requiresPartnerZeroNotification: true,
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appFeeToRefundAmount,
  getAppFeeFlowDecision,
  MIN_PRIVATE_APP_FEE,
} from '../../lib/refund/fee-flow'

test('appFeeToRefundAmount converts user-facing app fee into backend refund amount', () => {
  assert.equal(appFeeToRefundAmount(0, 10000), 10000)
  assert.equal(appFeeToRefundAmount(1000, 10000), 9000)
  assert.equal(appFeeToRefundAmount(3000, 10000), 7000)
  assert.equal(appFeeToRefundAmount(10000, 10000), 0)
})

test('getAppFeeFlowDecision accepts 3000원 이상 without begging', () => {
  assert.deepEqual(getAppFeeFlowDecision(3000), {
    kind: 'submit',
    normalizedAppFee: 3000,
    requiresPartnerZeroNotification: false,
  })
  assert.equal(MIN_PRIVATE_APP_FEE, 3000)
})

test('getAppFeeFlowDecision starts 애교 confirmation under 3000원', () => {
  assert.deepEqual(getAppFeeFlowDecision(2000), {
    kind: 'beg_for_3000',
    normalizedAppFee: 2000,
    requiresPartnerZeroNotification: false,
  })
})

test('getAppFeeFlowDecision requires final zero notification confirmation for 0원', () => {
  assert.deepEqual(getAppFeeFlowDecision(0), {
    kind: 'beg_for_3000',
    normalizedAppFee: 0,
    requiresPartnerZeroNotification: true,
  })
})

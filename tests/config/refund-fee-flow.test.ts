import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_FEE_BEG_STEPS,
  appFeeToRefundAmount,
  getAppFeeFlowDecision,
} from '../../lib/refund/fee-flow'

test('appFeeToRefundAmount converts user-facing app fee into backend refund amount', () => {
  assert.equal(appFeeToRefundAmount(0), 10000)
  assert.equal(appFeeToRefundAmount(3000), 7000)
  assert.equal(appFeeToRefundAmount(10000), 0)
  assert.equal(appFeeToRefundAmount(12000), 0)
})

test('getAppFeeFlowDecision accepts any positive app fee without extra confirmation', () => {
  assert.deepEqual(getAppFeeFlowDecision(10000), {
    kind: 'submit',
    normalizedAppFee: 10000,
    requiresPartnerZeroNotification: false,
  })
  assert.deepEqual(getAppFeeFlowDecision(5000), {
    kind: 'submit',
    normalizedAppFee: 5000,
    requiresPartnerZeroNotification: false,
  })
})

test('getAppFeeFlowDecision uses 3000-2000-1000 support asks before accepting 0원', () => {
  assert.deepEqual(APP_FEE_BEG_STEPS, [3000, 2000, 1000])
  assert.deepEqual(getAppFeeFlowDecision(0), {
    kind: 'ask_for_support',
    normalizedAppFee: 0,
    suggestedAppFees: [3000, 2000, 1000],
    requiresPartnerZeroNotification: true,
  })
})

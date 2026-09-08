import assert from 'node:assert/strict'
import test from 'node:test'

import { readLegalDisclosure } from '../../lib/account/legal-disclosure'

test('legal disclosure is publishable only when every operator field is configured', () => {
  assert.deepEqual(readLegalDisclosure({}), {
    publishable: false,
    operatorName: null,
    operatorAddress: null,
    operatorContact: null,
    privacyContact: null,
  })

  const configured = readLegalDisclosure({
    SERVICE_OPERATOR_NAME: 'Quantum Operator',
    SERVICE_OPERATOR_ADDRESS: 'Configured address',
    SERVICE_OPERATOR_CONTACT: 'support@example.test',
    PRIVACY_CONTACT: 'privacy@example.test',
  })
  assert.equal(configured.publishable, true)
  assert.equal(configured.operatorName, 'Quantum Operator')
})

test('placeholder-like and control-character values fail closed', () => {
  for (const value of ['TODO', '미정', 'example.com', 'bad\nvalue']) {
    assert.equal(readLegalDisclosure({
      SERVICE_OPERATOR_NAME: value,
      SERVICE_OPERATOR_ADDRESS: 'Configured address',
      SERVICE_OPERATOR_CONTACT: 'support@operator.test',
      PRIVACY_CONTACT: 'privacy@operator.test',
    }).publishable, false)
  }
})

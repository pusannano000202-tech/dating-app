import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getTonightFeatureState } from '../../lib/matching/tonight-ranked/runtime'

test('Tonight stays closed in production unless every required flag is explicit', () => {
  assert.deepEqual(getTonightFeatureState({ nodeEnv: 'production' }), {
    visible: false,
    applicationsOpen: false,
    cardPaymentsEnabled: false,
  })

  assert.deepEqual(getTonightFeatureState({
    nodeEnv: 'production',
    enabled: 'true',
    applicationsOpen: 'true',
    cardPaymentsEnabled: 'true',
  }), {
    visible: true,
    applicationsOpen: true,
    cardPaymentsEnabled: true,
  })
})

test('Tonight local UI is visible without silently opening applications or payments', () => {
  assert.deepEqual(getTonightFeatureState({ nodeEnv: 'development' }), {
    visible: true,
    applicationsOpen: false,
    cardPaymentsEnabled: false,
  })

  assert.equal(getTonightFeatureState({
    nodeEnv: 'production',
    enabled: 'true',
    applicationsOpen: 'false',
    cardPaymentsEnabled: 'true',
  }).cardPaymentsEnabled, false)
})

test('environment examples keep Tonight production gates closed by default', () => {
  for (const path of ['.env.example', '.env.local.example']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /^NEXT_PUBLIC_TONIGHT_ENABLED=false$/m)
    assert.match(source, /^TONIGHT_APPLICATIONS_OPEN=false$/m)
    assert.match(source, /^TONIGHT_CARD_PAYMENTS_ENABLED=false$/m)
  }
})

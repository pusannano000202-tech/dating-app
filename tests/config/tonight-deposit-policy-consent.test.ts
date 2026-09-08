import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT,
  TONIGHT_DEPOSIT_POLICY_HASH,
  TONIGHT_DEPOSIT_POLICY_VERSION,
} from '../../lib/payments/tonight-deposit-policy'

const read = (relativePath: string) => fs.existsSync(path.join(process.cwd(), relativePath))
  ? fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  : ''

test('Tonight deposit policy version and digest are stable and reviewable', () => {
  assert.equal(TONIGHT_DEPOSIT_POLICY_VERSION, '2026-09-03')
  assert.equal(
    createHash('sha256').update(TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT).digest('hex'),
    TONIGHT_DEPOSIT_POLICY_HASH,
  )
  assert.match(TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT, /10,000원/)
  assert.match(TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT, /정상 도착.*전액 환불/)
  assert.match(TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT, /미도착.*자동 몰수되지 않고.*수동 검토/)
  assert.match(TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT, /환불되지 않을 수/)
})

test('user checkout requires an explicit versioned deposit-policy consent', () => {
  const types = read('components/tonight/types.ts')
  const adapter = read('components/tonight/live-adapters.ts')
  const user = read('components/tonight/UserTonightExperience.tsx')
  const route = read('app/api/payments/tonight-deposit/route.ts')

  assert.match(types, /depositPolicyAccepted: true/)
  assert.match(types, /depositPolicyVersion: typeof TONIGHT_DEPOSIT_POLICY_VERSION/)
  assert.match(adapter, /deposit_policy_accepted: input\.depositPolicyAccepted/)
  assert.match(adapter, /deposit_policy_version: input\.depositPolicyVersion/)
  assert.match(adapter, /deposit_policy_hash: input\.depositPolicyHash/)
  assert.match(user, /TONIGHT_DEPOSIT_POLICY_ITEMS/)
  assert.match(user, /보증금 정책을 확인했으며 결제에 동의합니다/)
  assert.match(user, /disabled=\{!depositPolicyAccepted \|\| busy !== null\}/)
  assert.match(route, /'deposit_policy_accepted', 'deposit_policy_version', 'deposit_policy_hash'/)
  assert.match(route, /body\.deposit_policy_accepted !== true/)
  assert.match(route, /TONIGHT_DEPOSIT_POLICY_VERSION/)
  assert.match(route, /TONIGHT_DEPOSIT_POLICY_HASH/)
  assert.match(route, /accept_tonight_deposit_policy/)
})

test('forfeiture is described as a non-refund result instead of generic settlement', () => {
  const user = read('components/tonight/UserTonightExperience.tsx')
  const actionPolicy = read('components/tonight/user-action-policy.ts')
  assert.match(user, /forfeited: '보증금 몰수 · 환불되지 않음'/)
  assert.match(actionPolicy, /보증금이 몰수되어 환불되지 않았어요/)
})

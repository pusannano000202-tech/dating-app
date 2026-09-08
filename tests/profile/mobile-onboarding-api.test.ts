import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveProfileOnboardingStatus } from '../../lib/profile/onboarding-status'

const ROOT = process.cwd()

test('onboarding uses canonical minimum signup instead of legacy public profile fields', () => {
  assert.deepEqual(resolveProfileOnboardingStatus({ minimumSignupComplete: false, worldcupCompletedAt: null, photoCount: 0 }), { communityReady: false, isComplete: false, nextStep: 'basic' })
  assert.deepEqual(resolveProfileOnboardingStatus({ minimumSignupComplete: true, worldcupCompletedAt: null, photoCount: 0 }), { communityReady: true, isComplete: false, nextStep: 'worldcup' })
  assert.deepEqual(resolveProfileOnboardingStatus({ minimumSignupComplete: true, worldcupCompletedAt: '2026-09-05T00:00:00Z', photoCount: 0 }), { communityReady: true, isComplete: false, nextStep: 'photos' })
  assert.deepEqual(resolveProfileOnboardingStatus({ minimumSignupComplete: true, worldcupCompletedAt: '2026-09-05T00:00:00Z', photoCount: 1 }), { communityReady: true, isComplete: true, nextStep: 'complete' })
})

test('mobile onboarding route uses authoritative readiness and never returns a raw score', () => {
  const source = readFileSync(join(ROOT, 'app/api/profile/onboarding/route.ts'), 'utf8')
  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /get_my_profile_readiness/)
  assert.match(source, /minimum_signup_complete/)
  assert.match(source, /matching_ready/)
  assert.doesNotMatch(source, /score_raw|score_effective|score_normalized/)
})

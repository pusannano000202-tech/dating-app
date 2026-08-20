import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveProfileOnboardingStatus } from '../../lib/profile/onboarding-status'

const ROOT = process.cwd()

test('onboarding sends a new account to basic information first', () => {
  assert.deepEqual(
    resolveProfileOnboardingStatus({ profile: null, photoCount: 0 }),
    { isComplete: false, nextStep: 'basic' },
  )
})

test('onboarding advances through worldcup and photos without requiring a personality survey', () => {
  const basic = {
    display_name: '새벽',
    gender: 'female',
    age: 22,
    school: '부산대학교',
    appearance_type: null,
    worldcup_completed_at: null,
    big5_openness: null,
    big5_conscientiousness: null,
    big5_extraversion: null,
    big5_agreeableness: null,
    big5_neuroticism: null,
  }

  assert.equal(resolveProfileOnboardingStatus({ profile: basic, photoCount: 0 }).nextStep, 'worldcup')
  assert.equal(resolveProfileOnboardingStatus({
    profile: { ...basic, appearance_type: 'warm', worldcup_completed_at: '2026-08-09T00:00:00.000Z' },
    photoCount: 0,
  }).nextStep, 'photos')
})

test('completed users stay complete after signing in again', () => {
  assert.deepEqual(resolveProfileOnboardingStatus({
    profile: {
      display_name: '새벽',
      gender: 'female',
      age: 22,
      school: '부산대학교',
      appearance_type: 'warm',
      worldcup_completed_at: '2026-08-09T00:00:00.000Z',
      big5_openness: 0.6,
      big5_conscientiousness: 0.6,
      big5_extraversion: 0.6,
      big5_agreeableness: 0.6,
      big5_neuroticism: 0.6,
    },
    photoCount: 2,
  }), { isComplete: true, nextStep: 'complete' })
})

test('mobile onboarding route accepts Bearer sessions and never returns a raw score', () => {
  const source = readFileSync(join(ROOT, 'app/api/profile/onboarding/route.ts'), 'utf8')

  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /resolveProfileOnboardingStatus/)
  assert.doesNotMatch(source, /score_raw|score_effective|score_normalized/)
})

test('onboarding does not require Big5 answers once the required profile and photo are complete', () => {
  const status = resolveProfileOnboardingStatus({
    profile: {
      display_name: '새벽',
      gender: 'female',
      age: 22,
      school: '부산대학교',
      appearance_type: 'warm',
      worldcup_completed_at: '2026-08-09T00:00:00.000Z',
      big5_openness: 0.6,
      big5_conscientiousness: null,
      big5_extraversion: 0.6,
      big5_agreeableness: 0.6,
      big5_neuroticism: 0.6,
    },
    photoCount: 2,
  })

  assert.deepEqual(status, { isComplete: true, nextStep: 'complete' })
})

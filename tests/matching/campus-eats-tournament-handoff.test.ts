import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  applyBattleAction,
  createBracketSession,
  getNextPair,
} from '../../lib/campus-eats/bracket'
import { PNU_CAMPUS_EATS_CATEGORIES } from '../../lib/campus-eats/fixtures/pnu-categories'

const EXPECTED_CATEGORY_COUNTS = {
  donkatsu: 14,
  pizza: 12,
  chicken: 14,
  'coffee-main': 17,
  'coffee-north': 13,
  gukbap: 16,
  milmyeon: 8,
} as const

test('community handoff exposes 93 stores as 94 category cards', () => {
  const counts = Object.fromEntries(
    PNU_CAMPUS_EATS_CATEGORIES.map((category) => [category.id, category.candidates.length]),
  )
  const candidates = PNU_CAMPUS_EATS_CATEGORIES.flatMap((category) => category.candidates)

  assert.deepEqual(counts, EXPECTED_CATEGORY_COUNTS)
  assert.equal(candidates.length, 94)
  assert.equal(new Set(candidates.map((candidate) => candidate.canonicalStoreId)).size, 93)
})

test('every approved candidate has a deployable uncropped image and verified address', () => {
  let userProvidedImageCount = 0

  for (const category of PNU_CAMPUS_EATS_CATEGORIES) {
    assert.equal(new Set(category.candidates.map((candidate) => candidate.id)).size, category.candidates.length)
    for (const candidate of category.candidates) {
      assert.ok(candidate.roadAddress.trim(), `${candidate.name} is missing an address`)
      assert.ok(candidate.imageAlt.trim(), `${candidate.name} is missing image alt text`)
      assert.match(candidate.sourceSha256, /^[0-9a-f]{64}$/, `${candidate.name} has an invalid source hash`)
      assert.ok(
        candidate.imageSourceUrl === '사용자 직접 제공' || candidate.imageSourceUrl.startsWith('https://'),
        `${candidate.name} has an unsupported image source`,
      )
      if (candidate.imageSourceUrl === '사용자 직접 제공') userProvidedImageCount += 1
      assert.match(candidate.imageSrc ?? '', /^\/campus-eats\/restaurants\/.+\.webp$/)
      assert.ok(
        existsSync(join(process.cwd(), 'public', candidate.imageSrc as string)),
        `${candidate.name} is missing its public image`,
      )
    }
  }

  assert.equal(userProvidedImageCount, 7)
})

test('non-power-of-two restaurant brackets use byes and still require N-1 valid comparisons', () => {
  for (const candidateCount of [12, 13, 14, 17]) {
    const candidateIds = Array.from({ length: candidateCount }, (_, index) => `restaurant-${index + 1}`)
    let state = createBracketSession({ candidateIds })
    let eventSequence = 0

    while (state.status === 'active') {
      const pair = getNextPair(state)
      assert.ok(pair, `${candidateCount}-candidate bracket stalled while active`)
      eventSequence += 1
      const transition = applyBattleAction(state, {
        type: 'candidate_choice',
        eventId: `${candidateCount}-${eventSequence}`,
        pair,
        choice: 'both_visited_prefer_a',
      })
      assert.equal(transition.accepted, true)
      state = transition.state
    }

    assert.equal(state.status, 'completed')
    assert.equal(state.acceptedComparisonCount, candidateCount - 1)
  }
})
